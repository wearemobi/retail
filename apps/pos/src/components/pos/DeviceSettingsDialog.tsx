import { useEffect, useState } from "react";
import { AlertCircle, Settings, X } from "lucide-react";
import { Button, Input } from "@retail/common";
import { getEmissionPoint, setEmissionPoint, isValidEmissionPoint, DEFAULT_EMISSION_POINT } from "../../lib/emissionPoint";
import { resolveTenantId } from "../../lib/api";
import type { CashShift } from "../../lib/api";

interface Props {
  open: boolean;
  onClose: () => void;
  currentShift: CashShift | null;
  onSaved: (emissionPoint: string) => void;
}

export default function DeviceSettingsDialog({ open, onClose, currentShift, onSaved }: Props) {
  const tenantId = resolveTenantId();
  const [value, setValue] = useState(DEFAULT_EMISSION_POINT);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!open) return;
    setValue(getEmissionPoint(tenantId));
    setError("");
  }, [open, tenantId]);

  if (!open) return null;

  const shiftOpen = currentShift?.status === "OPEN";

  function handleSave() {
    if (shiftOpen) {
      setError("No puedes cambiar el punto de emisión con un turno abierto. Cierra el turno antes de continuar.");
      return;
    }
    const normalized = value.trim().toUpperCase();
    if (!isValidEmissionPoint(normalized)) {
      setError("Formato inválido. Usa 4 caracteres alfanuméricos, por ejemplo M001 o P001.");
      return;
    }
    try {
      const saved = setEmissionPoint(tenantId, normalized);
      onSaved(saved);
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo guardar el punto de emisión.");
    }
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Configurar caja"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="flex w-full max-w-md flex-col overflow-hidden rounded-2xl border border-border bg-card shadow-xl">
        <div className="flex items-center justify-between border-b border-border px-4 py-3">
          <div className="flex items-center gap-2">
            <Settings className="h-4 w-4 text-accent-brand" aria-hidden="true" />
            <h2 className="text-base font-bold">Configurar caja</h2>
          </div>
          <Button variant="ghost" size="xs" className="h-8 w-8 px-0" onClick={onClose} aria-label="Cerrar configuración">
            <X className="h-4 w-4" aria-hidden="true" />
          </Button>
        </div>

        <div className="flex flex-col gap-4 p-4">
          <p className="text-xs text-muted-foreground">
            El punto de emisión identifica esta caja física. Se guarda localmente por tenant y se usa en turnos y checkout.
          </p>

          {shiftOpen && (
            <div className="flex items-start gap-2 rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-700 dark:text-amber-400">
              <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
              <span>Hay un turno abierto en este dispositivo. Cierra el turno antes de cambiar el punto de emisión.</span>
            </div>
          )}

          {error && (
            <div role="alert" className="flex items-start gap-2 rounded-lg border border-destructive/30 bg-destructive/15 px-3 py-2 text-xs text-destructive">
              <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
              <span>{error}</span>
            </div>
          )}

          <label className="flex flex-col gap-1.5">
            <span className="text-xs font-medium text-muted-foreground">Punto de emisión</span>
            <Input
              value={value}
              onChange={(e) => setValue(e.target.value.toUpperCase())}
              placeholder="M001"
              aria-label="Punto de emisión"
              maxLength={4}
              className="font-mono uppercase"
              disabled={shiftOpen}
            />
            <span className="text-[11px] text-muted-foreground">Formato: 4 caracteres alfanuméricos (ej. M001, P001).</span>
          </label>

          <div className="flex items-center justify-end gap-2">
            <Button variant="outline" onClick={onClose}>Cancelar</Button>
            <Button variant="accent" onClick={handleSave} disabled={shiftOpen}>Guardar</Button>
          </div>
        </div>
      </div>
    </div>
  );
}
