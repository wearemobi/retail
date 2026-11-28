import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";

const apiMock = vi.hoisted(() => ({
  fetchBusinesses: vi.fn(),
  fetchPendingRetailOrders: vi.fn(),
  fetchProductBySku: vi.fn(),
  fetchProducts: vi.fn(),
  fetchCurrentShift: vi.fn(),
  resolveProductByBarcode: vi.fn(),
  syncOfflineSalesQueue: vi.fn(),
}));

const authMock = vi.hoisted(() => {
  const state = {
    token: "tok",
    businessId: "business-1",
    operatorId: "",
    operatorName: "",
    logout: vi.fn(),
    setBusinessId: vi.fn(),
  };
  const hook = Object.assign(
    (selector: (value: typeof state) => unknown) => selector(state),
    { getState: () => state, setState: vi.fn(), subscribe: vi.fn() },
  );
  return { hook };
});

vi.mock("@retail/common", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@retail/common")>();
  return { ...actual, playAdd: vi.fn(), playSuccess: vi.fn() };
});

vi.mock("../src/lib/api", () => ({
  WAREHOUSE_ID: "WH-MAIN",
  fetchBusinesses: apiMock.fetchBusinesses,
  fetchPendingRetailOrders: apiMock.fetchPendingRetailOrders,
  fetchProductBySku: apiMock.fetchProductBySku,
  fetchProducts: apiMock.fetchProducts,
  fetchCurrentShift: apiMock.fetchCurrentShift,
  resolveProductByBarcode: apiMock.resolveProductByBarcode,
  resolveTenantId: () => "tenant_test",
  getCurrentEmissionPoint: () => "M001",
  normalizeTaxType: (value: unknown) =>
    value === "EXEMPT" || value === "NON_SUBJECT" ? value : "TAXABLE",
  productUnitPrice: (product: { effective_price?: number | null; base_price?: number }) =>
    product.effective_price ?? product.base_price ?? 0,
  syncOfflineSalesQueue: apiMock.syncOfflineSalesQueue,
}));

vi.mock("../src/lib/offlineStore", () => ({
  listOfflineSales: () => [],
}));

vi.mock("../src/store/auth", () => ({
  storedBusinessId: () => "",
  useAuthStore: authMock.hook,
}));

vi.mock("../src/components/pos/CatalogGrid", () => ({
  default: ({ products }: { products: { name?: string }[] }) => (
    <div data-testid="catalog">
      {products.map((product) => (
        <span key={product.name}>{product.name}</span>
      ))}
    </div>
  ),
}));

vi.mock("../src/components/pos/CartPanel", () => ({ default: () => null }));
vi.mock("../src/components/pos/CheckoutDialog", () => ({ default: () => null }));
vi.mock("../src/components/pos/PendingOrdersDrawer", () => ({ default: () => null }));
vi.mock("../src/components/pos/ShiftDrawerDialog", () => ({ default: () => null }));
vi.mock("../src/components/pos/OfflineQueueDrawer", () => ({ default: () => null }));
vi.mock("../src/components/pos/DeviceSettingsDialog", () => ({ default: () => null }));

import PosScreen from "../src/components/pos/PosScreen";
import { useCartStore } from "../src/store/cart.store";

const products = [
  {
    id: "item-1",
    sku: "SKU-1",
    name: "Pupusa de frijol",
    category_id: "cat-1",
    category_name: "Principales",
    is_favorite: true,
  },
  {
    id: "item-2",
    sku: "SKU-2",
    name: "Gaseosa",
    category_id: "cat-2",
    category_name: "Bebidas",
    is_favorite: false,
  },
];

describe("PosScreen — catálogo y escaneo Retail (SPEC-W174)", () => {
  beforeEach(() => {
    window.localStorage.clear();
    useCartStore.getState().clear();
    vi.clearAllMocks();
    apiMock.fetchBusinesses.mockResolvedValue([]);
    apiMock.fetchPendingRetailOrders.mockResolvedValue([]);
    apiMock.fetchProductBySku.mockResolvedValue(null);
    apiMock.fetchProducts.mockResolvedValue(products);
    apiMock.fetchCurrentShift.mockResolvedValue(null);
    apiMock.resolveProductByBarcode.mockResolvedValue(null);
    apiMock.syncOfflineSalesQueue.mockResolvedValue([]);
  });

  afterEach(() => {
    cleanup();
    useCartStore.getState().clear();
  });

  it("filtra por categoría Retail y por favoritos", async () => {
    render(<PosScreen />);

    expect(await screen.findByTestId("catalog")).toHaveTextContent("Pupusa de frijol");

    fireEvent.click(screen.getByRole("button", { name: "Bebidas" }));
    await waitFor(() =>
      expect(apiMock.fetchProducts).toHaveBeenCalledWith(
        "",
        expect.objectContaining({ categoryId: "cat-2", onlyFavorites: false }),
      ),
    );

    fireEvent.click(screen.getByRole("button", { name: /Favoritos/ }));
    await waitFor(() =>
      expect(apiMock.fetchProducts).toHaveBeenCalledWith(
        "",
        expect.objectContaining({ categoryId: "cat-2", onlyFavorites: true }),
      ),
    );
  });

  it("suma pack_quantity al escanear un código de barras con Enter", async () => {
    apiMock.resolveProductByBarcode.mockResolvedValueOnce({
      product: {
        id: "item-1",
        sku: "SKU-1",
        name: "Pupusa de frijol",
        effective_price: 55000,
        tax_type: "EXEMPT",
        unit_of_measure: "59",
        is_weighable: false,
      },
      barcode: {
        code: "17411000123453",
        barcode_type: "ITF14",
        label: "Caja x12",
        pack_quantity: 120000,
        pack_quantity_units: 12,
      },
    });

    render(<PosScreen />);
    expect(await screen.findByTestId("catalog")).toBeTruthy();

    const input = screen.getByLabelText("Buscar producto o escanear código");
    fireEvent.change(input, { target: { value: "17411000123453" } });
    fireEvent.keyDown(input, { key: "Enter" });

    await waitFor(() =>
      expect(apiMock.resolveProductByBarcode).toHaveBeenCalledWith("17411000123453"),
    );
    await waitFor(() =>
      expect(useCartStore.getState().items[0]).toMatchObject({
        sku: "SKU-1",
        quantity: 120000,
        unitPrice: 55000,
        taxType: "EXEMPT",
      }),
    );
    expect(screen.getByRole("status")).toHaveTextContent(
      "+12 · Caja x12 — Pupusa de frijol",
    );
  });
});
