import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import DeviceSettingsDialog from "./DeviceSettingsDialog";
import { getEmissionPoint, setEmissionPoint } from "../../lib/emissionPoint";

vi.mock("../../lib/api", () => ({
  resolveTenantId: () => "tenant_test",
}));

describe("DeviceSettingsDialog (SPEC-WRTL7)", () => {
  beforeEach(() => {
    localStorage.clear();
  });
  afterEach(() => cleanup());

  it("defaults to M001 when no config exists", () => {
    expect(getEmissionPoint("tenant_test")).toBe("M001");
    render(<DeviceSettingsDialog open onClose={vi.fn()} currentShift={null} onSaved={vi.fn()} />);
    expect(screen.getByLabelText(/Punto de emisión/i)).toHaveValue("M001");
  });

  it("persists a valid emission point per tenant", () => {
    const onSaved = vi.fn();
    render(<DeviceSettingsDialog open onClose={vi.fn()} currentShift={null} onSaved={onSaved} />);
    const input = screen.getByLabelText(/Punto de emisión/i);
    fireEvent.change(input, { target: { value: "p002" } });
    fireEvent.click(screen.getByRole("button", { name: /Guardar/i }));
    expect(getEmissionPoint("tenant_test")).toBe("P002");
    expect(onSaved).toHaveBeenCalledWith("P002");
  });

  it("blocks changes when a shift is open", () => {
    setEmissionPoint("tenant_test", "M001");
    const onSaved = vi.fn();
    render(
      <DeviceSettingsDialog
        open
        onClose={vi.fn()}
        currentShift={{ id: "s1", status: "OPEN", opening_cash: 0 } as any}
        onSaved={onSaved}
      />,
    );
    expect(screen.getByRole("button", { name: /Guardar/i })).toBeDisabled();
    expect(screen.getByText(/Cierra el turno antes de cambiar el punto de emisión/i)).toBeInTheDocument();
    expect(onSaved).not.toHaveBeenCalled();
  });

  it("rejects invalid format", () => {
    const onSaved = vi.fn();
    render(<DeviceSettingsDialog open onClose={vi.fn()} currentShift={null} onSaved={onSaved} />);
    fireEvent.change(screen.getByLabelText(/Punto de emisión/i), { target: { value: "M-1" } });
    fireEvent.click(screen.getByRole("button", { name: /Guardar/i }));
    expect(screen.getByRole("alert")).toHaveTextContent(/4 caracteres alfanuméricos/i);
    expect(onSaved).not.toHaveBeenCalled();
  });
});
