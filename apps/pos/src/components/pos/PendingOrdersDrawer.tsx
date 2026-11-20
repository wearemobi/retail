import { useState } from "react";
import {
  AlertCircle,
  ChevronDown,
  ChevronUp,
  Loader2,
  Receipt,
  Search,
  ShoppingBag,
  X,
} from "lucide-react";
import { Badge, Button, Input, cn, type BadgeProps } from "@retail/common";
import { fetchOrderDetail, type Order, type OrderItem } from "../../lib/api";
import {
  formatScaledMoney,
  formatScaledQuantity,
} from "../../lib/quantity";

const CHANNEL_LABELS: Record<string, string> = {
  WHATSAPP: "WhatsApp",
  INSTAGRAM: "Instagram",
  WEB: "Web",
  POS: "POS",
  PHONE: "Teléfono",
  KIOSK: "Kiosko",
  API: "API",
};

const CHANNEL_VARIANTS: Record<string, BadgeProps["variant"]> = {
  WHATSAPP: "secondary",
  INSTAGRAM: "secondary",
  POS: "default",
};

const ORDER_TYPE_LABELS: Record<string, string> = {
  ECOMMERCE: "E-commerce",
  DELIVERY: "Delivery",
  TAKEAWAY: "Para llevar",
  DINE_IN: "Mesa",
  CALL_CENTER: "Call center",
};

interface PendingOrdersDrawerProps {
  open: boolean;
  orders: Order[];
  loading: boolean;
  error: string;
  search: string;
  businessId?: string;
  onSearch: (value: string) => void;
  onRetry: () => void;
  onClose: () => void;
  onCharge: (order: Order, items: OrderItem[]) => void;
}

