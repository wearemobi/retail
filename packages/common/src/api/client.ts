import createClient from "openapi-fetch";
import type { paths } from "./schema";

export type { paths } from "./schema";

export type Cashier = NonNullable<
  paths["/v1/auth/cashiers"]["get"]["responses"]["200"]["content"]["application/json"]["cashiers"]
>[number];

export type PinLoginResponse =
  paths["/v1/auth/login-pin"]["post"]["responses"]["200"]["content"]["application/json"];

const LOGIN_PIN_PATH = "/v1/auth/login-pin";

/** True when the request targets the PIN login endpoint itself. */
function isPinLoginRequest(url: string): boolean {
  try {
    return new URL(url).pathname === LOGIN_PIN_PATH;
  } catch {
    return url.split("?")[0].endsWith(LOGIN_PIN_PATH);
  }
}

export function createApiClient(options: {
  resolveTenantId: () => string;
  getToken: () => string | null;
  onUnauthorized?: () => void;
  baseUrl?: string;
}) {
  const envBaseUrl = (
    import.meta as unknown as { env?: { VITE_API_BASE_URL?: string } }
  ).env?.VITE_API_BASE_URL;

  const baseUrl = options.baseUrl ?? envBaseUrl ?? "https://api.mobiware.app";

  const client = createClient<paths>({
    baseUrl,
    fetch: (input: Request) => globalThis.fetch(input),
  });

  let lastRejectedToken: string | null = null;

  client.use({
    onRequest({ request }) {
      const tenantId = options.resolveTenantId();
      if (tenantId) {
        request.headers.set("X-Tenant-Id", tenantId);
      }
      const token = options.getToken();
      if (token) {
        request.headers.set("Authorization", `Bearer ${token}`);
      }
      return request;
    },
    onResponse({ request, response }) {
      if (response.status !== 401) {
        return response;
      }
      // A rejected PIN must surface as "PIN incorrecto", not as a session
      // expiry: the login screen intentionally holds no token.
      if (isPinLoginRequest(request.url)) {
        return response;
      }
      const token = options.getToken();
      if (!token || token === lastRejectedToken) {
        return response;
      }
      // Several requests may be in flight when the session dies; notify once
      // per token so polling cannot trigger repeated logout cascades.
      lastRejectedToken = token;
      options.onUnauthorized?.();
      return response;
    },
  });

  return client;
}

export type ApiClient = ReturnType<typeof createApiClient>;

export async function fetchCashiers(client: ApiClient, tenantId: string): Promise<Cashier[]> {
  const { data, error } = await client.GET("/v1/auth/cashiers", {
    params: { header: { "X-Tenant-Id": tenantId } },
  });
  if (error || !data) {
    throw new Error("No fue posible cargar los operadores de este tenant.");
  }
  return data.cashiers ?? [];
}

export async function loginWithPin(
  client: ApiClient,
  tenantId: string,
  username: string,
  pin: string,
): Promise<PinLoginResponse> {
  const { data, error, response } = await client.POST("/v1/auth/login-pin", {
    params: { header: { "X-Tenant-Id": tenantId } },
    body: { username, pin },
  });
  if (error || !data) {
    const detail =
      response.status === 401
        ? "PIN incorrecto para este operador."
        : "No fue posible iniciar sesión.";
    throw new Error(detail);
  }
  return data;
}

/**
 * Extracts a human-readable message from an RFC 7807 ProblemDetails payload
 * (or any unknown error value), keeping UI error handling consistent.
 */
export function parseApiError(error: unknown, fallback = "Ocurrió un error inesperado."): string {
  if (!error) return fallback;
  if (typeof error === "string") return error.trim() || fallback;
  if (typeof error === "object") {
    const problem = error as { detail?: unknown; title?: unknown; message?: unknown };
    for (const candidate of [problem.detail, problem.title, problem.message]) {
      if (typeof candidate === "string" && candidate.trim() !== "") {
        return candidate.trim();
      }
    }
  }
  return fallback;
}
