import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("../src/lib/api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../src/lib/api")>();
  return { ...actual, getCurrentEmissionPoint: () => "M001", resolveTenantId: () => "tenant_demo" };
});
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import PosHeader from "../src/components/pos/PosHeader";
import { useAuthStore } from "../src/store/auth";

afterEach(() => {
  cleanup();
  window.localStorage.clear();
});

describe("PosHeader (SPEC-WRTL1)", () => {
  it("renders cash/cart metrics and the cashier badge", () => {
    useAuthStore.setState({ token: "sst", operatorName: "Cajero Uno" });
    render(
      <PosHeader
        search=""
        onSearch={vi.fn()}
        onSearchSubmit={vi.fn()}
        cartCount={2}
        cartTotal={30000}
        columns={3}
        onColumnsChange={vi.fn()}
        fontScale="base"
        onFontScaleChange={vi.fn()}
        theme="dark"
        onToggleTheme={vi.fn()}
      />,
    );

    expect(screen.getAllByText("M001").length).toBeGreaterThan(0);
    const cartMetric = screen.getByText("Carrito:").parentElement;
    expect(cartMetric).toHaveTextContent("Carrito:2");
    expect(screen.getByText("Cajero Uno")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Cambiar a tema claro" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Salir/ })).toBeInTheDocument();
  });

  it("changes the column count and UI scale", () => {
    const onColumnsChange = vi.fn();
    const onFontScaleChange = vi.fn();
    useAuthStore.setState({ token: "sst", operatorName: "" });

    render(
      <PosHeader
        search=""
        onSearch={vi.fn()}
        onSearchSubmit={vi.fn()}
        cartCount={0}
        cartTotal={0}
        columns={3}
        onColumnsChange={onColumnsChange}
        fontScale="base"
        onFontScaleChange={onFontScaleChange}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "4" }));
    expect(onColumnsChange).toHaveBeenCalledWith(4);

    fireEvent.click(screen.getByRole("button", { name: "A+" }));
    expect(onFontScaleChange).toHaveBeenCalledWith("lg");
  });

  it("submits the search term with Enter", () => {
    const onSearchSubmit = vi.fn();
    useAuthStore.setState({ token: "sst", operatorName: "" });

    render(
      <PosHeader
        search="SKU-01"
        onSearch={vi.fn()}
        onSearchSubmit={onSearchSubmit}
        cartCount={0}
        cartTotal={0}
        columns={3}
        onColumnsChange={vi.fn()}
        fontScale="base"
        onFontScaleChange={vi.fn()}
      />,
    );

    fireEvent.keyDown(screen.getByLabelText("Buscar producto o escanear código"), {
      key: "Enter",
    });
    expect(onSearchSubmit).toHaveBeenCalledWith("SKU-01");
  });
});
