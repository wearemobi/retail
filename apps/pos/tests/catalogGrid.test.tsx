import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import CatalogGrid from "../src/components/pos/CatalogGrid";
import { fetchVaultDownloadUrl, type Product } from "../src/lib/api";
import { useCartStore } from "../src/store/cart.store";

vi.mock("../src/lib/api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../src/lib/api")>();
  return { ...actual, fetchVaultDownloadUrl: vi.fn() };
});

const product = {
  id: "item-1",
  sku: "SKU-1",
  name: "Pupusa de frijol",
  category_name: "Principales",
  image_file_id: "vault-1",
  storage_type: "FROZEN",
  is_perishable: true,
  is_favorite: true,
  effective_price: 55000,
  unit_of_measure: "59",
  is_weighable: false,
  tax_type: "TAXABLE",
} as Product;

describe("CatalogGrid — catálogo Retail (SPEC-W174)", () => {
  beforeEach(() => {
    useCartStore.getState().clear();
    vi.mocked(fetchVaultDownloadUrl).mockReset();
    vi.mocked(fetchVaultDownloadUrl).mockResolvedValue("/edge/vault/download?ticket=t1");
  });

  afterEach(() => {
    cleanup();
    useCartStore.getState().clear();
  });

  it("muestra foto Vault, categoría, favorito, badges de almacenamiento y precio efectivo", async () => {
    const onAdd = vi.fn();
    render(<CatalogGrid products={[product]} columns={3} onAdd={onAdd} />);

    expect(screen.getByText("Principales")).toBeTruthy();
    expect(screen.getByText("Favorito")).toBeTruthy();
    expect(screen.getByText("Congelado")).toBeTruthy();
    expect(screen.getByText("Perecedero")).toBeTruthy();
    expect(screen.getByText(/5\.50/)).toBeTruthy();

    const image = await screen.findByRole("img");
    expect(image.getAttribute("src")).toContain("/edge/vault/download?ticket=t1");
    expect(image.getAttribute("alt")).toBe("Pupusa de frijol");

    fireEvent.click(screen.getByRole("button", { name: "Agregar" }));
    expect(onAdd).toHaveBeenCalledWith(product);
    await waitFor(() => expect(fetchVaultDownloadUrl).toHaveBeenCalledWith("vault-1"));
  });

  it("calcula el precio efectivo al agregar al carrito", async () => {
    render(
      <CatalogGrid
        products={[product]}
        columns={3}
        onAdd={(item) => useCartStore.getState().addItem(item)}
      />,
    );

    await screen.findByRole("img");
    fireEvent.click(screen.getByRole("button", { name: "Agregar" }));
    expect(useCartStore.getState().items[0]).toMatchObject({
      sku: "SKU-1",
      unitPrice: 55000,
      taxType: "TAXABLE",
    });
  });
});
