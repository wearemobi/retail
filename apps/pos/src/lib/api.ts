import {
  createApiClient,
  fetchCashiers as commonFetchCashiers,
  loginWithPin as commonLoginWithPin,
  parseApiError,
  resolveTenantId as commonResolveTenantId,
  type Cashier,
  type PinLoginResponse,
  type paths,
} from "@retail/common";
import { storedBusinessId, useAuthStore } from "../store/auth";
import {
  cacheCatalog,
  cacheCustomers,
  getCachedCatalog,
  getCachedCustomers,
  isNetworkError,
  listOfflineSales,
  markOfflineSaleError,
  removeOfflineSale,
  type OfflineSaleRecord,
} from "./offlineStore";

import { getEmissionPoint as getStoredEmissionPoint } from "./emissionPoint";

export const TENANT_STORAGE_KEY = "ware-pos.tenant";
export const WAREHOUSE_ID = "WH-MAIN";

export function getCurrentEmissionPoint(): string {
  return getStoredEmissionPoint(resolveTenantId());
}

export function resolveTenantId(): string {
  return commonResolveTenantId(TENANT_STORAGE_KEY);
}

export const API_BASE_URL =
  (import.meta.env.VITE_API_BASE_URL as string | undefined) ??
  (import.meta.env.MODE === "development" ? "" : "https://api.mobiware.app");

export const api = createApiClient({
  resolveTenantId,
  getToken: () => useAuthStore.getState().token,
  onUnauthorized: () => useAuthStore.getState().logout(),
  baseUrl: API_BASE_URL,
});

export type { Cashier, PinLoginResponse };

export type InventoryResponse =
  paths["/v1/inventory/products"]["get"]["responses"]["200"]["content"]["application/json"];

export type TaxType = "TAXABLE" | "EXEMPT" | "NON_SUBJECT";
export type RetailStorageType = "AMBIENT" | "REFRIGERATED" | "FROZEN";

export interface Product {
  id?: string;
  sku?: string;
  name?: string;
  description?: string;
  category_id?: string | null;
  category_name?: string | null;
  image_file_id?: string | null;
  storage_type?: RetailStorageType;
  is_perishable?: boolean;
  shelf_life_days?: number | null;
  is_favorite?: boolean;
  base_price?: number;
  effective_price?: number | null;
  effective_price_usd?: number | null;
  stock_quantity?: number | null;
  stock?: number | null;
  is_active?: boolean;
  is_weighable?: boolean;
  unit_of_measure?: string;
  tax_type?: TaxType | string;
  primary_barcode?: string | null;
  status?: "ACTIVE" | "INACTIVE";
  track_inventory?: boolean;
  product_type?: string;
  sort_order?: number;
}

export type Customer = NonNullable<
  paths["/v1/customers"]["get"]["responses"]["200"]["content"]["application/json"]["items"]
>[number];

export type CustomersResponse =
  paths["/v1/customers"]["get"]["responses"]["200"]["content"]["application/json"];

export type CheckoutRequest =
  paths["/v1/pos/checkout"]["post"]["requestBody"]["content"]["application/json"];

export type CheckoutResponse =
  paths["/v1/pos/checkout"]["post"]["responses"]["200"]["content"]["application/json"];

type OrdersListPayload =
  paths["/v1/orders"]["get"]["responses"]["200"]["content"]["application/json"];

export type Order = NonNullable<OrdersListPayload["items"]>[number];

type OrderDetailPayload =
  paths["/v1/orders/{id}"]["get"]["responses"]["200"]["content"]["application/json"];

export type OrderDetailResponse = OrderDetailPayload;

export type OrderItem = NonNullable<OrderDetailPayload["items"]>[number];

export type OrderCheckoutRequest =
  paths["/v1/orders/{id}/checkout"]["post"]["requestBody"]["content"]["application/json"];

export type OrderCheckoutResponse =
  paths["/v1/orders/{id}/checkout"]["post"]["responses"]["200"]["content"]["application/json"];

export interface Business {
  id?: string;
  tenant_id?: string;
  name?: string;
  display_prefix?: string;
  status?: "ACTIVE" | "INACTIVE";
  created_at?: string;
  updated_at?: string;
}

// --- SPEC-W135 / WRTL4: Cash Shifts ---
export type ShiftStatus = "OPEN" | "CLOSED";
export type ShiftMovementType =
  | "CASH_IN"
  | "CASH_OUT"
  | "SALE_CASH"
  | "SALE_CARD"
  | "SALE_TRANSFER";

