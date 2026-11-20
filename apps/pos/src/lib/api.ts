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

export const TENANT_STORAGE_KEY = "ware-pos.tenant";
export const WAREHOUSE_ID = "WH-MAIN";
export const EMISSION_POINT = "POS-01";

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

export const RETAIL_APP_ID = "ware-retail";

export async function fetchCashiers(): Promise<Cashier[]> {
  return commonFetchCashiers(api, resolveTenantId());
}

export async function loginWithPin(username: string, pin: string): Promise<PinLoginResponse> {
  return commonLoginWithPin(api, resolveTenantId(), username, pin);
}

export async function fetchProducts(search = ""): Promise<Product[]> {
  const term = search.trim();
  const { data, error } = await api.GET("/v1/inventory/products", {
    params: {
      header: { "X-Tenant-Id": resolveTenantId() },
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
  return (data.items ?? []).filter((product) => product.is_active !== false);
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
  const { data, error } = await api.GET("/v1/customers", {
    params: {
      header: { "X-Tenant-Id": resolveTenantId() },
      query: { search: term, size: 8, sort: "legal_name,asc" },
    },
  });
  if (error || !data) {
    throw new Error(parseApiError(error, "No fue posible buscar clientes."));
  }
  return data.items ?? data.customers ?? [];
}

function newIdempotencyKey(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `pos-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

export async function submitCheckout(payload: CheckoutRequest): Promise<CheckoutResponse> {
  const { data, error } = await api.POST("/v1/pos/checkout", {
    params: {
      header: {
        "X-Tenant-Id": resolveTenantId(),
        "Idempotency-Key": newIdempotencyKey(),
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
export async function fetchPendingRetailOrders(search?: string): Promise<Order[]> {
  const term = (search ?? "").trim();
  const { data, error } = await api.GET("/v1/orders", {
    params: {
      header: { "X-Tenant-Id": resolveTenantId() },
      query: {
        app_id: RETAIL_APP_ID,
        payment_status: "UNPAID",
        page: 1,
        size: 50,
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

export function newOrderIdempotencyKey(): string {
  return newIdempotencyKey();
}
