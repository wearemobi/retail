import { useSatelliteTheme } from "@retail/common";
import { useAuthStore } from "./store/auth";
import LoginScreen from "./components/auth/LoginScreen";
import PosScreen from "./components/pos/PosScreen";

export default function App() {
  const token = useAuthStore((state) => state.token);
  const { theme, toggleTheme } = useSatelliteTheme("ware-pos.theme");

  if (!token) {
    return <LoginScreen />;
  }

  return <PosScreen theme={theme} onToggleTheme={toggleTheme} />;
}
