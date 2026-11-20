import type { ReactNode } from "react";
import { LogOut, Moon, Sun, User } from "lucide-react";
import { cn } from "./cn";
import { Badge } from "./Badge";
import { Button } from "./Button";
import type { SatelliteTheme } from "./theme";

export interface SatelliteMetric {
  label: string;
  value: string | number;
  valueClassName?: string;
}

export interface SatelliteHeaderProps {
  title: string;
  tenantId?: string;
  subtitle?: string;
  icon?: ReactNode;
  metrics?: SatelliteMetric[];
  operatorName?: string;
  controls?: ReactNode;
  actions?: ReactNode;
  theme?: SatelliteTheme;
  onToggleTheme?: () => void;
  onLogout?: () => void;
  bottomSlot?: ReactNode;
  className?: string;
}

export function SatelliteHeader({
  title,
  tenantId,
  subtitle,
  icon,
  metrics = [],
  operatorName,
  controls,
  actions,
  theme,
  onToggleTheme,
  onLogout,
  bottomSlot,
  className,
}: SatelliteHeaderProps) {
  return (
    <header
      className={cn(
        "sticky top-0 z-20 flex flex-col gap-2.5 border-b border-border bg-card/95 px-4 py-3 backdrop-blur",
        className,
      )}
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-2.5">
          {icon && (
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-accent-brand-soft text-accent-brand">
              {icon}
            </div>
          )}
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <h1 className="truncate text-base font-bold tracking-tight sm:text-lg">
                {title}
              </h1>
              {tenantId && (
                <Badge variant="outline" className="font-mono text-[11px]">
                  {tenantId}
                </Badge>
              )}
            </div>
            {subtitle && (
              <p className="truncate text-xs text-muted-foreground">{subtitle}</p>
            )}
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2 text-xs">
          {metrics.map((metric) => (
            <span
              key={metric.label}
              className="inline-flex items-center gap-1 rounded-lg border border-border bg-muted/60 px-2.5 py-1 text-muted-foreground"
            >
              <span>{metric.label}:</span>
              <strong className={cn("font-semibold text-foreground", metric.valueClassName)}>
                {metric.value}
              </strong>
            </span>
          ))}

          {operatorName && (
            <Badge variant="accent" className="h-7 px-2.5">
              <User className="h-3 w-3" aria-hidden="true" />
              <span>{operatorName}</span>
            </Badge>
          )}

          {controls}
          {actions}

          {onToggleTheme && theme && (
            <Button
              variant="outline"
              size="xs"
              onClick={onToggleTheme}
              aria-label={
                theme === "dark" ? "Cambiar a tema claro" : "Cambiar a tema oscuro"
              }
              title={
                theme === "dark" ? "Cambiar a tema claro" : "Cambiar a tema oscuro"
              }
              className="h-7 w-7 px-0 text-muted-foreground hover:text-foreground"
            >
              {theme === "dark" ? (
                <Sun className="h-3.5 w-3.5" aria-hidden="true" />
              ) : (
                <Moon className="h-3.5 w-3.5" aria-hidden="true" />
              )}
            </Button>
          )}

          {onLogout && (
            <Button
              variant="outline"
              size="xs"
              onClick={onLogout}
              className="h-7 text-muted-foreground hover:text-foreground"
            >
              <LogOut className="h-3.5 w-3.5" aria-hidden="true" />
              <span>Salir</span>
            </Button>
          )}
        </div>
      </div>

      {bottomSlot}
    </header>
  );
}
