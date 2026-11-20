import { LoginScreen } from "@retail/common";
import { fetchCashiers, loginWithPin, resolveTenantId } from "../../lib/api";
import { useAuthStore } from "../../store/auth";

export const POS_ROLES = ["CASHIER", "ADMIN"] as const;

export default function PosLoginScreen() {
  const login = useAuthStore((state) => state.login);
  return (
    <LoginScreen
      title="MobiWare Retail POS"
      subtitle="Terminal de punto de venta"
      operatorsAriaLabel="Cajeros autorizados"
      accentColor="retail"
      allowedRoles={[...POS_ROLES]}
      tenantId={resolveTenantId()}
      fetchCashiers={fetchCashiers}
      loginWithPin={loginWithPin}
      onLoginSuccess={login}
    />
  );
}
