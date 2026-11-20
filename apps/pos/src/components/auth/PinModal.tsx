import { PinModal, type PinModalProps } from "@retail/common";
import { loginWithPin, resolveTenantId } from "../../lib/api";
import { useAuthStore } from "../../store/auth";

export { PIN_LENGTH } from "@retail/common";

export default function PosPinModal(
  props: Omit<PinModalProps, "tenantId" | "onLoginSuccess" | "loginWithPin" | "accentColor">,
) {
  const login = useAuthStore((state) => state.login);
  return (
    <PinModal
      {...props}
      tenantId={resolveTenantId()}
      accentColor="retail"
      loginWithPin={loginWithPin}
      onLoginSuccess={login}
    />
  );
}
