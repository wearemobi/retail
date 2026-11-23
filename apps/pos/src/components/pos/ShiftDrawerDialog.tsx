import { useEffect, useState } from "react";
import { AlertCircle, Loader2, Wallet, X } from "lucide-react";
import { Badge, Button, Input } from "@retail/common";
import {
  closeShift,
  fetchCurrentShift,
  fetchShiftReport,
  getCurrentEmissionPoint,
  openShift,
  recordShiftMovement,
  resolveTenantId,
  type CashShift,
  type CashShiftReport,
} from "../../lib/api";
import { formatScaledMoney, parseMoneyInput } from "../../lib/quantity";
import { useAuthStore } from "../../store/auth";

interface ShiftDrawerDialogProps {
  open: boolean;
  onClose: () => void;
  onShiftChange?: (shift: CashShift | null) => void;
}

function shiftBadge(status?: string) {
  return status === "OPEN" ? (
    <Badge variant="default">OPEN</Badge>
  ) : status === "CLOSED" ? (
    <Badge variant="secondary">CLOSED</Badge>
  ) : null;
}

function differenceBadge(diff: number | null | undefined) {
  if (diff == null) return null;
  if (diff === 0) return <Badge className="bg-emerald-500/15 text-emerald-600">Cuadrado</Badge>;
  if (diff > 0) return <Badge className="bg-amber-500/15 text-amber-700">Sobrante</Badge>;
  return <Badge className="bg-destructive/15 text-destructive">Faltante</Badge>;
}

