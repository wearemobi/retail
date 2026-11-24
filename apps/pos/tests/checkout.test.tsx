import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { submitCheckout, fetchCustomers } from "../src/lib/api";
import type { CartItem } from "../src/store/cart.store";
import CheckoutDialog from "../src/components/pos/CheckoutDialog";

vi.mock("../src/lib/api", () => ({
  WAREHOUSE_ID: "WH-MAIN",
  getCurrentEmissionPoint: () => "M001",
  resolveTenantId: () => "tenant_demo",
  newOrderIdempotencyKey: () => "idem-test",
  isApiNetworkError: () => false,
  submitCheckout: vi.fn(),
  fetchCustomers: vi.fn(),
}));
vi.mock("../src/lib/offlineStore", () => ({
  enqueueOfflineSale: vi.fn(),
}));

const items: CartItem[] = [
  {
    sku: "SKU-KG",
    name: "Queso fresco",
    unitPrice: 15000,
    quantity: 20000,
    unitOfMeasure: "36",
    isWeighted: true,
  },
];

const total = 30000;

beforeEach(() => {
  vi.mocked(submitCheckout).mockReset();
  vi.mocked(fetchCustomers).mockReset();
});

afterEach(() => {
  cleanup();
});

describe("CheckoutDialog (SPEC-WRTL1)", () => {
  it("submits a Consumidor Final sale in 10^-4 units", async () => {
    vi.mocked(submitCheckout).mockResolvedValue({
      order_id: "ord-1",
      folio_number: 101,
      total_paid: 30000,
      control_number: "DTE-01-M001P001-000000000000101",
      status: "COMPLETED",
    } as never);

    const onCompleted = vi.fn();
    render(
      <CheckoutDialog
        open
        items={items}
        total={total}
        onClose={vi.fn()}
        onCompleted={onCompleted}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: /Cobrar/ }));

    await waitFor(() => expect(submitCheckout).toHaveBeenCalledTimes(1));
    const body = vi.mocked(submitCheckout).mock.calls[0][0];
    expect(body).toMatchObject({
      warehouse_id: "WH-MAIN",
      emission_point: "M001",
      payment_method: "01",
      document_type: "01",
      currency: "USD",
    });
    expect(body.items).toEqual([
      {
        sku: "SKU-KG",
        description: "Queso fresco",
        quantity: 20000,
        unit_price: 15000,
        discount_amount: 0,
      },
    ]);
    expect(body.customer_id).toBeUndefined();

    await screen.findByText("Venta procesada");
    expect(onCompleted).toHaveBeenCalledTimes(1);
  });

  it("requires a customer with tax id for CCF and sends customer_id", async () => {
    vi.mocked(submitCheckout).mockResolvedValue({
      order_id: "ord-2",
      folio_number: 102,
      total_paid: 30000,
      control_number: "DTE-03-M001P001-000000000000102",
      status: "COMPLETED",
    } as never);
    vi.mocked(fetchCustomers).mockResolvedValue([
      {
        id: 42,
        legal_name: "ACME S.A. de C.V.",
        commercial_name: "ACME",
        tax_id: "0614-121024-101-9",
      },
    ] as never);

    render(
      <CheckoutDialog
        open
        items={items}
        total={total}
        onClose={vi.fn()}
        onCompleted={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: /03 · CCF/ }));
    expect(screen.getByRole("button", { name: /Cobrar/ })).toBeDisabled();

    fireEvent.change(screen.getByLabelText("Buscar cliente"), {
      target: { value: "ACME" },
    });
    const result = await screen.findByText("ACME S.A. de C.V.");
    fireEvent.click(result);

    fireEvent.click(screen.getByRole("button", { name: /Cobrar/ }));

    await waitFor(() => expect(submitCheckout).toHaveBeenCalledTimes(1));
    const body = vi.mocked(submitCheckout).mock.calls[0][0];
    expect(body.document_type).toBe("03");
    expect(body.customer_id).toBe("42");
  });
});
