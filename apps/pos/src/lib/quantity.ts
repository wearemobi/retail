/**
 * Retail quantities and monetary amounts travel as fixed-point 10^-4 integers
 * (1 unit = 10000). The UI works with human units and converts at the edge.
 */
export const QUANTITY_SCALE = 10_000;

const DECIMAL_UOM_CODES = new Set([
  "34", // galón
  "35", // gramo
  "36", // kilogramo
  "37", // litro
  "38", // metro
  "39", // metro cuadrado
  "40", // metro cúbico
  "41", // onza
  "42", // libra
  "43", // tonelada
  "44", // yarda
  "45", // mililitro
]);

const DECIMAL_UOM_TEXT = /^(kg|kgs|g|gr|grs|lb|lbs|oz|lt|l|ml|m|m2|m3|gal|ton)$/i;

const UNIT_LABELS: Record<string, string> = {
  "34": "gal",
  "35": "g",
  "36": "kg",
  "37": "L",
  "38": "m",
  "39": "m²",
  "40": "m³",
  "41": "oz",
  "42": "lb",
  "43": "t",
  "44": "yd",
  "45": "ml",
  "59": "u.",
  "99": "u.",
};

export function toScaled(humanValue: number): number {
  return Math.round(humanValue * QUANTITY_SCALE);
}

export function fromScaled(scaledValue: number): number {
  return scaledValue / QUANTITY_SCALE;
}

/** Formats a 10^-4 quantity without trailing zero noise (1.2500 -> "1.25"). */
export function formatScaledQuantity(scaledValue: number): string {
  const value = fromScaled(scaledValue);
  if (!Number.isFinite(value)) return "0";
  return value.toFixed(4).replace(/0+$/, "").replace(/\.$/, "");
}

/** Formats a 10^-4 amount as USD currency. */
export function formatScaledMoney(scaledValue: number): string {
  return new Intl.NumberFormat("es-SV", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(fromScaled(scaledValue));
}

/** Parses a decimal money input ("12.50", "12,50") into the 10^-4 scale. */
export function parseMoneyInput(raw: string): number | null {
  const normalized = raw.trim().replace(",", ".");
  if (normalized === "") return null;
  const value = Number(normalized);
  if (!Number.isFinite(value) || value < 0) return null;
  return toScaled(value);
}

/** Heuristic: CAT-014 weight/volume units accept decimal quantities. */
export function isWeightedUnit(unitOfMeasure: string | undefined): boolean {
  const uom = (unitOfMeasure ?? "").trim();
  if (uom === "") return false;
  return DECIMAL_UOM_CODES.has(uom) || DECIMAL_UOM_TEXT.test(uom);
}

export function unitLabel(unitOfMeasure: string | undefined): string {
  const uom = (unitOfMeasure ?? "").trim();
  return UNIT_LABELS[uom] ?? "u.";
}
