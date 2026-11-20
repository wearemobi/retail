import { create } from "zustand";
import { QUANTITY_SCALE, isWeightedUnit, toScaled } from "../lib/quantity";
import type { Product } from "../lib/api";

export interface CartItem {
  sku: string;
  name: string;
  /** Unit price in the 10^-4 scale. */
  unitPrice: number;
  /** Quantity in the 10^-4 scale (10000 = 1.0000). */
  quantity: number;
  unitOfMeasure?: string;
  isWeighted: boolean;
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
            item.sku === sku ? { ...item, quantity: item.quantity + incoming } : item,
          ),
        };
      }
      return {
        items: [
          ...state.items,
          {
            sku,
            name: product.name ?? "Producto",
            unitPrice: product.base_price ?? 0,
            quantity: incoming,
            unitOfMeasure: product.unit_of_measure,
            // The product master is the source of truth; CAT-014 is only a fallback.
            isWeighted: product.is_weighable ?? isWeightedUnit(product.unit_of_measure),
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
