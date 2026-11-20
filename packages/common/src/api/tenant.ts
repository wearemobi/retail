export const DEFAULT_TENANT_ID = "tenant_demo_sv";

export function resolveTenantId(storageKey = "kitchen.tenant"): string {
  if (typeof window === "undefined") {
    return DEFAULT_TENANT_ID;
  }
  const params = new URLSearchParams(window.location.search);
  const fromQuery = params.get("t") ?? params.get("tenant");
  if (fromQuery && fromQuery.trim() !== "") {
    const clean = fromQuery.trim();
    localStorage.setItem(storageKey, clean);
    return clean;
  }
  const fromStorage = localStorage.getItem(storageKey);
  if (fromStorage && fromStorage.trim() !== "") {
    return fromStorage.trim();
  }
  return DEFAULT_TENANT_ID;
}
