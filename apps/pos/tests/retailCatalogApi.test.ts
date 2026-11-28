import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  fetchProducts,
  fetchVaultDownloadUrl,
  normalizeTaxType,
  resolveProductByBarcode,
} from "../src/lib/api";
import { getCachedCatalog } from "../src/lib/offlineStore";

const apiMock = vi.hoisted(() => ({ get: vi.fn() }));

vi.mock("@retail/common", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@retail/common")>();
  return {
    ...actual,
    createApiClient: () => ({ GET: apiMock.get, POST: vi.fn() }),
    parseApiError: (_error: unknown, fallback: string) => fallback,
    resolveTenantId: () => "tenant_test",
  };
});

vi.mock("../src/store/auth", () => ({
  storedBusinessId: () => "",
  useAuthStore: {
    getState: () => ({ token: "tok", businessId: "business-1", logout: vi.fn() }),
  },
}));

const retailProduct = {
  id: "item-1",
  sku: "SKU-1",
  name: "Café molido",
  category_id: "cat-1",
  category_name: "Bebidas",
  image_file_id: "vault-1",
  storage_type: "AMBIENT",
  is_favorite: true,
  is_perishable: false,
  tax_type: "EXEMPT",
  effective_price: 55000,
  primary_barcode: "7411000123456",
  is_active: true,
};

describe("Comanda Retail catálogo y barras (SPEC-W174)", () => {
  beforeEach(() => {
    localStorage.clear();
    apiMock.get.mockReset();
    Object.defineProperty(window.navigator, "onLine", { value: true, configurable: true });
  });

  it("consume /v1/retail/products con negocio, categoría, favoritos y búsqueda", async () => {
    apiMock.get.mockResolvedValueOnce({ data: { items: [retailProduct] }, error: null });

    const items = await fetchProducts("caf", { categoryId: "cat-1", onlyFavorites: true });

    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({
      sku: "SKU-1",
      image_file_id: "vault-1",
      storage_type: "AMBIENT",
      is_favorite: true,
      tax_type: "EXEMPT",
      effective_price: 55000,
      primary_barcode: "7411000123456",
    });

    const [url, options] = apiMock.get.mock.calls[0];
    expect(String(url)).toContain("/v1/retail/products");
    expect(options.params.header["X-Tenant-Id"]).toBe("tenant_test");
    expect(options.params.query).toMatchObject({
      warehouse_id: "WH-MAIN",
      business_id: "business-1",
      category_id: "cat-1",
      is_favorite: true,
      search: "caf",
      size: 200,
    });
  });

  it("resuelve un código de barras con pack_quantity escalado", async () => {
    apiMock.get.mockResolvedValueOnce({
      data: {
        product: retailProduct,
        barcode: {
          id: "barcode-1",
          code: "17411000123453",
          barcode_type: "ITF14",
          label: "Caja x12",
          pack_quantity: 120000,
          pack_quantity_units: 12,
        },
      },
      error: null,
    });

    const lookup = await resolveProductByBarcode("17411000123453");

    expect(lookup?.product.sku).toBe("SKU-1");
    expect(lookup?.barcode.pack_quantity).toBe(120000);
    expect(lookup?.barcode.label).toBe("Caja x12");
    const [url, options] = apiMock.get.mock.calls[0];
    expect(String(url)).toContain("/v1/inventory/products/by-barcode/17411000123453");
    expect(options.params.query).toMatchObject({ warehouse_id: "WH-MAIN" });
  });

  it("devuelve null en 404 para permitir fallback a búsqueda normal", async () => {
    apiMock.get.mockResolvedValueOnce({ data: null, error: { status: 404 } });

    await expect(resolveProductByBarcode("sin-codigo")).resolves.toBeNull();
  });

  it("cachea la URL de descarga de Vault por archivo", async () => {
    apiMock.get.mockResolvedValue({
      data: { download_url: "/edge/vault/download?ticket=t1" },
      error: null,
    });

    const first = await fetchVaultDownloadUrl("vault-1");
    const second = await fetchVaultDownloadUrl("vault-1");

    expect(first).toBe("/edge/vault/download?ticket=t1");
    expect(second).toBe(first);
    expect(apiMock.get).toHaveBeenCalledTimes(1);
    expect(String(apiMock.get.mock.calls[0][0])).toContain("/v1/vault/files/vault-1");
  });

  it("conserva los nuevos campos en caché y filtra favoritos/categoría sin conexión", async () => {
    apiMock.get.mockResolvedValueOnce({
      data: {
        items: [
          retailProduct,
          { ...retailProduct, id: "item-2", sku: "SKU-2", category_id: "cat-2", is_favorite: false },
        ],
      },
      error: null,
    });

    await fetchProducts("");
    expect(getCachedCatalog("tenant_test")[0]).toMatchObject({
      image_file_id: "vault-1",
      storage_type: "AMBIENT",
      is_favorite: true,
      tax_type: "EXEMPT",
      primary_barcode: "7411000123456",
    });

    Object.defineProperty(window.navigator, "onLine", { value: false, configurable: true });
    const offline = await fetchProducts("", { categoryId: "cat-1", onlyFavorites: true });

    expect(offline).toHaveLength(1);
    expect(offline[0]?.sku).toBe("SKU-1");
  });

  it("normaliza tax_type desconocido como TAXABLE", () => {
    expect(normalizeTaxType(undefined)).toBe("TAXABLE");
    expect(normalizeTaxType("EXEMPT")).toBe("EXEMPT");
    expect(normalizeTaxType("NON_SUBJECT")).toBe("NON_SUBJECT");
    expect(normalizeTaxType("OTRO")).toBe("TAXABLE");
  });
});
