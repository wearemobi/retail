import { useEffect, useState } from "react";
import { AlertCircle, ShoppingCart, Star } from "lucide-react";
import { Button, playAdd, type SatelliteTheme } from "@retail/common";
import {
  fetchBusinesses,
  fetchPendingRetailOrders,
  fetchProductBySku,
  fetchProducts,
  resolveProductByBarcode,
  resolveTenantId,
  syncOfflineSalesQueue,
  type BarcodeLookup,
  type Business,
  type OfflineSaleRecord,
  type Order,
  type OrderItem,
  type Product,
} from "../../lib/api";
import { listOfflineSales } from "../../lib/offlineStore";
import { storedBusinessId, useAuthStore } from "../../store/auth";
import { cartGrandTotal, useCartStore } from "../../store/cart.store";
import {
  QUANTITY_SCALE,
  formatScaledQuantity,
  toScaled,
} from "../../lib/quantity";
import { useDebouncedValue } from "../../lib/useDebouncedValue";
import CatalogGrid from "./CatalogGrid";
import CartPanel from "./CartPanel";
import CheckoutDialog from "./CheckoutDialog";
import PendingOrdersDrawer from "./PendingOrdersDrawer";
import ShiftDrawerDialog from "./ShiftDrawerDialog";
import OfflineQueueDrawer from "./OfflineQueueDrawer";
import DeviceSettingsDialog from "./DeviceSettingsDialog";
import PosHeader, {
  scaleMultiplier,
  type PosColumnCount,
  type PosFontScale,
} from "./PosHeader";

const COLUMNS_STORAGE_KEY = "ware-pos.columns";
const SCALE_STORAGE_KEY = "ware-pos.fontScale";

function readColumns(): PosColumnCount {
  try {
    const saved = Number(window.localStorage.getItem(COLUMNS_STORAGE_KEY));
    return ([2, 3, 4, 6] as number[]).includes(saved) ? (saved as PosColumnCount) : 3;
  } catch {
    return 3;
  }
}

function readScale(): PosFontScale {
  try {
    const saved = window.localStorage.getItem(SCALE_STORAGE_KEY);
    return saved === "sm" || saved === "lg" ? saved : "base";
  } catch {
    return "base";
  }
}

interface CatalogCategory {
  id: string;
  name: string;
}

function catalogCategories(products: Product[]): CatalogCategory[] {
  const byId = new Map<string, string>();
  for (const product of products) {
    if (!product.category_id) continue;
    byId.set(product.category_id, product.category_name ?? "Sin categoría");
  }
  return Array.from(byId, ([id, name]) => ({ id, name })).sort((a, b) =>
    a.name.localeCompare(b.name, "es"),
  );
}

function barcodeQuantity(barcode: BarcodeLookup["barcode"]): number {
  if (typeof barcode.pack_quantity === "number" && barcode.pack_quantity > 0) {
    return Math.round(barcode.pack_quantity);
  }
  if (typeof barcode.pack_quantity_units === "number" && barcode.pack_quantity_units > 0) {
    return toScaled(barcode.pack_quantity_units);
  }
  return QUANTITY_SCALE;
}

interface PosScreenProps {
  theme?: SatelliteTheme;
  onToggleTheme?: () => void;
}