export default function ShiftDrawerDialog({ open, onClose, onShiftChange }: ShiftDrawerDialogProps) {
  const operatorId = useAuthStore((s) => s.operatorId);
  const operatorName = useAuthStore((s) => s.operatorName);
  const businessId = useAuthStore((s) => s.businessId);
  const emissionPoint = getCurrentEmissionPoint();
  const [shift, setShift] = useState<CashShift | null>(null);
  const [report, setReport] = useState<CashShiftReport | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [openingCash, setOpeningCash] = useState("0.00");
  const [movementType, setMovementType] = useState<"CASH_IN" | "CASH_OUT">("CASH_IN");
  const [movementAmount, setMovementAmount] = useState("");
  const [movementReason, setMovementReason] = useState("");
  const [countedCash, setCountedCash] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setLoading(true);
    setError("");
    fetchCurrentShift(operatorId, emissionPoint)
      .then(async (current) => {
        if (cancelled) return;
        setShift(current);
        onShiftChange?.(current);
        if (current?.id) {
          const rep = await fetchShiftReport(current.id);
          if (!cancelled) setReport(rep);
        } else {
          setReport(null);
        }
      })
      .catch((e: Error) => {
        if (!cancelled) setError(e.message);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [open, operatorId, onShiftChange]);

  if (!open) return null;

  async function refresh(id: string) {
    const [current, rep] = await Promise.all([
      fetchCurrentShift(operatorId, emissionPoint),
      fetchShiftReport(id),
    ]);
    setShift(current);
    setReport(rep);
    onShiftChange?.(current);
  }

  async function handleOpen() {
    const scaled = parseMoneyInput(openingCash);
    if (scaled == null) {
      setError("Ingresa un fondo inicial válido.");
      return;
    }
    setBusy(true);
    setError("");
    try {
      const created = await openShift({
        business_id: businessId || undefined,
        emission_point: emissionPoint,
        operator_id: operatorId,
        operator_name: operatorName || operatorId,
        opening_cash: scaled,
      });
      setShift(created);
      onShiftChange?.(created);
      setReport(await fetchShiftReport(created.id));
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo abrir el turno.");
    } finally {
      setBusy(false);
    }
  }

  async function handleMovement() {
    if (!shift) return;
    const scaled = parseMoneyInput(movementAmount);
    if (scaled == null || scaled <= 0) {
      setError("Ingresa un monto mayor a 0.");
      return;
    }
    if (!movementReason.trim()) {
      setError("La razón del movimiento es requerida.");
      return;
    }
    setBusy(true);
    setError("");
    try {
      await recordShiftMovement(shift.id, {
        movement_type: movementType,
        amount: scaled,
        reason: movementReason.trim(),
        operator_id: operatorId,
      });
      setMovementAmount("");
      setMovementReason("");
      await refresh(shift.id);
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo registrar el movimiento.");
    } finally {
      setBusy(false);
    }
  }

  async function handleClose() {
    if (!shift) return;
    const scaled = parseMoneyInput(countedCash);
    if (scaled == null) {
      setError("Ingresa el efectivo contado.");
      return;
    }
    setBusy(true);
    setError("");
    try {
      const result = await closeShift(shift.id, { counted_cash: scaled });
      setShift(result.shift);
      setReport(result.report);
      onShiftChange?.(result.shift.status === "OPEN" ? result.shift : null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo cerrar el turno.");
    } finally {
      setBusy(false);
    }
  }

  const active = shift?.status === "OPEN" ? shift : null;
  const closed = shift?.status === "CLOSED" ? shift : null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Turno de caja"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4"
      onClick={(e) => {
        if (e.target === e.currentTarget && !busy) onClose();
      }}
    >
      <div className="flex max-h-[92vh] w-full max-w-3xl flex-col overflow-hidden rounded-2xl border border-border bg-card shadow-xl">
        <div className="flex items-center justify-between border-b border-border px-4 py-3">
          <div className="flex items-center gap-2">
            <Wallet className="h-4 w-4 text-accent-brand" aria-hidden="true" />
            <h2 className="text-base font-bold">Turno de Caja</h2>
            {shiftBadge(shift?.status)}
          </div>
          <Button variant="ghost" size="xs" className="h-8 w-8 px-0" onClick={onClose} disabled={busy} aria-label="Cerrar">
            <X className="h-4 w-4" aria-hidden="true" />
          </Button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto p-4">
          {loading && <p className="text-sm text-muted-foreground">Cargando turno…</p>}
          {error && (
            <div role="alert" className="mb-3 flex items-start gap-2 rounded-lg border border-destructive/30 bg-destructive/15 px-3 py-2 text-xs text-destructive">
              <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
              <span>{error}</span>
            </div>
          )}

          {!loading && !active && !closed && (
            <div className="flex flex-col gap-3 rounded-xl border border-border p-4">
              <h3 className="text-sm font-semibold">Apertura de Turno</h3>
              <p className="text-xs text-muted-foreground">Tenant {resolveTenantId()} · Punto {emissionPoint} · Operador {operatorName || operatorId}</p>
              <label className="flex flex-col gap-1 text-xs font-medium">
                Fondo inicial (USD)
                <Input inputMode="decimal" value={openingCash} onChange={(e) => setOpeningCash(e.target.value)} />
              </label>
              <Button variant="accent" onClick={() => void handleOpen()} disabled={busy}>
                {busy ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : null}
                Abrir caja
              </Button>
            </div>
          )}

          {active && (
            <div className="flex flex-col gap-4">
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                <div className="rounded-lg border border-border p-3"><p className="text-[11px] text-muted-foreground">Fondo inicial</p><p className="font-bold">{formatScaledMoney(active.opening_cash)}</p></div>
                <div className="rounded-lg border border-border p-3"><p className="text-[11px] text-muted-foreground">Ventas efectivo</p><p className="font-bold">{formatScaledMoney(active.cash_sales ?? 0)}</p></div>
                <div className="rounded-lg border border-border p-3"><p className="text-[11px] text-muted-foreground">Entradas/Salidas</p><p className="font-bold">{formatScaledMoney((active.cash_in ?? 0) - (active.cash_out ?? 0))}</p></div>
                <div className="rounded-lg border border-border p-3"><p className="text-[11px] text-muted-foreground">Efectivo esperado</p><p className="font-bold">{formatScaledMoney(active.expected_cash ?? 0)}</p></div>
              </div>

              <div className="flex flex-col gap-2 rounded-xl border border-border p-4">
                <h3 className="text-sm font-semibold">Movimiento de caja chica</h3>
                <div className="flex gap-2">
                  <Button type="button" variant={movementType === "CASH_IN" ? "default" : "outline"} size="sm" onClick={() => setMovementType("CASH_IN")}>CASH_IN</Button>
                  <Button type="button" variant={movementType === "CASH_OUT" ? "default" : "outline"} size="sm" onClick={() => setMovementType("CASH_OUT")}>CASH_OUT</Button>
                </div>
                <div className="grid gap-2 sm:grid-cols-2">
                  <label className="flex flex-col gap-1 text-xs font-medium">Monto (USD)<Input inputMode="decimal" value={movementAmount} onChange={(e) => setMovementAmount(e.target.value)} /></label>
                  <label className="flex flex-col gap-1 text-xs font-medium">Razón<Input value={movementReason} onChange={(e) => setMovementReason(e.target.value)} /></label>
                </div>
                <Button variant="outline" onClick={() => void handleMovement()} disabled={busy}>Registrar movimiento</Button>
              </div>

              <div className="flex flex-col gap-2 rounded-xl border border-border p-4">
                <h3 className="text-sm font-semibold">Cierre Definitivo Z</h3>
                <label className="flex flex-col gap-1 text-xs font-medium">Efectivo contado (USD)<Input inputMode="decimal" value={countedCash} onChange={(e) => setCountedCash(e.target.value)} /></label>
                {parseMoneyInput(countedCash) != null && (
                  <p className="text-xs text-muted-foreground">
                    Diferencia: {formatScaledMoney((parseMoneyInput(countedCash) ?? 0) - (active.expected_cash ?? 0))}
                  </p>
                )}
                <Button variant="accent" onClick={() => void handleClose()} disabled={busy}>Cerrar turno (Z)</Button>
              </div>
            </div>
          )}

          {closed && (
            <div className="flex flex-col gap-3 rounded-xl border border-border p-4">
              <div className="flex items-center gap-2"><h3 className="text-sm font-semibold">Cierre Z</h3>{differenceBadge(closed.difference_cash)}</div>
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 text-sm">
                <div><p className="text-muted-foreground text-xs">Esperado</p><p className="font-bold">{formatScaledMoney(closed.expected_cash ?? 0)}</p></div>
                <div><p className="text-muted-foreground text-xs">Contado</p><p className="font-bold">{formatScaledMoney(closed.counted_cash ?? 0)}</p></div>
                <div><p className="text-muted-foreground text-xs">Diferencia</p><p className="font-bold">{formatScaledMoney(closed.difference_cash ?? 0)}</p></div>
              </div>
            </div>
          )}

          {report && report.movements && report.movements.length > 0 && (
            <div className="mt-4 flex flex-col gap-2">
              <h3 className="text-sm font-semibold">Movimientos ({report.movement_count ?? report.movements.length})</h3>
              <ul className="flex flex-col gap-1 text-xs">
                {report.movements.map((m, i) => (
                  <li key={m.id ?? i} className="flex items-center justify-between rounded border border-border px-2 py-1">
                    <span>{m.movement_type} · {m.reason || "—"}</span>
                    <span className="font-mono">{formatScaledMoney(m.amount)}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
