import { afterEach, describe, expect, it, vi } from "vitest";
import { createApiClient } from "@retail/common";

function unauthorizedResponse() {
  return new Response(
    JSON.stringify({
      type: "https://wearemobi.com/errors/unauthorized",
      title: "Unauthorized",
      status: 401,
      detail: "Invalid or expired session token",
      instance: "/v1/pos/checkout",
    }),
    { status: 401, headers: { "Content-Type": "application/problem+json" } },
  );
}

function makeClient(token: string | null, onUnauthorized: () => void) {
  return createApiClient({
    resolveTenantId: () => "tenant_demo_sv",
    getToken: () => token,
    onUnauthorized,
    baseUrl: "https://api.test",
  });
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("createApiClient — clean 401 handling (SPEC-WRTL1)", () => {
  it("invokes onUnauthorized when a POS endpoint rejects an active token", async () => {
    const fetchMock = vi.fn().mockResolvedValue(unauthorizedResponse());
    vi.stubGlobal("fetch", fetchMock);
    const onUnauthorized = vi.fn();

    const client = makeClient("sst.expired", onUnauthorized);
    const { error, response } = await client.GET("/v1/inventory/products", {
      params: { header: { "X-Tenant-Id": "tenant_demo_sv" } },
    });

    expect(response.status).toBe(401);
    expect(error).toBeTruthy();
    expect(onUnauthorized).toHaveBeenCalledTimes(1);
    const request = fetchMock.mock.calls[0][0] as Request;
    expect(request.headers.get("Authorization")).toBe("Bearer sst.expired");
    expect(request.headers.get("X-Tenant-Id")).toBe("tenant_demo_sv");
  });

  it("does not treat a rejected PIN as session expiry", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(unauthorizedResponse()));
    const onUnauthorized = vi.fn();

    const client = makeClient("sst.expired", onUnauthorized);
    const { response } = await client.POST("/v1/auth/login-pin", {
      params: { header: { "X-Tenant-Id": "tenant_demo_sv" } },
      body: { username: "cajero01", pin: "000000" },
    });

    expect(response.status).toBe(401);
    expect(onUnauthorized).not.toHaveBeenCalled();
  });

  it("deduplicates concurrent 401s for the same token", async () => {
    vi.stubGlobal("fetch", vi.fn().mockImplementation(async () => unauthorizedResponse()));
    const onUnauthorized = vi.fn();

    const client = makeClient("sst.expired", onUnauthorized);
    await Promise.all([
      client.GET("/v1/inventory/products", {
        params: { header: { "X-Tenant-Id": "tenant_demo_sv" } },
      }),
      client.GET("/v1/customers", {
        params: { header: { "X-Tenant-Id": "tenant_demo_sv" } },
      }),
      client.GET("/v1/inventory/products", {
        params: { header: { "X-Tenant-Id": "tenant_demo_sv" } },
      }),
    ]);

    expect(onUnauthorized).toHaveBeenCalledTimes(1);
  });
});
