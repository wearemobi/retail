import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import ShiftDrawerDialog from "./ShiftDrawerDialog";
import ThermalReceiptPrint from "./ThermalReceiptPrint";

const shiftApi = vi.hoisted(() => ({
  fetchCurrentShift: vi.fn(),
  fetchShiftReport: vi.fn(),
  openShift: vi.fn(),
  recordShiftMovement: vi.fn(),
  closeShift: vi.fn(),
}));

vi.mock("../../lib/api", () => ({
  EMISSION_POINT: "POS-01",
  resolveTenantId: () => "t1",
  fetchCurrentShift: shiftApi.fetchCurrentShift,
  fetchShiftReport: shiftApi.fetchShiftReport,
  openShift: shiftApi.openShift,
  recordShiftMovement: shiftApi.recordShiftMovement,
  closeShift: shiftApi.closeShift,
}));

vi.mock("../../store/auth", () => ({
  useAuthStore: (sel: (s: any) => unknown) =>
    sel({ operatorId: "op1", operatorName: "Alice", businessId: "b1" }),
}));

const openShift = {
  id: "shift-1",
  status: "OPEN" as const,
  opening_cash: 100000,
  cash_sales: 50000,
  cash_in: 20000,
  cash_out: 10000,
  expected_cash: 160000,
};

describe("ShiftDrawerDialog (SPEC-WRTL4)", () => {
  beforeEach(() => {
    shiftApi.fetchCurrentShift.mockReset();
    shiftApi.fetchShiftReport.mockReset();
    shiftApi.openShift.mockReset();
    shiftApi.recordShiftMovement.mockReset();
    shiftApi.closeShift.mockReset();
    shiftApi.fetchCurrentShift.mockResolvedValue(null);
    shiftApi.fetchShiftReport.mockResolvedValue({ shift: openShift, movements: [], movement_count: 0 });
  });
  afterEach(() => cleanup());

  it("opens a shift with 10^-4 scaled opening cash", async () => {
    shiftApi.openShift.mockResolvedValue({ ...openShift, opening_cash: 150000 });
    shiftApi.fetchCurrentShift.mockResolvedValueOnce(null).mockResolvedValueOnce({ ...openShift, opening_cash: 150000 });

    render(<ShiftDrawerDialog open onClose={vi.fn()} />);

    const input = await screen.findByLabelText(/Fondo inicial/i);
    fireEvent.change(input, { target: { value: "15.00" } });
    fireEvent.click(screen.getByRole("button", { name: /Abrir caja/i }));

    await waitFor(() => expect(shiftApi.openShift).toHaveBeenCalled());
    expect(shiftApi.openShift.mock.calls[0][0]).toMatchObject({
      operator_id: "op1",
      opening_cash: 150000,
      emission_point: "POS-01",
    });
  });

  it("registers CASH_IN movement in 10^-4 scale", async () => {
    shiftApi.fetchCurrentShift.mockResolvedValue(openShift);
    shiftApi.recordShiftMovement.mockResolvedValue({ shift: openShift, movement: { id: "m1" } });

    render(<ShiftDrawerDialog open onClose={vi.fn()} />);
    await screen.findByText(/Cierre Definitivo Z/i);

    fireEvent.change(screen.getByLabelText(/Monto \(USD\)/i), { target: { value: "2.50" } });
    fireEvent.change(screen.getByLabelText(/Razón/i), { target: { value: "Cambio" } });
    fireEvent.click(screen.getByRole("button", { name: /Registrar movimiento/i }));

    await waitFor(() => expect(shiftApi.recordShiftMovement).toHaveBeenCalled());
    expect(shiftApi.recordShiftMovement).toHaveBeenCalledWith(
      "shift-1",
      expect.objectContaining({ movement_type: "CASH_IN", amount: 25000, reason: "Cambio" }),
    );
  });

  it("closes shift Z and shows difference", async () => {
    shiftApi.fetchCurrentShift.mockResolvedValue(openShift);
    shiftApi.closeShift.mockResolvedValue({
      shift: { ...openShift, status: "CLOSED", counted_cash: 155000, difference_cash: -5000, expected_cash: 160000 },
      report: { shift: { ...openShift, status: "CLOSED", counted_cash: 155000, difference_cash: -5000, expected_cash: 160000 }, movements: [] },
    });

    render(<ShiftDrawerDialog open onClose={vi.fn()} />);
    await screen.findByText(/Cierre Definitivo Z/i);

    fireEvent.change(screen.getByLabelText(/Efectivo contado/i), { target: { value: "15.50" } });
    fireEvent.click(screen.getByRole("button", { name: /Cerrar turno \(Z\)/i }));

    await waitFor(() => expect(shiftApi.closeShift).toHaveBeenCalled());
    expect(shiftApi.closeShift).toHaveBeenCalledWith("shift-1", { counted_cash: 155000 });
    expect(await screen.findByText(/Faltante/i)).toBeInTheDocument();
  });
});

describe("ThermalReceiptPrint (SPEC-WRTL4)", () => {
  afterEach(() => cleanup());

  it("renders 80mm/58mm selector and MH metadata", () => {
    const onWidthChange = vi.fn();
    render(
      <ThermalReceiptPrint
        width="80mm"
        onWidthChange={onWidthChange}
        data={{
          businessName: "Demo",
          documentType: "01",
          controlNumber: "DTE-01-M001-000000000000001",
          generationCode: "ABC-123",
          items: [{ description: "Cafe", quantity: 10000, unitPrice: 25000, lineTotal: 25000 }],
          subtotal: 25000,
          total: 25000,
          totalPaid: 30000,
          changeDue: 5000,
          issuedAt: "2026-11-22T12:00:00Z",
        }}
      />,
    );

    expect(screen.getByRole("button", { name: "80mm" })).toHaveAttribute("aria-pressed", "true");
    fireEvent.click(screen.getByRole("button", { name: "58mm" }));
    expect(onWidthChange).toHaveBeenCalledWith("58mm");
    expect(screen.getByText(/DTE-01-M001-000000000000001/)).toBeInTheDocument();
    expect(screen.getByText(/consultaPublica/)).toBeInTheDocument();
  });
});