export interface CashShift {
  id: string;
  tenant_id?: string;
  business_id?: string;
  emission_point?: string;
  operator_id?: string;
  operator_name?: string;
  status: ShiftStatus;
  opening_cash: number;
  cash_sales?: number;
  card_sales?: number;
  transfer_sales?: number;
  cash_in?: number;
  cash_out?: number;
  expected_cash?: number;
  counted_cash?: number | null;
  difference_cash?: number | null;
  notes?: string;
  opened_at?: string;
  closed_at?: string | null;
  updated_at?: string;
}

export interface CashShiftMovement {
  id?: string;
  shift_id?: string;
  tenant_id?: string;
  movement_type: ShiftMovementType;
  amount: number;
  reason?: string;
  reference?: string;
  operator_id?: string;
  created_at?: string;
}

export interface CashShiftReport {
  shift: CashShift;
  movements?: CashShiftMovement[];
  movement_count?: number;
}

export const RETAIL_APP_ID = "ware-retail";

export async function fetchCashiers(): Promise<Cashier[]> {
  return commonFetchCashiers(api, resolveTenantId());
}

export async function loginWithPin(username: string, pin: string): Promise<PinLoginResponse> {
  return commonLoginWithPin(api, resolveTenantId(), username, pin);
}

type LooseGetClient = {
  GET: (
    url: string,
    options: {
      params: {
        header: { "X-Tenant-Id": string };
        query: Record<string, string | number | boolean | undefined>;
      };
    },
  ) => Promise<{ data?: unknown; error?: unknown }>;
};

export interface FetchProductsOptions {
  categoryId?: string;
  onlyFavorites?: boolean;
  businessId?: string;
}

export interface BarcodeLookup {
  product: Product;
  barcode: {
    id?: string;
    code: string;
    barcode_type?: string;
    label?: string;
    pack_quantity?: number;
    pack_quantity_units?: number;
    is_primary?: boolean;
  };
}

const looseGetApi = api as unknown as LooseGetClient;
const vaultImageCache = new Map<string, string>();

function normalizeProducts(data: unknown): Product[] {
  if (Array.isArray(data)) return data as Product[];
  if (data && typeof data === "object") {
    const record = data as { items?: unknown; products?: unknown };
    if (Array.isArray(record.items)) return record.items as Product[];
    if (Array.isArray(record.products)) return record.products as Product[];
  }
  return [];
}

function productCacheKey(product: Product): string {
  return product.sku || product.id || product.name || "";
}

function warmCatalogCache(tenantId: string, products: Product[]): void {
  if (products.length === 0) return;
  const map = new Map(getCachedCatalog(tenantId).map((product) => [productCacheKey(product), product]));
  for (const product of products) {
    const key = productCacheKey(product);
    if (key) map.set(key, product);
  }
  cacheCatalog(tenantId, Array.from(map.values()));
}

export function normalizeTaxType(value: unknown): TaxType {
  return value === "EXEMPT" || value === "NON_SUBJECT" ? value : "TAXABLE";
}

export function productUnitPrice(product: Product): number {
  return product.effective_price ?? product.base_price ?? 0;
}

function isNotFound(error: unknown): boolean {
  if (!error) return false;
  if (typeof error === "object") {
    const status = (error as { status?: unknown; statusCode?: unknown }).status ??
      (error as { statusCode?: unknown }).statusCode;
    if (status === 404 || status === "404") return true;
  }
  const message = error instanceof Error ? error.message : String(error);
  return /\b404\b/.test(message);
}

export async function fetchVaultDownloadUrl(fileId: string): Promise<string> {
  const cached = vaultImageCache.get(fileId);
  if (cached) return cached;
  const { data, error } = await looseGetApi.GET(`/v1/vault/files/${encodeURIComponent(fileId)}`, {
    params: { header: { "X-Tenant-Id": resolveTenantId() }, query: {} },
  });
  const downloadUrl =
    data && typeof data === "object" ? (data as { download_url?: unknown }).download_url : undefined;
  if (error || typeof downloadUrl !== "string" || !downloadUrl) {
    throw new Error(parseApiError(error, "No fue posible cargar la foto del producto."));
  }
  vaultImageCache.set(fileId, downloadUrl);
  return downloadUrl;
}

