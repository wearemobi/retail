import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import OfflineQueueDrawer from "./OfflineQueueDrawer";
import { enqueueOfflineSale, listOfflineSales, getCachedCatalog } from "../../lib/offlineStore";
import { fetchProducts, syncOfflineSalesQueue } from "../../lib/api";

const apiMock = vi.hoisted(() => ({
  get: vi.fn(),
  post: vi.fn(),
}));

vi.mock("@retail/common", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@retail/common")>();
  return {
    ...actual,
    createApiClient: () => ({ GET: apiMock.get, POST: apiMock.post }),
    parseApiError: (_err: unknown, fallback: string) => fallback,
    resolveTenantId: () => "tenant_test",
  };
});

vi.mock("../../store/auth", () => ({
  useAuthStore: {
    getState: () => ({ token: "tok", logout: vi.fn() }),
  },
}));

describe("SPEC-WRTL5 offline contingency", () => {
  beforeEach(() => {
    localStorage.clear();
    apiMock.get.mockReset();
    apiMock.post.mockReset();
    Object.defineProperty(window.navigator, "onLine", { value: true, configurable: true });
  });
  afterEach(() => cleanup());

  it("falls back to cached catalog when offline", async () => {
    // Prime cache with a successful fetch.
    apiMock.get.mockResolvedValueOnce({
      data: { items: [{ sku: "SKU1", name: "Cafe", is_active: true, unit_price: 10000 }] },
      error: null,
    });
    const online = await fetchProducts("");
    expect(online[0]?.sku).toBe("SKU1");

    // Offline fallback.
    Object.defineProperty(window.navigator, "onLine", { value: false, configurable: true });
    apiMock.get.mockRejectedValueOnce(new TypeError("Failed to fetch"));
    const offline = await fetchProducts("caf");
    expect(offline).toHaveLength(1);
    expect(offline[0]?.name).toBe("Cafe");
    expect(getCachedCatalog("tenant_test", "caf")[0]?.sku).toBe("SKU1");
  });

  it("enqueues sale in contingency with preserved Idempotency-Key", () => {
    enqueueOfflineSale("tenant_test", {
      idempotencyKey: "idem-123",
      tenantId: "tenant_test",
      kind: "POS_CHECKOUT",
      payload: {
        warehouse_id: "WH-MAIN",
        emission_point: "POS-01",
        payment_method: "01",
        document_type: "01",
        currency: "USD",
        items: [],
      } as any,
      total: 25000,
      documentType: "01",
      paymentLabel: "Efectivo",
      receiptItems: [{ description: "Cafe", quantity: 10000, unitPrice: 25000, lineTotal: 25000 }],
      createdAt: "2026-11-22T12:00:00Z",
      status: "PENDING",
    });

    const records = listOfflineSales("tenant_test");
    expect(records).toHaveLength(1);
    expect(records[0].idempotencyKey).toBe("idem-123");
    expect(records[0].status).toBe("PENDING");
  });

  it("syncs queued sales and clears queue preserving Idempotency-Key", async () => {
    enqueueOfflineSale("tenant_test", {
      idempotencyKey: "idem-sync",
      tenantId: "tenant_test",
      kind: "POS_CHECKOUT",
      payload: {
        warehouse_id: "WH-MAIN",
        emission_point: "POS-01",
        payment_method: "01",
        document_type: "01",
        currency: "USD",
        items: [],
      } as any,
      total: 10000,
      receiptItems: [],
      createdAt: "2026-11-22T12:00:00Z",
      status: "PENDING",
    });

    apiMock.post.mockResolvedValueOnce({ data: { order_id: "o1", total_paid: 10000 }, error: null });

    const result = await syncOfflineSalesQueue("tenant_test");
    expect(result.synced).toBe(1);
    expect(result.remaining).toBe(0);
    expect(listOfflineSales("tenant_test")).toHaveLength(0);
    expect(apiMock.post).toHaveBeenCalledWith(
      "/v1/pos/checkout",
      expect.objectContaining({
        params: expect.objectContaining({
          header: expect.objectContaining({ "Idempotency-Key": "idem-sync" }),
        }),
      }),
    );
  });

  it("renders offline queue drawer with sync action", () => {
    const onSync = vi.fn();
    render(
      <OfflineQueueDrawer
        open
        records={[
          {
            idempotencyKey: "idem-1",
            tenantId: "tenant_test",
            kind: "POS_CHECKOUT",
            payload: {} as any,
            total: 15000,
            customerName: "Ana",
            receiptItems: [],
            createdAt: "2026-11-22T12:00:00Z",
            status: "PENDING",
          },
        ]}
        syncing={false}
        onClose={vi.fn()}
        onSync={onSync}
      />,
    );
    expect(screen.getByText(/Cola de contingencia/i)).toBeInTheDocument();
    expect(screen.getByText(/Ana/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /Sincronizar Ahora/i }));
    expect(onSync).toHaveBeenCalled();
  });
});
