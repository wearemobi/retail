import { Search, ShoppingBag, Store } from "lucide-react";
import {
  Badge,
  Button,
  Input,
  SatelliteHeader,
  cn,
  type SatelliteTheme,
} from "@retail/common";
import { EMISSION_POINT, resolveTenantId } from "../../lib/api";
import { formatScaledMoney } from "../../lib/quantity";
import { useAuthStore } from "../../store/auth";

export type PosColumnCount = 2 | 3 | 4 | 6;
export type PosFontScale = "sm" | "base" | "lg";

export const POS_COLUMN_OPTIONS: PosColumnCount[] = [2, 3, 4, 6];
export const POS_SCALE_OPTIONS: PosFontScale[] = ["sm", "base", "lg"];

export function scaleMultiplier(scale: PosFontScale): number {
  if (scale === "sm") return 0.9;
  if (scale === "lg") return 1.12;
  return 1;
}

interface PosHeaderProps {
  search: string;
  onSearch: (value: string) => void;
  onSearchSubmit: (value: string) => void;
  cartCount: number;
  cartTotal: number;
  pendingOrdersCount?: number;
  onOpenOrders?: () => void;
  columns: PosColumnCount;
  onColumnsChange: (columns: PosColumnCount) => void;
  fontScale: PosFontScale;
  onFontScaleChange: (scale: PosFontScale) => void;
  theme?: SatelliteTheme;
  onToggleTheme?: () => void;
}

export default function PosHeader({
  search,
  onSearch,
  onSearchSubmit,
  cartCount,
  cartTotal,
  pendingOrdersCount = 0,
  onOpenOrders = () => {},
  columns,
  onColumnsChange,
  fontScale,
  onFontScaleChange,
  theme,
  onToggleTheme,
}: PosHeaderProps) {
  const operatorName = useAuthStore((state) => state.operatorName) || "Cajero";
  const logout = useAuthStore((state) => state.logout);

  return (
    <SatelliteHeader
      title="MobiWare Retail POS"
      subtitle="Terminal de punto de venta"
      tenantId={resolveTenantId()}
      icon={<Store className="h-4 w-4" aria-hidden="true" />}
      metrics={[
        { label: "Caja", value: EMISSION_POINT },
        {
          label: "Carrito",
          value: cartCount,
          valueClassName: cartCount > 0 ? "text-accent-brand" : undefined,
        },
        { label: "Total", value: formatScaledMoney(cartTotal) },
      ]}
      operatorName={operatorName}
      controls={
        <>
          <Button
            variant="outline"
            size="xs"
            onClick={onOpenOrders}
            className="h-7 gap-1.5"
            aria-label={`Órdenes pendientes (${pendingOrdersCount})`}
            title="Órdenes pendientes de Tienda"
          >
            <ShoppingBag className="h-3.5 w-3.5" aria-hidden="true" />
            <span>Órdenes</span>
            <Badge
              variant={pendingOrdersCount > 0 ? "accent" : "outline"}
              className="text-[10px]"
            >
              {pendingOrdersCount}
            </Badge>
          </Button>

          <div
            role="group"
            aria-label="Columnas del catálogo"
            className="flex items-center gap-1 rounded-lg border border-border bg-muted/60 p-0.5 text-xs"
          >
            {POS_COLUMN_OPTIONS.map((option) => (
              <button
                key={option}
                type="button"
                onClick={() => onColumnsChange(option)}
                aria-pressed={columns === option}
                className={cn(
                  "rounded-md px-2 py-1 font-bold transition-colors",
                  columns === option
                    ? "bg-accent-brand text-accent-brand-foreground"
                    : "text-muted-foreground hover:bg-muted hover:text-foreground",
                )}
              >
                {option}
              </button>
            ))}
          </div>

          <div
            role="group"
            aria-label="Escala de la interfaz"
            className="flex items-center gap-1 rounded-lg border border-border bg-muted/60 p-0.5 text-xs"
          >
            {POS_SCALE_OPTIONS.map((option) => (
              <button
                key={option}
                type="button"
                onClick={() => onFontScaleChange(option)}
                aria-pressed={fontScale === option}
                className={cn(
                  "rounded-md px-2 py-1 font-bold transition-colors",
                  fontScale === option
                    ? "bg-accent-brand text-accent-brand-foreground"
                    : "text-muted-foreground hover:bg-muted hover:text-foreground",
                )}
              >
                {option === "sm" ? "A-" : option === "lg" ? "A+" : "A"}
              </button>
            ))}
          </div>

          <Button
            variant="outline"
            size="xs"
            onClick={() => onSearchSubmit(search)}
            className="h-7"
            aria-label="Buscar por SKU"
            title="Buscar por SKU"
          >
            <Search className="h-3.5 w-3.5" aria-hidden="true" />
            <span>SKU</span>
          </Button>
        </>
      }
      theme={theme}
      onToggleTheme={onToggleTheme}
      onLogout={logout}
      bottomSlot={
        <div className="relative">
          <Search
            className="pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-muted-foreground"
            aria-hidden="true"
          />
          <Input
            type="search"
            value={search}
            onChange={(event) => onSearch(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                event.preventDefault();
                onSearchSubmit(search);
              }
            }}
            placeholder="Buscar producto o escanear SKU…"
            aria-label="Buscar producto o escanear SKU"
            className="pl-9 focus-visible:ring-accent-brand"
          />
        </div>
      }
    />
  );
}