export async function fetchProducts(
  search = "",
  options: FetchProductsOptions = {},
): Promise<Product[]> {
  const term = search.trim();
  const tenantId = resolveTenantId();
  const cacheFilters = { categoryId: options.categoryId, onlyFavorites: options.onlyFavorites };
  if (typeof navigator !== "undefined" && navigator.onLine === false) {
    return getCachedCatalog(tenantId, term, cacheFilters);
  }
  try {
    const businessId =
      options.businessId || useAuthStore.getState().businessId || storedBusinessId(tenantId);
    const { data, error } = await looseGetApi.GET("/v1/retail/products", {
      params: {
        header: { "X-Tenant-Id": tenantId },
        query: {
          warehouse_id: WAREHOUSE_ID,
          business_id: businessId || undefined,
          category_id: options.categoryId || undefined,
          is_favorite: options.onlyFavorites ? true : undefined,
          size: 200,
          sort: "name,asc",
          ...(term ? { search: term } : {}),
        },
      },
    });
    if (error || !data) {
      throw new Error(parseApiError(error, "No fue posible cargar el catálogo de productos."));
    }
    const items = normalizeProducts(data).filter(
      (product) => product.is_active !== false && product.status !== "INACTIVE",
    );
    if (!term && !options.categoryId && !options.onlyFavorites) cacheCatalog(tenantId, items);
    else warmCatalogCache(tenantId, items);
    return items;
  } catch (err) {
    if (isNetworkError(err)) {
      return getCachedCatalog(tenantId, term, cacheFilters);
    }
    throw err;
  }
}

export async function fetchProductBySku(sku: string): Promise<Product | null> {
  const { data, error } = await api.GET("/v1/inventory/products/{sku}", {
    params: {
      header: { "X-Tenant-Id": resolveTenantId() },
      path: { sku },
      query: { warehouse_id: WAREHOUSE_ID },
    },
  });
  if (error || !data) return null;
  return data as Product;
}

export async function resolveProductByBarcode(code: string): Promise<BarcodeLookup | null> {
  const value = code.trim();
  if (!value) return null;
  let response: { data?: unknown; error?: unknown };
  try {
    response = await looseGetApi.GET(
      `/v1/inventory/products/by-barcode/${encodeURIComponent(value)}`,
      {
        params: {
          header: { "X-Tenant-Id": resolveTenantId() },
          query: { warehouse_id: WAREHOUSE_ID },
        },
      },
    );
  } catch (err) {
    if (isNotFound(err)) return null;
    throw new Error(parseApiError(err, "No fue posible resolver el código de barras."));
  }
  if (response.error) {
    if (isNotFound(response.error)) return null;
    throw new Error(
      parseApiError(response.error, "No fue posible resolver el código de barras."),
    );
  }
  const payload = response.data as { product?: unknown; barcode?: unknown } | undefined;
  if (!payload || !payload.product || typeof payload.product !== "object") return null;
  const rawBarcode =
    payload.barcode && typeof payload.barcode === "object"
      ? (payload.barcode as Record<string, unknown>)
      : {};
  return {
    product: payload.product as Product,
    barcode: {
      id: typeof rawBarcode.id === "string" ? rawBarcode.id : undefined,
      code: typeof rawBarcode.code === "string" ? rawBarcode.code : value,
      barcode_type:
        typeof rawBarcode.barcode_type === "string" ? rawBarcode.barcode_type : undefined,
      label: typeof rawBarcode.label === "string" ? rawBarcode.label : undefined,
      pack_quantity: typeof rawBarcode.pack_quantity === "number" ? rawBarcode.pack_quantity : undefined,
      pack_quantity_units:
        typeof rawBarcode.pack_quantity_units === "number" ? rawBarcode.pack_quantity_units : undefined,
      is_primary: typeof rawBarcode.is_primary === "boolean" ? rawBarcode.is_primary : undefined,
    },
  };
}

export async function fetchCustomers(search: string): Promise<Customer[]> {
  const term = search.trim();
  if (term.length < 2) return [];
  const tenantId = resolveTenantId();
  if (typeof navigator !== "undefined" && navigator.onLine === false) {
    return getCachedCustomers(tenantId, term);
  }
  try {
    const { data, error } = await api.GET("/v1/customers", {
      params: {
        header: { "X-Tenant-Id": tenantId },
        query: { search: term, size: 8, sort: "legal_name,asc" },
      },
    });
    if (error || !data) {
      throw new Error(parseApiError(error, "No fue posible buscar clientes."));
    }
    const items = data.items ?? data.customers ?? [];
    cacheCustomers(tenantId, term, items);
    return items;
  } catch (err) {
    if (isNetworkError(err)) {
      return getCachedCustomers(tenantId, term);
    }
    throw err;
  }
}

