import { useEffect, useState } from "react";
import { Minus, Plus } from "lucide-react";
import { Button } from "./Button";
import { Input } from "./Input";
import { cn } from "./cn";

export interface QuantityStepperProps {
  id?: string;
  value: number;
  onChange: (value: number) => void;
  min?: number;
  max?: number;
  step?: number;
  allowDecimals?: boolean;
  precision?: number;
  unitLabel?: string;
  disabled?: boolean;
  className?: string;
  "aria-label"?: string;
}

function clampAndRound(
  raw: number,
  min: number | undefined,
  max: number | undefined,
  allowDecimals: boolean,
  precision: number,
): number {
  let next = Number.isFinite(raw) ? raw : (min ?? 0);
  if (min !== undefined && next < min) next = min;
  if (max !== undefined && next > max) next = max;
  if (!allowDecimals) {
    return Math.round(next);
  }
  const factor = 10 ** precision;
  return Math.round(next * factor) / factor;
}

/**
 * Shadcn-styled numeric stepper supporting integer counts (orders, priorities)
 * and decimal quantities (weighable products with up to 4 decimal places).
 *
 * The value is expressed in human units (e.g. 1.2500 kg), not in the 10^-4
 * fixed-point scale used by the Retail API. Callers convert at the boundary.
 */
export function QuantityStepper({
  id,
  value,
  onChange,
  min = 0,
  max,
  step,
  allowDecimals = false,
  precision = allowDecimals ? 4 : 0,
  unitLabel,
  disabled = false,
  className,
  "aria-label": ariaLabel,
}: QuantityStepperProps) {
  const effectiveStep = step ?? (allowDecimals ? 0.25 : 1);
  const [draft, setDraft] = useState(() => String(value));

  useEffect(() => {
    setDraft(String(value));
  }, [value]);

  const commit = (raw: number) => {
    const next = clampAndRound(raw, min, max, allowDecimals, precision);
    setDraft(String(next));
    onChange(next);
  };

  const handleInputChange = (rawText: string) => {
    const normalized = rawText.replace(",", ".");
    const pattern = allowDecimals ? /^-?\d*(\.\d*)?$/ : /^-?\d*$/;
    if (!pattern.test(normalized)) return;

    setDraft(normalized);
    if (
      normalized === "" ||
      normalized === "-" ||
      normalized === "." ||
      normalized.endsWith(".")
    ) {
      return;
    }
    const parsed = Number(normalized);
    if (Number.isFinite(parsed)) {
      const clamped = clampAndRound(parsed, min, max, allowDecimals, precision);
      onChange(clamped);
    }
  };

  const canDecrement = !disabled && (min === undefined || value > min);
  const canIncrement = !disabled && (max === undefined || value < max);

  return (
    <div className={cn("flex items-center gap-1.5", className)}>
      <Button
        type="button"
        variant="outline"
        size="icon"
        disabled={!canDecrement}
        aria-label="Disminuir"
        onClick={() => commit(value - effectiveStep)}
        className="h-9 w-9 shrink-0"
      >
        <Minus className="h-4 w-4" />
      </Button>

      <div className="relative flex-1">
        <Input
          id={id}
          type="text"
          inputMode={allowDecimals ? "decimal" : "numeric"}
          aria-label={ariaLabel}
          disabled={disabled}
          value={draft}
          onChange={(event) => handleInputChange(event.target.value)}
          onBlur={() => {
            if (draft === "" || draft === "-" || Number.isNaN(Number(draft))) {
              commit(min ?? 0);
            } else {
              commit(Number(draft));
            }
          }}
          className={cn(
            "text-center font-mono tabular-nums",
            unitLabel ? "pr-10" : "",
          )}
        />
        {unitLabel && (
          <span className="pointer-events-none absolute top-1/2 right-2.5 -translate-y-1/2 text-xs text-muted-foreground">
            {unitLabel}
          </span>
        )}
      </div>

      <Button
        type="button"
        variant="outline"
        size="icon"
        disabled={!canIncrement}
        aria-label="Aumentar"
        onClick={() => commit(value + effectiveStep)}
        className="h-9 w-9 shrink-0"
      >
        <Plus className="h-4 w-4" />
      </Button>
    </div>
  );
}

export default QuantityStepper;