export default function PendingOrdersDrawer({
  open,
  orders,
  loading,
  error,
  search,
  businessId = "",
  onSearch,
  onRetry,
  onClose,
  onCharge,
}: PendingOrdersDrawerProps) {
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [itemsByOrder, setItemsByOrder] = useState<Record<string, OrderItem[]>>({});
  const [loadingItemsId, setLoadingItemsId] = useState<string | null>(null);
  const [chargingId, setChargingId] = useState<string | null>(null);
  const [actionError, setActionError] = useState("");

  if (!open) return null;

  async function loadItems(order: Order): Promise<OrderItem[]> {
    const cached = order.id ? itemsByOrder[order.id] : undefined;
    if (cached) return cached;
    const detail = await fetchOrderDetail(order.id ?? "");
    const items = detail.items ?? [];
    if (order.id) {
      setItemsByOrder((current) => ({ ...current, [order.id as string]: items }));
    }
    return items;
  }

  async function handleToggleItems(order: Order) {
    const id = order.id ?? "";
    setActionError("");
    if (expandedId === id) {
      setExpandedId(null);
      return;
    }
    setExpandedId(id);
    if (itemsByOrder[id]) return;
    setLoadingItemsId(id);
    try {
      await loadItems(order);
    } catch (err) {
      setActionError(err instanceof Error ? err.message : "No se pudo cargar la orden.");
    } finally {
      setLoadingItemsId(null);
    }
  }

  async function handleCharge(order: Order) {
    const id = order.id ?? "";
    setActionError("");
    setChargingId(id);
    try {
      const items = await loadItems(order);
      if (items.length === 0) {
        setActionError("La orden no tiene ítems para cobrar.");
        return;
      }
      onCharge(order, items);
    } catch (err) {
      setActionError(err instanceof Error ? err.message : "No se pudo cargar la orden.");
    } finally {
      setChargingId(null);
    }
  }

  const visibleOrders = orders.filter(
    (order) =>
      order.status !== "CANCELLED" &&
      order.status !== "COMPLETED" &&
      (!businessId || !order.business_id || order.business_id === businessId),
  );

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Órdenes pendientes de Tienda"
      className="fixed inset-0 z-50 flex justify-end bg-black/70"
      onClick={(event) => {
        if (event.target === event.currentTarget && !chargingId) onClose();
      }}
    >
      <div className="flex h-full w-full max-w-lg flex-col overflow-hidden border-l border-border bg-card shadow-xl">
        <div className="flex items-center justify-between border-b border-border px-4 py-3">
          <div className="flex items-center gap-2">
            <ShoppingBag className="h-4 w-4 text-accent-brand" aria-hidden="true" />
            <div>
              <h2 className="text-base font-bold">Órdenes pendientes</h2>
              <p className="text-xs text-muted-foreground">
                Pedidos de Tienda ({visibleOrders.length}) sin cobrar
              </p>
            </div>
          </div>
          <Button
            variant="ghost"
            size="xs"
            onClick={onClose}
            disabled={chargingId !== null}
            aria-label="Cerrar órdenes"
            className="h-8 w-8 px-0"
          >
            <X className="h-4 w-4" aria-hidden="true" />
          </Button>
        </div>

        <div className="border-b border-border px-4 py-3">
          <div className="relative">
            <Search
              className="pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-muted-foreground"
              aria-hidden="true"
            />
            <Input
              type="search"
              value={search}
              onChange={(event) => onSearch(event.target.value)}
              placeholder="Buscar por folio o cliente…"
              aria-label="Buscar orden pendiente"
              className="pl-9 focus-visible:ring-accent-brand"
            />
          </div>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto p-4">
          {actionError && (
            <div
              role="alert"
              className="mb-3 flex items-start gap-2 rounded-lg border border-destructive/30 bg-destructive/15 px-3 py-2 text-xs text-destructive"
            >
              <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
              <span>{actionError}</span>
            </div>
          )}

          {error && !loading && (
            <div className="flex flex-col items-center gap-3 rounded-lg border border-destructive/30 bg-destructive/15 p-6 text-center text-sm text-destructive">
              <span>{error}</span>
              <Button variant="outline" size="sm" onClick={onRetry}>
                Reintentar
              </Button>
            </div>
          )}

          {loading && (
            <p className="animate-pulse text-sm text-muted-foreground">
              Cargando órdenes…
            </p>
          )}

          {!loading && !error && visibleOrders.length === 0 && (
            <div className="flex flex-col items-center gap-2 rounded-lg border border-border bg-muted/30 p-8 text-center">
              <Receipt className="h-6 w-6 text-muted-foreground" aria-hidden="true" />
              <p className="text-sm font-medium">No hay órdenes pendientes</p>
              <p className="text-xs text-muted-foreground">
                Los pedidos de WhatsApp, Instagram y otros canales aparecerán aquí.
              </p>
            </div>
          )}

          <div className="flex flex-col gap-3">
            {visibleOrders.map((order) => {
              const id = order.id ?? "";
              const expanded = expandedId === id;
              const items = itemsByOrder[id];
              const channel = order.source_channel ?? "POS";
              return (
                <div
                  key={id}
                  className="flex flex-col gap-3 rounded-xl border border-border bg-background p-3"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex flex-col gap-1">
                      <span className="font-mono text-sm font-semibold">
                        {order.display_id || `#${id.slice(0, 8)}`}
                      </span>
                      <span className="text-xs text-muted-foreground">
                        {order.customer_name || "Consumidor Final"}
                      </span>
                    </div>
                    <div className="flex flex-col items-end gap-1">
                      <span className="font-mono text-sm font-bold">
                        {formatScaledMoney(order.total_amount ?? 0)}
                      </span>
                      <Badge
                        variant={CHANNEL_VARIANTS[channel] ?? "outline"}
                        className="text-[10px]"
                      >
                        {CHANNEL_LABELS[channel] ?? channel}
                      </Badge>
                    </div>
                  </div>

                  <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                    <Badge variant="outline" className="text-[10px]">
                      {ORDER_TYPE_LABELS[order.order_type ?? ""] ?? order.order_type ?? "—"}
                    </Badge>
                    {order.payment_status === "UNPAID" && (
                      <Badge variant="secondary" className="text-[10px]">
                        Sin pagar
                      </Badge>
                    )}
                  </div>

                  {expanded && (
                    <div className="rounded-lg border border-border bg-muted/30 p-2">
                      {loadingItemsId === id && (
                        <p className="flex items-center gap-2 text-xs text-muted-foreground">
                          <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
                          Cargando ítems…
                        </p>
                      )}
                      {items && items.length > 0 && (
                        <ul className="flex flex-col gap-1">
                          {items.map((item, index) => (
                            <li
                              key={`${id}-${item.sku ?? index}-${index}`}
                              className="flex items-center justify-between gap-2 text-xs"
                            >
                              <span className="truncate">
                                {formatScaledQuantity(item.quantity ?? 0)} × {item.name || item.sku}
                              </span>
                              <span className="font-mono text-muted-foreground">
                                {formatScaledMoney(item.line_total ?? 0)}
                              </span>
                            </li>
                          ))}
                        </ul>
                      )}
                      {items && items.length === 0 && (
                        <p className="text-xs text-muted-foreground">La orden no tiene ítems.</p>
                      )}
                    </div>
                  )}

                  <div className="flex items-center gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      className="flex-1"
                      onClick={() => void handleToggleItems(order)}
                      disabled={chargingId !== null}
                    >
                      {expanded ? (
                        <ChevronUp className="h-4 w-4" aria-hidden="true" />
                      ) : (
                        <ChevronDown className="h-4 w-4" aria-hidden="true" />
                      )}
                      {expanded ? "Ocultar ítems" : "Ver ítems"}
                    </Button>
                    <Button
                      variant="accent"
                      size="sm"
                      className={cn("flex-1")}
                      onClick={() => void handleCharge(order)}
                      disabled={chargingId !== null}
                    >
                      {chargingId === id ? (
                        <>
                          <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                          Cargando…
                        </>
                      ) : (
                        "Cobrar Orden"
                      )}
                    </Button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
