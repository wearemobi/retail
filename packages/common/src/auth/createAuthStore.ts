import { create } from "zustand";
import { persist } from "zustand/middleware";

export interface OperatorSession {
  token: string;
  tenantId: string;
  operatorId: string;
  operatorName: string;
  roles: string[];
  expiresAtUnix: number;
}

export interface AuthState {
  token: string;
  tenantId: string;
  operatorId: string;
  operatorName: string;
  roles: string[];
  expiresAtUnix: number;
  login: (session: OperatorSession) => void;
  logout: () => void;
}

const emptySession = {
  token: "",
  tenantId: "",
  operatorId: "",
  operatorName: "",
  roles: [] as string[],
  expiresAtUnix: 0,
};

/** True when a persisted session carries an expiry already in the past. */
function isExpired(session: Partial<AuthState>): boolean {
  const expiresAtUnix = session.expiresAtUnix;
  return (
    typeof expiresAtUnix === "number" &&
    expiresAtUnix > 0 &&
    expiresAtUnix * 1000 <= Date.now()
  );
}

export function createAuthStore(storageKey: string) {
  return create<AuthState>()(
    persist(
      (set) => ({
        ...emptySession,
        login: (session) => set({ ...session }),
        logout: () => set({ ...emptySession }),
      }),
      {
        name: storageKey,
        // SPEC-WSAT3 / kitchen#1: a device left overnight must not boot into a
        // dead session. Drop the persisted token before the UI mounts so the
        // PIN login screen is shown immediately instead of polling into 401s.
        merge: (persisted, current) => {
          const restored = (persisted ?? {}) as Partial<AuthState>;
          if (isExpired(restored)) {
            return { ...current };
          }
          return { ...current, ...restored };
        },
      },
    ),
  );
}
