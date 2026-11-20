import { useState, type FormEvent } from "react";
import type { Cashier, PinLoginResponse } from "../api/client";
import type { OperatorSession } from "./createAuthStore";
import { playKeypadClick } from "../audio/sounds";

export const PIN_LENGTH = 6;

const KEYS = ["1", "2", "3", "4", "5", "6", "7", "8", "9", "backspace", "0", "clear"] as const;

export interface PinModalProps {
  cashier: Cashier;
  tenantId: string;
  onClose: () => void;
  onLoginSuccess: (session: OperatorSession) => void;
  loginWithPin: (username: string, pin: string) => Promise<PinLoginResponse>;
  accentColor?: "amber" | "emerald" | "retail";
}

export function PinModal({
  cashier,
  tenantId,
  onClose,
  onLoginSuccess,
  loginWithPin,
  accentColor = "amber",
}: PinModalProps) {
  const [pin, setPin] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [shake, setShake] = useState(false);

  function press(key: (typeof KEYS)[number]) {
    setError("");
    if (key === "backspace") {
      setPin((p) => p.slice(0, -1));
      playKeypadClick();
      return;
    }
    if (key === "clear") {
      setPin("");
      return;
    }
    playKeypadClick();
    setPin((p) => (p.length >= PIN_LENGTH ? p : p + key));
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (pin.length !== PIN_LENGTH || submitting) return;
    setSubmitting(true);
    setError("");
    try {
      const session = await loginWithPin(cashier.username ?? "", pin);
      onLoginSuccess({
        token: session.token ?? "",
        tenantId: session.tenant_id ?? tenantId,
        operatorId: session.operator_id ?? cashier.id ?? "",
        operatorName: session.display_name ?? cashier.display_name ?? cashier.username ?? "",
        roles: session.roles ?? [],
        expiresAtUnix: session.expires_at_unix ?? 0,
      });
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error de autenticación.");
      setPin("");
      setShake(true);
      window.setTimeout(() => setShake(false), 400);
    } finally {
      setSubmitting(false);
    }
  }

  const activeColorClass =
    accentColor === "emerald"
      ? "active:bg-emerald-500 active:text-zinc-950"
      : accentColor === "retail"
        ? "active:bg-sky-500 active:text-zinc-950"
        : "active:bg-amber-500 active:text-zinc-950";

  const dotColorClass = (filled: boolean) => {
    if (!filled) return "bg-zinc-700";
    if (accentColor === "emerald") return "bg-emerald-400";
    if (accentColor === "retail") return "bg-sky-400";
    return "bg-amber-400";
  };

  const submitButtonClass =
    accentColor === "emerald"
      ? "mt-5 h-14 w-full rounded-2xl bg-emerald-500 text-lg font-bold text-zinc-950 transition-opacity disabled:opacity-40"
      : accentColor === "retail"
        ? "mt-5 h-14 w-full rounded-2xl bg-sky-500 text-lg font-bold text-zinc-950 transition-opacity disabled:opacity-40"
        : "mt-5 h-14 w-full rounded-2xl bg-amber-500 text-lg font-bold text-zinc-950 transition-opacity disabled:opacity-40";

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={`PIN de ${cashier.display_name ?? cashier.username}`}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <form
        onSubmit={handleSubmit}
        className={`w-full max-w-sm rounded-3xl border border-zinc-800 bg-zinc-900 p-6 ${shake ? "pin-shake" : ""}`}
      >
        <div className="mb-4 flex items-center justify-between">
          <div>
            <p className="text-lg font-semibold">{cashier.display_name ?? cashier.username}</p>
            <p className="text-xs text-zinc-400">Digita tu PIN de {PIN_LENGTH} dígitos</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Cancelar"
            className="rounded-full p-2 text-zinc-400 hover:bg-zinc-800"
          >
            ✕
          </button>
        </div>

        <output
          aria-label="PIN ingresado"
          className="mb-4 flex h-12 items-center justify-center gap-2 rounded-xl bg-zinc-950"
        >
          {Array.from({ length: PIN_LENGTH }, (_, i) => (
            <span
              key={i}
              data-testid={`pin-dot-${i}`}
              className={`size-3 rounded-full ${dotColorClass(i < pin.length)}`}
            />
          ))}
        </output>

        {error && (
          <p role="alert" className="mb-3 text-center text-sm text-red-400">
            {error}
          </p>
        )}

        <div className="grid grid-cols-3 gap-3">
          {KEYS.map((key) => (
            <button
              key={key}
              type="button"
              onClick={() => press(key)}
              aria-label={key === "backspace" ? "Borrar" : key === "clear" ? "Limpiar" : key}
              className={`h-16 rounded-2xl bg-zinc-800 text-2xl font-semibold transition-colors hover:bg-zinc-700 ${activeColorClass}`}
            >
              {key === "backspace" ? "⌫" : key === "clear" ? "C" : key}
            </button>
          ))}
        </div>

        <button
          type="submit"
          disabled={pin.length !== PIN_LENGTH || submitting}
          className={submitButtonClass}
        >
          {submitting ? "Verificando…" : "Entrar"}
        </button>
      </form>
    </div>
  );
}

export default PinModal;
