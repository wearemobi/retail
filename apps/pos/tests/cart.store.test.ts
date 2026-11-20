import { beforeEach, describe, expect, it } from "vitest";
import type { Product } from "../src/lib/api";
import {
  cartLineTotal,
  cartSubtotal,
  useCartStore,
} from "../src/store/cart.store";

const unitProduct = {
  sku: "SKU-UNIT",
  name: "Café molido",
  base_price: 15000,
  unit_of_measure: "59",
  is_weighable: false,
} as Product;

const weightedProduct = {
  sku: "SKU-KG",
  name: "Queso fresco",
  base_price: 10000,
  unit_of_measure: "36",
  is_weighable: true,
} as Product;

beforeEach(() => {
  useCartStore.getState().clear();
});

describe("cart store — 10^-4 quantities", () => {
  it("adds an integer product as 1.0000", () => {
    useCartStore.getState().addItem(unitProduct);
    const [item] = useCartStore.getState().items;

    expect(item.quantity).toBe(10000);
    expect(item.isWeighted).toBe(false);
    expect(cartLineTotal(item)).toBe(15000);
    expect(cartSubtotal(useCartStore.getState().items)).toBe(15000);
  });

  it("merges repeated scans of the same SKU", () => {
    useCartStore.getState().addItem(unitProduct);
    useCartStore.getState().addItem(unitProduct);

    expect(useCartStore.getState().items).toHaveLength(1);
    expect(useCartStore.getState().items[0].quantity).toBe(20000);
  });

  it("supports decimal quantities for weighted products", () => {
    useCartStore.getState().addItem(weightedProduct);
    useCartStore.getState().setQuantity("SKU-KG", 2500);
    const [item] = useCartStore.getState().items;

    expect(item.isWeighted).toBe(true);
    expect(item.quantity).toBe(2500);
    expect(cartLineTotal(item)).toBe(2500);
  });

  it("uses is_weighable from the product master over the CAT-014 heuristic", () => {
    const integerWithWeightUom = {
      sku: "SKU-SERVICE",
      name: "Servicio por kg",
      base_price: 5000,
      unit_of_measure: "36",
      is_weighable: false,
    } as Product;
    const decimalWithUnitUom = {
      sku: "SKU-DECIMAL",
      name: "Producto a granel",
      base_price: 5000,
      unit_of_measure: "59",
      is_weighable: true,
    } as Product;

    useCartStore.getState().addItem(integerWithWeightUom);
    useCartStore.getState().addItem(decimalWithUnitUom);

    const items = useCartStore.getState().items;
    expect(items.find((item) => item.sku === "SKU-SERVICE")?.isWeighted).toBe(false);
    expect(items.find((item) => item.sku === "SKU-DECIMAL")?.isWeighted).toBe(true);
  });

  it("removes a line when the quantity reaches zero", () => {
    useCartStore.getState().addItem(unitProduct);
    useCartStore.getState().setQuantity("SKU-UNIT", 0);

    expect(useCartStore.getState().items).toHaveLength(0);
  });

  it("rounds decimal steps using the weighted step", () => {
    useCartStore.getState().addItem(weightedProduct);
    useCartStore.getState().setQuantity("SKU-KG", 10000);
    useCartStore.getState().increment("SKU-KG");

    expect(useCartStore.getState().items[0].quantity).toBe(12500);
    useCartStore.getState().decrement("SKU-KG");
    expect(useCartStore.getState().items[0].quantity).toBe(10000);
  });
});
