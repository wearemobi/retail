import { createAuthStore } from "@retail/common";
export type { OperatorSession } from "@retail/common";

export const useAuthStore = createAuthStore("ware-pos.auth");
