import { AlertCircle, CloudOff, RefreshCw, X } from "lucide-react";
import { Badge, Button } from "@retail/common";
import type { OfflineSaleRecord } from "../../lib/api";
import { formatScaledMoney } from "../../lib/quantity";

interface OfflineQueueDrawerProps {
  open: boolean;
  records: OfflineSaleRecord[];
  syncing: boolean;
  onClose: () => void;
  onSync: () => void;
}

export default function OfflineQueueDrawer({
  open,
  records,
  syncing,
  onClose,
  onSync,
}: OfflineQueueDrawerProps) {
  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-40 flex justify-end bg-black/60"
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <aside className="flex h-full w-full max-w-xl flex-col border-l border-border bg-card shadow-xl">
        <div className="flex items-center justify-between border-b border-border px-4 py-3">
          <div className="flex items-center gap-2">
            <CloudOff className="h-4 w-4 text-amber-500" aria-hidden="true" />
            <h2 className="text-sm font-bold">Cola de contingencia</h2>
            <Badge variant={records.length > 0 ? "accent" : "outline"}>{records.length}</Badge>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="accent" size="sm" onClick={onSync} disabled={syncing || records.length === 0}>
              <RefreshCw className={syncing ? "h-4 w-4 animate-spin" : "h-4 w-4"} aria-hidden="true" />
              Sincronizar Ahora
            </Button>
            <Button variant="ghost" size="xs" className="h-8 w-8 px-0" onClick={onClose} aria-label="Cerrar cola offline">
              <X className="h-4 w-4" aria-hidden="true" />
            </Button>
          </div>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto p-4">
          {records.length === 0 ? (
            <div className="flex h-full min-h-40 flex-col items-center justify-center gap-2 text-center text-muted-foreground">
              <CloudOff className="h-8 w-8" aria-hidden="true" />
              <p className="text-sm font-medium">No hay ventas en contingencia.</p>
              <p className="text-xs">Las ventas sin conexión aparecerán aquí hasta sincronizarse.</p>
            </div>
          ) : (
            <ul className="flex flex-col gap-3">
              {records.map((record) => (
                <li key={record.idempotencyKey} className="rounded-xl border border-border bg-background p-3">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-sm font-semibold">
                        {record.customerName || "Consumidor Final"}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {new Date(record.createdAt).toLocaleString("es-SV")} · {record.kind === "ORDER_CHECKOUT" ? `Orden ${record.orderId}` : "Venta POS"}
                      </p>
                      <p className="font-mono text-[11px] text-muted-foreground break-all">
                        Idempotency: {record.idempotencyKey}
                      </p>
                    </div>
                    <div className="flex flex-col items-end gap-1">
                      <Badge variant={record.status === "ERROR" ? "destructive" : "secondary"}>
                        {record.status === "ERROR" ? "ERROR" : "PENDING"}
                      </Badge>
                      <span className="font-mono text-sm font-bold">{formatScaledMoney(record.total)}</span>
                    </div>
                  </div>
                  {record.lastError && (
                    <div className="mt-2 flex items-start gap-2 rounded-md border border-destructive/30 bg-destructive/10 px-2 py-1.5 text-xs text-destructive">
                      <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                      <span>{record.lastError}</span>
                    </div>
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>
      </aside>
    </div>
  );
}
