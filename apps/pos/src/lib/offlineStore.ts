import type { CheckoutRequest, Customer, OrderCheckoutRequest, Product } from "./api";

export type OfflineSaleKind = "POS_CHECKOUT" | "ORDER_CHECKOUT";

export interface OfflineSaleRecord {
  idempotencyKey: string;
  tenantId: string;
  kind: OfflineSaleKind;
  orderId?: string;
  payload: CheckoutRequest | OrderCheckoutRequest;
  total: number; // 10^-4 scale
  customerName?: string;
  customerTaxId?: string;
  documentType?: "01" | "03";
  paymentLabel?: string;
  receiptItems: { description: string; quantity: number; unitPrice: number; lineTotal: number }[];
  createdAt: string;
  status: "PENDING" | "ERROR";
  lastError?: string;
}

const CATALOG_PREFIX = "ware-pos.offline.catalog.";
const CUSTOMERS_PREFIX = "ware-pos.offline.customers.";
const QUEUE_PREFIX = "ware-pos.offline.queue.";

function canUseStorage(): boolean {
  return typeof window !== "undefined" && typeof window.localStorage !== "undefined";
}

function readJson<T>(key: string, fallback: T): T {
  if (!canUseStorage()) return fallback;
  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) return fallback;
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

function writeJson<T>(key: string, value: T): void {
  if (!canUseStorage()) return;
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // ignore quota/restricted storage
  }
}

function catalogKey(tenantId: string): string {
  return `${CATALOG_PREFIX}${tenantId}`;
}
function customersKey(tenantId: string): string {
  return `${CUSTOMERS_PREFIX}${tenantId}`;
}
function queueKey(tenantId: string): string {
  return `${QUEUE_PREFIX}${tenantId}`;
}

export function cacheCatalog(tenantId: string, products: Product[]): void {
  if (!tenantId) return;
  writeJson(catalogKey(tenantId), { updatedAt: new Date().toISOString(), products });
}

export interface CatalogCacheFilters {
  categoryId?: string;
  onlyFavorites?: boolean;
}

export function getCachedCatalog(
  tenantId: string,
  search = "",
  filters: CatalogCacheFilters = {},
): Product[] {
  if (!tenantId) return [];
  const data = readJson<{ products?: Product[] }>(catalogKey(tenantId), {});
  const term = search.trim().toLowerCase();
  let items = (data.products ?? []).filter(
    (p) => p.is_active !== false && p.status !== "INACTIVE",
  );
  if (filters.categoryId) {
    items = items.filter((p) => p.category_id === filters.categoryId);
  }
  if (filters.onlyFavorites) {
    items = items.filter((p) => p.is_favorite === true);
  }
  if (!term) return items;
  return items.filter((p) => {
    const name = (p.name ?? "").toLowerCase();
    const sku = (p.sku ?? "").toLowerCase();
    const barcode = (p.primary_barcode ?? "").toLowerCase();
    return name.includes(term) || sku.includes(term) || barcode.includes(term);
  });
}

export function cacheCustomers(tenantId: string, search: string, customers: Customer[]): void {
  if (!tenantId) return;
  const key = customersKey(tenantId);
  const data = readJson<{ entries?: Record<string, Customer[]> }>(key, {});
  const entries = data.entries ?? {};
  entries[search.trim().toLowerCase()] = customers;
  writeJson(key, { updatedAt: new Date().toISOString(), entries });
}

export function getCachedCustomers(tenantId: string, search: string): Customer[] {
  if (!tenantId) return [];
  const term = search.trim().toLowerCase();
  if (term.length < 2) return [];
  const data = readJson<{ entries?: Record<string, Customer[]> }>(customersKey(tenantId), {});
  const entries = data.entries ?? {};
  if (entries[term]) return entries[term];
  // Fallback: search across all cached entries.
  const all = Object.values(entries).flat();
  const seen = new Set<string>();
  return all.filter((c) => {
    const id = String(c.id ?? "");
    if (seen.has(id)) return false;
    const hay = `${c.legal_name ?? ""} ${c.commercial_name ?? ""} ${c.tax_id ?? ""}`.toLowerCase();
    if (!hay.includes(term)) return false;
    seen.add(id);
    return true;
  }).slice(0, 8);
}

export function listOfflineSales(tenantId: string): OfflineSaleRecord[] {
  if (!tenantId) return [];
  const records = readJson<OfflineSaleRecord[]>(queueKey(tenantId), []);
  return [...records].sort((a, b) => a.createdAt.localeCompare(b.createdAt));
}

export function enqueueOfflineSale(tenantId: string, record: OfflineSaleRecord): OfflineSaleRecord[] {
  if (!tenantId) return [];
  const records = listOfflineSales(tenantId);
  const idx = records.findIndex((r) => r.idempotencyKey === record.idempotencyKey);
  if (idx >= 0) records[idx] = record;
  else records.push(record);
  writeJson(queueKey(tenantId), records);
  return records;
}

export function removeOfflineSale(tenantId: string, idempotencyKey: string): OfflineSaleRecord[] {
  if (!tenantId) return [];
  const records = listOfflineSales(tenantId).filter((r) => r.idempotencyKey !== idempotencyKey);
  writeJson(queueKey(tenantId), records);
  return records;
}

export function markOfflineSaleError(tenantId: string, idempotencyKey: string, error: string): OfflineSaleRecord[] {
  if (!tenantId) return [];
  const records = listOfflineSales(tenantId).map((r) =>
    r.idempotencyKey === idempotencyKey ? { ...r, status: "ERROR" as const, lastError: error } : r,
  );
  writeJson(queueKey(tenantId), records);
  return records;
}

export function isNetworkError(err: unknown): boolean {
  if (typeof navigator !== "undefined" && navigator.onLine === false) return true;
  if (err instanceof TypeError) return true;
  const msg = err instanceof Error ? err.message.toLowerCase() : String(err).toLowerCase();
  return msg.includes("network") || msg.includes("failed to fetch") || msg.includes("load failed") || msg.includes("fetch");
}
