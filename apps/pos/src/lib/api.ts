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