export default function PosScreen({ theme, onToggleTheme }: PosScreenProps = {}) {
  const [products, setProducts] = useState<Product[]>([]);
  const [categories, setCategories] = useState<CatalogCategory[]>([]);
  const [selectedCategoryId, setSelectedCategoryId] = useState("");
  const [onlyFavorites, setOnlyFavorites] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [scanError, setScanError] = useState("");
  const [scanNotice, setScanNotice] = useState("");
  const [search, setSearch] = useState("");
  const [cartOpen, setCartOpen] = useState(false);
  const [checkoutOpen, setCheckoutOpen] = useState(false);
  const [ordersOpen, setOrdersOpen] = useState(false);
  const [shiftOpen, setShiftOpen] = useState(false);
  const [currentShift, setCurrentShift] = useState<import("../../lib/api").CashShift | null>(null);
  const [offlineOpen, setOfflineOpen] = useState(false);
  const [isOnline, setIsOnline] = useState(typeof navigator === "undefined" ? true : navigator.onLine);
  const [offlineQueue, setOfflineQueue] = useState<OfflineSaleRecord[]>([]);
  const [syncingOffline, setSyncingOffline] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [emissionPointVersion, setEmissionPointVersion] = useState(0);
  const [orders, setOrders] = useState<Order[]>([]);
  const [ordersLoading, setOrdersLoading] = useState(false);
  const [ordersError, setOrdersError] = useState("");
  const [ordersQuery, setOrdersQuery] = useState("");
  const [ordersRefreshToken, setOrdersRefreshToken] = useState(0);
  const [activeOrder, setActiveOrder] = useState<Order | null>(null);
  const [activeOrderItems, setActiveOrderItems] = useState<OrderItem[]>([]);
  const [columns, setColumns] = useState<PosColumnCount>(readColumns);
  const [fontScale, setFontScale] = useState<PosFontScale>(readScale);
  const [businesses, setBusinesses] = useState<Business[]>([]);
  const activeBusinessId = useAuthStore((state) => state.businessId);
  const setBusinessId = useAuthStore((state) => state.setBusinessId);

  const items = useCartStore((state) => state.items);
  const addItem = useCartStore((state) => state.addItem);
  const clear = useCartStore((state) => state.clear);
  const total = cartGrandTotal(items);
  const debouncedSearch = useDebouncedValue(search, 250);
  const debouncedOrdersQuery = useDebouncedValue(ordersQuery, 250);
  const pendingOrdersCount = orders.filter(
    (order) => order.status !== "CANCELLED" && order.status !== "COMPLETED",
  ).length;

  const refreshOfflineQueue = () => {
    setOfflineQueue(listOfflineSales(resolveTenantId()));
  };

  // Load current cash shift for operator (SPEC-WRTL4); refresh on emission point change.
  useEffect(() => {
    let cancelled = false;
    import("../../lib/api").then(({ fetchCurrentShift, getCurrentEmissionPoint }) => {
      const opId = useAuthStore.getState().operatorId;
      if (!opId) return;
      fetchCurrentShift(opId, getCurrentEmissionPoint()).then((shift) => { if (!cancelled) setCurrentShift(shift); }).catch(() => {});
    });
    return () => { cancelled = true; };
  }, [emissionPointVersion]);

  // SPEC-WRTL5: offline queue + connectivity sync.
  useEffect(() => {
    refreshOfflineQueue();
    if (typeof navigator !== "undefined" && navigator.onLine) {
      void syncOfflineSalesQueue().then(() => refreshOfflineQueue());
    }
    const onOnline = () => {
      setIsOnline(true);
      void syncOfflineSalesQueue().then(() => refreshOfflineQueue());
    };
    const onOffline = () => {
      setIsOnline(false);
      refreshOfflineQueue();
    };
    window.addEventListener("online", onOnline);
    window.addEventListener("offline", onOffline);
    return () => {
      window.removeEventListener("online", onOnline);
      window.removeEventListener("offline", onOffline);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Resolve the active business: ?b= from the QR wins, then the persisted
  // per-tenant selection, then the first active business (SPEC-WRTL3).
  useEffect(() => {
    let cancelled = false;
    fetchBusinesses()
      .then((list) => {
        if (cancelled) return;
        setBusinesses(list);
        const candidate =
          list.find((business) => business.id === activeBusinessId) ??
          list.find((business) => business.id === storedBusinessId(resolveTenantId())) ??
          list[0];
        if (candidate?.id && candidate.id !== activeBusinessId) {
          setBusinessId(candidate.id);
        }
      })
      .catch(() => {
        // The POS stays usable with the cart even if the business list fails.
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    let cancelled = false;
    setOrdersLoading(true);
    setOrdersError("");

    fetchPendingRetailOrders(debouncedOrdersQuery, activeBusinessId)
      .then((list) => {
        if (!cancelled) setOrders(list);
      })
      .catch((err: Error) => {
        if (!cancelled) setOrdersError(err.message);
      })
      .finally(() => {
        if (!cancelled) setOrdersLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [debouncedOrdersQuery, ordersRefreshToken, activeBusinessId]);

  useEffect(() => {
    try {
      window.localStorage.setItem(COLUMNS_STORAGE_KEY, String(columns));
    } catch {
      // ignore restricted storage
    }
  }, [columns]);

  useEffect(() => {
    try {
      window.localStorage.setItem(SCALE_STORAGE_KEY, fontScale);
    } catch {
      // ignore restricted storage
    }
  }, [fontScale]);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError("");

    fetchProducts(debouncedSearch, {
      categoryId: selectedCategoryId || undefined,
      onlyFavorites,
    })
      .then((list) => {
        if (cancelled) return;
        setProducts(list);
        if (!debouncedSearch && !selectedCategoryId && !onlyFavorites) {
          setCategories(catalogCategories(list));
        }
      })
      .catch((err: Error) => {
        if (!cancelled) setError(err.message);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [debouncedSearch, selectedCategoryId, onlyFavorites]);

  useEffect(() => {
    if (!scanNotice) return;
    const timeout = window.setTimeout(() => setScanNotice(""), 2500);
    return () => window.clearTimeout(timeout);
  }, [scanNotice]);

  function handleAdd(product: Product, quantity?: number) {
    addItem(product, quantity);
    playAdd();
  }

  function openWalkInCheckout() {
    setActiveOrder(null);
    setActiveOrderItems([]);
    setCheckoutOpen(true);
  }

  function handleChargeOrder(order: Order, orderItems: OrderItem[]) {
    setActiveOrder(order);
    setActiveOrderItems(orderItems);
    setOrdersOpen(false);
    setCheckoutOpen(true);
  }

  function closeCheckout() {
    setCheckoutOpen(false);
    setActiveOrder(null);
    setActiveOrderItems([]);
  }

  function handleCheckoutCompleted() {
    refreshOfflineQueue();
    if (activeOrder) {
      setOrdersRefreshToken((token) => token + 1);
      return;
    }
    clear();
  }

  async function handleSyncOffline() {
    setSyncingOffline(true);
    try {
      await syncOfflineSalesQueue();
    } finally {
      refreshOfflineQueue();
      setSyncingOffline(false);
    }
  }

  function refreshOrders() {
    setOrdersRefreshToken((token) => token + 1);
  }

  async function handleScan(raw: string) {
    const term = raw.trim();
    if (!term) return;
    setScanError("");
    setScanNotice("");

    try {
      const lookup = await resolveProductByBarcode(term);
      if (lookup) {
        const quantity = barcodeQuantity(lookup.barcode);
        handleAdd(lookup.product, quantity);
        setScanNotice(
          `+${formatScaledQuantity(quantity)} · ${lookup.barcode.label ?? lookup.barcode.barcode_type ?? "Código"} — ${lookup.product.name ?? lookup.product.sku ?? "Producto"}`,
        );
        setSearch("");
        return;
      }
    } catch (err) {
      setScanError(
        err instanceof Error ? err.message : "No fue posible resolver el código de barras.",
      );
      return;
    }

    const normalizedTerm = term.toLowerCase();
    let product = products.find((candidate) =>
      [candidate.sku, candidate.primary_barcode]
        .filter(Boolean)
        .some((value) => (value ?? "").toLowerCase() === normalizedTerm),
    );
    if (!product) {
      try {
        product = (await fetchProductBySku(term)) ?? undefined;
      } catch {
        product = undefined;
      }
    }
    if (!product) {
      try {
        const matches = await fetchProducts(term);
        product = matches.find((candidate) => {
          const name = (candidate.name ?? "").toLowerCase();
          return name === normalizedTerm || name.includes(normalizedTerm);
        }) ?? matches[0] ?? undefined;
      } catch {
        product = undefined;
      }
    }

    if (!product) {
      setScanError(`No se encontró un producto con el SKU o código «${term}».`);
      return;
    }

    handleAdd(product);
    setSearch("");
  }

  return (
    <div className="flex h-full flex-col bg-background text-foreground">
      <PosHeader
        search={search}
        onSearch={setSearch}
        onSearchSubmit={(value) => void handleScan(value)}
        cartCount={items.length}
        cartTotal={total}
        pendingOrdersCount={pendingOrdersCount}
        onOpenOrders={() => setOrdersOpen(true)}
        businesses={businesses}
        activeBusinessId={activeBusinessId}
        onBusinessChange={setBusinessId}
        currentShift={currentShift}
        onOpenShift={() => setShiftOpen(true)}
        onOpenSettings={() => setSettingsOpen(true)}
        isOnline={isOnline}
        offlineQueueCount={offlineQueue.length}
        onOpenOfflineQueue={() => setOfflineOpen(true)}
        columns={columns}
        onColumnsChange={setColumns}
        fontScale={fontScale}
        onFontScaleChange={setFontScale}
        theme={theme}
        onToggleTheme={onToggleTheme}
      />

      <div className="flex min-h-0 flex-1">
        <main
          className="min-w-0 flex-1 overflow-y-auto p-3"
          style={{ zoom: scaleMultiplier(fontScale) }}
        >
          <div className="mb-3 flex flex-wrap items-center gap-2 border-b border-border pb-2">
            <button
              type="button"
              aria-pressed={!selectedCategoryId}
              onClick={() => setSelectedCategoryId("")}
              className={`rounded-full border px-3 py-1.5 text-xs ${
                !selectedCategoryId
                  ? "border-accent-brand bg-accent-brand/10 text-accent-brand"
                  : "border-border text-muted-foreground"
              }`}
            >
              Todas
            </button>
            {categories.map((category) => (
              <button
                key={category.id}
                type="button"
                aria-pressed={selectedCategoryId === category.id}
                onClick={() => setSelectedCategoryId(category.id)}
                className={`rounded-full border px-3 py-1.5 text-xs ${
                  selectedCategoryId === category.id
                    ? "border-accent-brand bg-accent-brand/10 text-accent-brand"
                    : "border-border text-muted-foreground"
                }`}
              >
                {category.name}
              </button>
            ))}
            <button
              type="button"
              aria-pressed={onlyFavorites}
              onClick={() => setOnlyFavorites((value) => !value)}
              className={`flex items-center gap-1 rounded-full border px-3 py-1.5 text-xs ${
                onlyFavorites
                  ? "border-accent-brand bg-accent-brand/10 text-accent-brand"
                  : "border-border text-muted-foreground"
              }`}
            >
              <Star className="h-3 w-3" aria-hidden="true" />
              Favoritos
            </button>
          </div>

          {scanNotice && (
            <div
              role="status"
              className="mb-3 rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-xs text-emerald-700 dark:text-emerald-300"
            >
              {scanNotice}
            </div>
          )}

          {scanError && (
            <div
              role="alert"
              className="mb-3 flex items-start gap-2 rounded-lg border border-destructive/30 bg-destructive/15 px-3 py-2 text-xs text-destructive"
            >
              <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
              <span>{scanError}</span>
            </div>
          )}

          {error && (
            <div
              role="alert"
              className="rounded-lg border border-destructive/30 bg-destructive/15 px-4 py-2 text-sm text-destructive"
            >
              {error}
            </div>
          )}

          {!error && loading && products.length === 0 && (
            <p className="animate-pulse text-sm text-muted-foreground">Cargando catálogo…</p>
          )}

          {!error && !(loading && products.length === 0) && (
            <CatalogGrid products={products} columns={columns} onAdd={handleAdd} />
          )}
        </main>

        <aside className="hidden w-[380px] shrink-0 border-l border-border bg-card/40 lg:block">
          <CartPanel items={items} onCheckout={openWalkInCheckout} />
        </aside>
      </div>

      {items.length > 0 && (
        <Button
          variant="accent"
          size="lg"
          onClick={() => setCartOpen(true)}
          className="fixed bottom-4 left-1/2 z-30 -translate-x-1/2 rounded-full px-6 shadow-lg lg:hidden"
        >
          <ShoppingCart className="h-4 w-4" aria-hidden="true" />
          Ver carrito ({items.length})
        </Button>
      )}

      {cartOpen && (
        <CartPanel
          variant="drawer"
          items={items}
          onClose={() => setCartOpen(false)}
          onCheckout={() => {
            setCartOpen(false);
            openWalkInCheckout();
          }}
        />
      )}

      <PendingOrdersDrawer
        open={ordersOpen}
        orders={orders}
        loading={ordersLoading}
        error={ordersError}
        search={ordersQuery}
        businessId={activeBusinessId}
        onSearch={setOrdersQuery}
        onRetry={refreshOrders}
        onClose={() => setOrdersOpen(false)}
        onCharge={handleChargeOrder}
      />

      <CheckoutDialog
        open={checkoutOpen}
        items={items}
        total={total}
        activeOrder={activeOrder}
        orderItems={activeOrderItems}
        onClose={closeCheckout}
        onCompleted={handleCheckoutCompleted}
      />

      <ShiftDrawerDialog
        open={shiftOpen}
        onClose={() => setShiftOpen(false)}
        onShiftChange={setCurrentShift}
      />

      <OfflineQueueDrawer
        open={offlineOpen}
        records={offlineQueue}
        syncing={syncingOffline}
        onClose={() => setOfflineOpen(false)}
        onSync={() => void handleSyncOffline()}
      />

      <DeviceSettingsDialog
        open={settingsOpen}
        onClose={() => setSettingsOpen(false)}
        currentShift={currentShift}
        onSaved={() => setEmissionPointVersion((v) => v + 1)}
      />
    </div>
  );
}