export function newOrderIdempotencyKey(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `pos-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

export type CreatePresaleOrderRequest = {
  business_id: string;
  request_id: string;
  organization_id?: string;
  order_type: "DINE_IN" | "TAKEAWAY" | "DELIVERY" | "ECOMMERCE" | "CALL_CENTER";
  source_channel?: "POS" | "WEB" | "KIOSK" | "PHONE" | "API" | "WHATSAPP" | "INSTAGRAM";
  app_id?: string;
  currency_code?: string;
  customer_id?: string;
  customer_name?: string;
  customer_tax_id?: string;
  emission_point?: string;
  warehouse_id?: string;
  notes?: string;
  items: Array<{
    sku: string;
    name?: string;
    quantity: number;
    unit_price: number;
    notes?: string;
  }>;
  payment_status?: string;
};

export async function createPresaleOrder(
  payload: CreatePresaleOrderRequest,
): Promise<Order> {
  const { data, error } = await api.POST("/v1/orders", {
    params: {
      header: { "X-Tenant-Id": resolveTenantId() },
    },
    body: payload as any,
  });
  if (error || !data) {
    throw new Error(parseApiError(error, "No se pudo crear la orden de preventa."));
  }
  return data;
}

export async function submitCheckout(
  payload: CheckoutRequest,
  idempotencyKey = newOrderIdempotencyKey(),
): Promise<CheckoutResponse> {
  const { data, error } = await api.POST("/v1/pos/checkout", {
    params: {
      header: {
        "X-Tenant-Id": resolveTenantId(),
        "Idempotency-Key": idempotencyKey,
      },
    },
    body: payload,
  });
  if (error || !data) {
    throw new Error(parseApiError(error, "No fue posible procesar la venta."));
  }
  return data;
}

/**
 * Pending Tienda orders from the Order Master (SPEC-WRTL2): only the
 * ware-retail app orders that still await payment are listed.
 */
export async function fetchPendingRetailOrders(
  search?: string,
  businessId?: string | null,
): Promise<Order[]> {
  const term = (search ?? "").trim();
  const business = (businessId ?? "").trim();
  const { data, error } = await api.GET("/v1/orders", {
    params: {
      header: { "X-Tenant-Id": resolveTenantId() },
      query: {
        app_id: RETAIL_APP_ID,
        payment_status: "UNPAID",
        page: 1,
        size: 50,
        ...(business ? { business } : {}),
        ...(term ? { search: term } : {}),
      },
    },
  });
  if (error || !data) {
    throw new Error(
      parseApiError(error, "No se pudieron cargar las órdenes pendientes."),
    );
  }
  return data.items ?? [];
}

export async function fetchOrderDetail(orderId: string): Promise<OrderDetailResponse> {
  const { data, error } = await api.GET("/v1/orders/{id}", {
    params: {
      header: { "X-Tenant-Id": resolveTenantId() },
      path: { id: orderId },
    },
  });
  if (error || !data) {
    throw new Error(
      parseApiError(error, "No se pudo cargar el detalle de la orden."),
    );
  }
  return data;
}

export async function submitOrderCheckout(
  orderId: string,
  payload: OrderCheckoutRequest,
  idempotencyKey: string,
): Promise<OrderCheckoutResponse> {
  const { data, error } = await api.POST("/v1/orders/{id}/checkout", {
    params: {
      header: {
        "X-Tenant-Id": resolveTenantId(),
        "Idempotency-Key": idempotencyKey,
      },
      path: { id: orderId },
    },
    body: payload,
  });
  if (error || !data) {
    throw new Error(parseApiError(error, "No se pudo liquidar la orden."));
  }
  return data;
}

// --- SPEC-WRTL4: shift API helpers (SPEC-W135 backend) ---
async function shiftFetch<T>(path: string, init: RequestInit = {}, fallback: string): Promise<T> {
  const token = useAuthStore.getState().token;
  const headers = new Headers(init.headers);
  headers.set("X-Tenant-Id", resolveTenantId());
  if (token) headers.set("Authorization", `Bearer ${token}`);
  if (init.body && !headers.has("Content-Type")) headers.set("Content-Type", "application/json");
  const response = await fetch(`${API_BASE_URL}${path}`, { ...init, headers });
  if (response.status === 401) {
    useAuthStore.getState().logout();
  }
  const text = await response.text();
  let data: unknown = null;
  if (text) {
    try {
      data = JSON.parse(text);
    } catch {
      data = text;
    }
  }
  if (!response.ok) {
    const err = new Error(parseApiError(data, fallback)) as Error & { status?: number };
    err.status = response.status;
    throw err;
  }
  return data as T;
}

export async function fetchCurrentShift(
  operatorId: string,
  emissionPoint = getCurrentEmissionPoint(),
): Promise<CashShift | null> {
  const qs = new URLSearchParams({ operator_id: operatorId, emission_point: emissionPoint });
  try {
    return await shiftFetch<CashShift>(`/v1/shifts/current?${qs.toString()}`, {}, "No se pudo consultar el turno actual.");
  } catch (err) {
    if ((err as { status?: number })?.status === 404) return null;
    throw err;
  }
}

export async function openShift(input: {
  business_id?: string;
  emission_point?: string;
  operator_id: string;
  operator_name: string;
  opening_cash: number;
  notes?: string;
}): Promise<CashShift> {
  return shiftFetch<CashShift>("/v1/shifts/open", { method: "POST", body: JSON.stringify(input) }, "No se pudo abrir el turno.");
}

export async function recordShiftMovement(
  shiftId: string,
  input: {
    movement_type: "CASH_IN" | "CASH_OUT";
    amount: number;
    reason: string;
    reference?: string;
    operator_id?: string;
  },
): Promise<{ shift: CashShift; movement: CashShiftMovement }> {
  return shiftFetch<{ shift: CashShift; movement: CashShiftMovement }>(
    `/v1/shifts/${shiftId}/movements`,
    { method: "POST", body: JSON.stringify(input) },
    "No se pudo registrar el movimiento.",
  );
}

export async function fetchShiftReport(shiftId: string): Promise<CashShiftReport> {
  return shiftFetch<CashShiftReport>(`/v1/shifts/${shiftId}/report`, {}, "No se pudo obtener el corte de caja.");
}

export async function closeShift(
  shiftId: string,
  input: { counted_cash: number; notes?: string },
): Promise<{ shift: CashShift; report: CashShiftReport }> {
  return shiftFetch<{ shift: CashShift; report: CashShiftReport }>(
    `/v1/shifts/${shiftId}/close`,
    { method: "POST", body: JSON.stringify(input) },
    "No se pudo cerrar el turno.",
  );
}



/** GET /v1/orders/businesses (the OpenAPI document only types POST today). */
export async function fetchBusinesses(): Promise<Business[]> {
  const { data, error } = await (api as any).GET("/v1/orders/businesses", {
    params: { header: { "X-Tenant-Id": resolveTenantId() } },
  });
  if (error) {
    throw new Error(parseApiError(error, "No se pudieron cargar los negocios."));
  }
  if (Array.isArray(data)) return data as Business[];
  if (Array.isArray(data?.items)) return data.items as Business[];
  return [];
}


export function isApiNetworkError(err: unknown): boolean {
  return isNetworkError(err);
}

export async function syncOfflineSalesQueue(
  tenantId = resolveTenantId(),
): Promise<{ synced: number; remaining: number; errors: string[] }> {
  const records = listOfflineSales(tenantId);
  let synced = 0;
  const errors: string[] = [];
  for (const record of records) {
    try {
      const occurredAt = record.createdAt ?? new Date().toISOString();
      if (record.kind === "POS_CHECKOUT") {
        await submitCheckout({ ...(record.payload as any), occurred_at: occurredAt } as CheckoutRequest, record.idempotencyKey);
      } else if (record.kind === "ORDER_CHECKOUT" && record.orderId) {
        await submitOrderCheckout(record.orderId, { ...(record.payload as any), occurred_at: occurredAt } as OrderCheckoutRequest, record.idempotencyKey);
      } else {
        throw new Error("Registro offline inválido.");
      }
      removeOfflineSale(tenantId, record.idempotencyKey);
      synced += 1;
    } catch (err) {
      const message = err instanceof Error ? err.message : "Error de sincronización";
      markOfflineSaleError(tenantId, record.idempotencyKey, message);
      errors.push(message);
      if (isNetworkError(err)) break;
    }
  }
  return { synced, remaining: listOfflineSales(tenantId).length, errors };
}

export type { OfflineSaleRecord };
