export const DEFAULT_EMISSION_POINT = "M001";
export const EMISSION_POINT_PATTERN = /^[A-Z0-9]{4}$/;

function storageKey(tenantId: string): string {
  return `ware-pos.emissionPoint.${tenantId}`;
}

function normalize(value: string): string {
  return value.trim().toUpperCase();
}

export function isValidEmissionPoint(value: string): boolean {
  return EMISSION_POINT_PATTERN.test(normalize(value));
}

export function getEmissionPoint(tenantId: string): string {
  if (typeof window === "undefined" || !tenantId) return DEFAULT_EMISSION_POINT;
  try {
    const stored = normalize(window.localStorage.getItem(storageKey(tenantId)) ?? "");
    if (isValidEmissionPoint(stored)) return stored;
  } catch {
    // restricted storage: fall back to default
  }
  return DEFAULT_EMISSION_POINT;
}

export function setEmissionPoint(tenantId: string, value: string): string {
  const normalized = normalize(value);
  if (!isValidEmissionPoint(normalized)) {
    throw new Error("El punto de emisión debe tener 4 caracteres alfanuméricos (ej. M001, P001).");
  }
  if (typeof window !== "undefined" && tenantId) {
    try {
      window.localStorage.setItem(storageKey(tenantId), normalized);
    } catch {
      // keep in-memory behavior by returning normalized value
    }
  }
  return normalized;
}
