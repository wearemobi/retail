import { Button } from "@retail/common";

interface PresaleConfirmDialogProps {
  open: boolean;
  displayId: string;
  onClose: () => void;
}

export default function PresaleConfirmDialog({
  open,
  displayId,
  onClose,
}: PresaleConfirmDialogProps) {
  if (!open) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Preventa enviada a caja"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4"
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div className="w-full max-w-sm rounded-2xl border border-border bg-card p-5 shadow-xl">
        <h2 className="text-base font-bold">Enviado a Caja</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          Presenta este número en la caja central para completar el pago.
        </p>
        <p className="mt-4 text-center font-mono text-2xl font-bold text-accent-brand">
          {displayId || "—"}
        </p>
        <div className="mt-5 flex justify-end">
          <Button variant="accent" onClick={onClose}>
            Nueva venta
          </Button>
        </div>
      </div>
    </div>
  );
}
