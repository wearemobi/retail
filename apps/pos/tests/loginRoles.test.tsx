import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { LoginScreen } from "@retail/common";
import type { Cashier } from "@retail/common";

const roster = [
  { id: "op-1", username: "cajero01", display_name: "Cajero Uno", roles: ["CASHIER"] },
  { id: "op-2", username: "admin01", display_name: "Admin Uno", roles: ["ADMIN"] },
  { id: "op-3", username: "cocinero01", display_name: "Cocinero Uno", roles: ["KITCHEN"] },
] as Cashier[];

function renderLogin(allowedRoles?: string[]) {
  return render(
    <LoginScreen
      title="MobiWare Retail POS"
      subtitle="Terminal de punto de venta"
      tenantId="tenant_demo_sv"
      allowedRoles={allowedRoles}
      fetchCashiers={vi.fn().mockResolvedValue(roster)}
      loginWithPin={vi.fn()}
      onLoginSuccess={vi.fn()}
    />,
  );
}

afterEach(() => {
  cleanup();
});

describe("LoginScreen role gate (SPEC-WRTL1)", () => {
  it("shows only CASHIER and ADMIN operators", async () => {
    renderLogin(["CASHIER", "ADMIN"]);

    expect(await screen.findByText("Cajero Uno")).toBeInTheDocument();
    expect(screen.getByText("Admin Uno")).toBeInTheDocument();
    expect(screen.queryByText("Cocinero Uno")).not.toBeInTheDocument();
  });

  it("shows every operator when no role gate is provided", async () => {
    renderLogin();

    expect(await screen.findByText("Cajero Uno")).toBeInTheDocument();
    expect(screen.getByText("Admin Uno")).toBeInTheDocument();
    expect(screen.getByText("Cocinero Uno")).toBeInTheDocument();
  });
});
