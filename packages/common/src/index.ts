// Authentication & Sessions
export { LoginScreen } from "./auth/LoginScreen";
export type { LoginScreenProps } from "./auth/LoginScreen";
export { PinModal, PIN_LENGTH } from "./auth/PinModal";
export type { PinModalProps } from "./auth/PinModal";
export { createAuthStore } from "./auth/createAuthStore";
export type { OperatorSession, AuthState } from "./auth/createAuthStore";

// API & OpenAPI Client
export {
  createApiClient,
  fetchCashiers,
  loginWithPin,
  parseApiError,
} from "./api/client";
export type { ApiClient, Cashier, PinLoginResponse, paths } from "./api/client";
export { resolveTenantId, DEFAULT_TENANT_ID } from "./api/tenant";

// Audio & Web Audio API
export {
  playNewTicketChime,
  playTransitionSound,
  playKeypadClick,
  playAdd,
  playRemove,
  playSuccess,
  tone,
} from "./audio/sounds";

// Utilities
export { initials } from "./utils/initials";
export { formatMoney } from "./utils/format";

// Shared shadcn-style UI (Option A)
export { cn } from "./ui/cn";
export { Button, buttonVariants } from "./ui/Button";
export type { ButtonProps } from "./ui/Button";
export { Badge, badgeVariants } from "./ui/Badge";
export type { BadgeProps } from "./ui/Badge";
export { Card, CardHeader, CardContent, CardFooter } from "./ui/Card";
export { Input } from "./ui/Input";
export { QuantityStepper } from "./ui/QuantityStepper";
export type { QuantityStepperProps } from "./ui/QuantityStepper";
export { SatelliteHeader } from "./ui/SatelliteHeader";
export type { SatelliteHeaderProps, SatelliteMetric } from "./ui/SatelliteHeader";
export {
  resolveSatelliteTheme,
  applySatelliteTheme,
  useSatelliteTheme,
} from "./ui/theme";
export type { SatelliteTheme } from "./ui/theme";
