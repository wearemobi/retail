import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import {
  applySatelliteTheme,
  resolveSatelliteTheme,
  SatelliteHeader,
} from "@retail/common";

describe("satellite theme (SPEC-WRTL1)", () => {
  beforeEach(() => {
    window.localStorage.clear();
    document.documentElement.classList.remove("dark");
  });

  afterEach(() => {
    cleanup();
  });

  it("inherits ?theme=light from RetailAccessDialog and persists it", () => {
    expect(resolveSatelliteTheme("ware-pos.theme", "")).toBe("dark");
    expect(resolveSatelliteTheme("ware-pos.theme", "?t=tenant_demo_sv&theme=light")).toBe(
      "light",
    );
    expect(window.localStorage.getItem("ware-pos.theme")).toBe("light");
    expect(resolveSatelliteTheme("ware-pos.theme", "")).toBe("light");
  });

  it("toggles the .dark class on documentElement", () => {
    applySatelliteTheme("dark");
    expect(document.documentElement.classList.contains("dark")).toBe(true);
    applySatelliteTheme("light");
    expect(document.documentElement.classList.contains("dark")).toBe(false);
  });

  it("renders the Sun/Moon toggle and Salir in SatelliteHeader", () => {
    const onToggleTheme = vi.fn();
    const onLogout = vi.fn();
    render(
      <SatelliteHeader
        title="MobiWare Retail POS"
        theme="dark"
        onToggleTheme={onToggleTheme}
        onLogout={onLogout}
        operatorName="Cajero Uno"
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Cambiar a tema claro" }));
    expect(onToggleTheme).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByRole("button", { name: /Salir/ }));
    expect(onLogout).toHaveBeenCalledTimes(1);

    expect(screen.getByText("Cajero Uno")).toBeInTheDocument();
  });
});
