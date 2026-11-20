import { ShoppingCart, Trash2, X } from "lucide-react";
import { Button, QuantityStepper } from "@retail/common";
import {
  formatScaledMoney,
  formatScaledQuantity,
  fromScaled,
  toScaled,
  unitLabel,
} from "../../lib/quantity";
import {
  cartLineTotal,
  cartSubtotal,
  useCartStore,
  type CartItem,
} from "../../store/cart.store";

interface CartPanelProps {
  items: CartItem[];
  onCheckout: () => void;
  onClose?: () => void;
  variant?: "sidebar" | "drawer";
}

export default function CartPanel({
  items,
  onCheckout,
  onClose,
  variant = "sidebar",
}: CartPanelProps) {
  const setQuantity = useCartStore((state) => state.setQuantity);
  const removeItem = useCartStore((state) => state.removeItem);
  const subtotal = cartSubtotal(items);

  const content = (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex items-center justify-between border-b border-border px-4 py-3">
        <div className="flex items-center gap-2">
          <ShoppingCart className="h-4 w-4 text-accent-brand" aria-hidden="true" />
          <h2 className="text-sm font-bold">Carrito</h2>
          <span className="rounded-full bg-muted px-2 py-0.5 text-[11px] font-semibold text-muted-foreground">
            {items.length}
          </span>
        </div>
        {variant === "drawer" && onClose && (
          <Button
            variant="ghost"
            size="xs"
            onClick={onClose}
            aria-label="Cerrar carrito"
            className="h-7 w-7 px-0"
          >
            <X className="h-4 w-4" aria-hidden="true" />
          </Button>
        )}
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto p-3">
        {items.length === 0 ? (
          <div className="flex h-full min-h-48 flex-col items-center justify-center gap-2 text-center text-muted-foreground">
            <ShoppingCart className="h-8 w-8" aria-hidden="true" />
            <p className="text-sm font-medium">El carrito está vacío.</p>
            <p className="text-xs">Agrega productos desde el catálogo.</p>
          </div>
        ) : (
          <ul className="space-y-2.5" aria-label="Ítems del carrito">
            {items.map((item) => {
              const label = unitLabel(item.unitOfMeasure);
              return (
                <li
                  key={item.sku}
                  className="rounded-xl border border-border bg-background p-2.5"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold">{item.name}</p>
                      <p className="font-mono text-[11px] text-muted-foreground">
                        {item.sku} · {formatScaledMoney(item.unitPrice)} / {label}
                      </p>
                    </div>
                    <Button
                      variant="ghost"
                      size="xs"
                      onClick={() => removeItem(item.sku)}
                      aria-label={`Quitar ${item.name}`}
                      className="h-7 w-7 shrink-0 px-0 text-muted-foreground hover:text-destructive"
                    >
                      <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
                    </Button>
                  </div>

                  <div className="mt-2 flex items-center gap-2">
                    <QuantityStepper
                      value={fromScaled(item.quantity)}
                      onChange={(next) => setQuantity(item.sku, toScaled(next))}
                      min={0}
                      step={item.isWeighted ? 0.25 : 1}
                      allowDecimals={item.isWeighted}
                      precision={4}
                      unitLabel={label}
                      aria-label={`Cantidad de ${item.name}`}
                      className="flex-1"
                    />
                    <span className="w-20 shrink-0 text-right font-mono text-sm font-bold">
                      {formatScaledMoney(cartLineTotal(item))}
                    </span>
                  </div>
                  {item.isWeighted && (
                    <p className="mt-1 text-right text-[10px] text-muted-foreground">
                      {formatScaledQuantity(item.quantity)} {label} · precisión 10⁻⁴
                    </p>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </div>

      <div className="border-t border-border p-3">
        <div className="mb-2 flex items-center justify-between">
          <span className="text-sm text-muted-foreground">Total</span>
          <span className="text-xl font-bold text-accent-brand">
            {formatScaledMoney(subtotal)}
          </span>
        </div>
        <Button
          variant="accent"
          size="lg"
          className="w-full"
          disabled={items.length === 0}
          onClick={onCheckout}
        >
          Cobrar
        </Button>
      </div>
    </div>
  );

  if (variant === "drawer") {
    return (
      <div
        className="fixed inset-0 z-40 flex justify-end bg-black/60 lg:hidden"
        onClick={(event) => {
          if (event.target === event.currentTarget) onClose?.();
        }}
      >
        <div className="h-full w-full max-w-md border-l border-border bg-card">
          {content}
        </div>
      </div>
    );
  }

  return <div className="h-full">{content}</div>;
}
