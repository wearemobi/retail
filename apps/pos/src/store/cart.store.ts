import { create } from "zustand";
import { QUANTITY_SCALE, isWeightedUnit, toScaled } from "../lib/quantity";
import { normalizeTaxType, productUnitPrice, type Product, type TaxType } from "../lib/api";

export interface CartItem {
  sku: string;
  name: string;
  unitPrice: number;
  quantity: number;
  unitOfMeasure?: string;
  isWeighted: boolean;
  taxType: TaxType;
}

interface CartState {
  items: CartItem[];
  addItem: (product: Product, quantity?: number) => void;
  removeItem: (sku: string) => void;
  setQuantity: (sku: string, scaledQuantity: number) => void;
  increment: (sku: string) => void;
  decrement: (sku: string) => void;
  clear: () => void;
}

export function cartLineTotal(item: CartItem): number {
  return Math.round((item.quantity * item.unitPrice) / QUANTITY_SCALE);
}

export function cartSubtotal(items: CartItem[]): number {
  return items.reduce((total, item) => total + cartLineTotal(item), 0);
}

export function cartTaxTotal(items: CartItem[]): number {
  return items.reduce(
    (total, item) =>
      item.taxType === "TAXABLE" ? total + Math.round((cartLineTotal(item) * 13) / 100) : total,
    0,
  );
}

export function cartGrandTotal(items: CartItem[]): number {
  return cartSubtotal(items) + cartTaxTotal(items);
}

export function cartStep(item: CartItem): number {
  return item.isWeighted ? toScaled(0.25) : QUANTITY_SCALE;
}

export const useCartStore = create<CartState>((set, get) => ({
  items: [],

  addItem: (product, quantity = QUANTITY_SCALE) => {
    const sku = product.sku ?? "";
    if (!sku) return;
    const incoming = Math.max(0, Math.round(quantity));
    if (incoming === 0) return;

    set((state) => {
      const existing = state.items.find((item) => item.sku === sku);
      if (existing) {
        return {
          items: state.items.map((item) =>
            item.sku === sku
              ? { ...item, quantity: item.quantity + incoming, taxType: normalizeTaxType(product.tax_type) }
              : item,
          ),
        };
      }
      return {
        items: [
          ...state.items,
          {
            sku,
            name: product.name ?? "Producto",
            unitPrice: productUnitPrice(product),
            quantity: incoming,
            unitOfMeasure: product.unit_of_measure,
            isWeighted: product.is_weighable ?? isWeightedUnit(product.unit_of_measure),
            taxType: normalizeTaxType(product.tax_type),
          },
        ],
      };
    });
  },

  removeItem: (sku) =>
    set((state) => ({ items: state.items.filter((item) => item.sku !== sku) })),

  setQuantity: (sku, scaledQuantity) => {
    const next = Math.round(scaledQuantity);
    if (next <= 0) {
      get().removeItem(sku);
      return;
    }
    set((state) => ({
      items: state.items.map((item) =>
        item.sku === sku ? { ...item, quantity: next } : item,
      ),
    }));
  },

  increment: (sku) => {
    const item = get().items.find((candidate) => candidate.sku === sku);
    if (!item) return;
    get().setQuantity(sku, item.quantity + cartStep(item));
  },

  decrement: (sku) => {
    const item = get().items.find((candidate) => candidate.sku === sku);
    if (!item) return;
    get().setQuantity(sku, item.quantity - cartStep(item));
  },

  clear: () => set({ items: [] }),
}));
