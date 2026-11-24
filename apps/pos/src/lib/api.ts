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
import { useAuthStore } from "../store/auth";
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

export type Product = NonNullable<InventoryResponse["items"]>[number];

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

export async function fetchProducts(search = ""): Promise<Product[]> {
  const term = search.trim();
  const tenantId = resolveTenantId();
  if (typeof navigator !== "undefined" && navigator.onLine === false) {
    return getCachedCatalog(tenantId, term);
  }
  try {
    const { data, error } = await api.GET("/v1/inventory/products", {
      params: {
        header: { "X-Tenant-Id": tenantId },
        query: {
          warehouse_id: WAREHOUSE_ID,
          vertical: "RETAIL",
          size: 200,
          sort: "name,asc",
          ...(term ? { search: term } : {}),
        },
      },
    });
    if (error || !data) {
      throw new Error(parseApiError(error, "No fue posible cargar el catálogo de productos."));
    }
    const items = (data.items ?? []).filter((product) => product.is_active !== false);
    // Cache the unfiltered full fetch; search fetches also warm cache opportunistically.
    if (!term) cacheCatalog(tenantId, items);
    else if (items.length > 0) {
      const existing = getCachedCatalog(tenantId, "");
      const map = new Map(existing.map((p) => [p.sku ?? "", p]));
      for (const p of items) map.set(p.sku ?? "", p);
      cacheCatalog(tenantId, Array.from(map.values()));
    }
    return items;
  } catch (err) {
    if (isNetworkError(err)) {
      return getCachedCatalog(tenantId, term);
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
  return data;
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
