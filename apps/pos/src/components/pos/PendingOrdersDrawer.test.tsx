import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ComponentProps } from "react";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import {
  fetchOrderDetail,
  submitOrderCheckout,
  type Order,
  type OrderItem,
} from "../../lib/api";
import CheckoutDialog from "./CheckoutDialog";
import PendingOrdersDrawer from "./PendingOrdersDrawer";

vi.mock("../../lib/api", () => ({
  EMISSION_POINT: "M001",
  WAREHOUSE_ID: "WH-MAIN",
  getCurrentEmissionPoint: () => "M001",
  resolveTenantId: () => "tenant_demo",
  fetchOrderDetail: vi.fn(),
  fetchCustomers: vi.fn(),
  submitCheckout: vi.fn(),
  submitOrderCheckout: vi.fn(),
  newOrderIdempotencyKey: () => "idem-test",
}));

const orders: Order[] = [
  {
    id: "ord-wa-1",
    display_id: "#ORD-108",
    customer_name: "María López",
    total_amount: 452000,
    order_type: "ECOMMERCE",
    source_channel: "WHATSAPP",
    payment_status: "UNPAID",
    status: "PENDING",
    business_id: "b1",
  },
  {
    id: "ord-ig-2",
    display_id: "#ORD-109",
    customer_name: "Carlos Ruiz",
    total_amount: 250000,
    order_type: "TAKEAWAY",
    source_channel: "INSTAGRAM",
    payment_status: "UNPAID",
    status: "CONFIRMED",
    business_id: "b1",
  },
  {
    id: "ord-cancelled",
    display_id: "#ORD-110",
    customer_name: "Anulada",
    total_amount: 100000,
    source_channel: "WHATSAPP",
    payment_status: "UNPAID",
    status: "CANCELLED",
  },
];

const orderItems: OrderItem[] = [
  {
    sku: "SKU-1",
    name: "Camiseta",
    quantity: 10000,
    unit_price: 300000,
    line_total: 300000,
  },
  {
    sku: "SKU-2",
    name: "Servicio de impresión",
    quantity: 10000,
    unit_price: 152000,
    line_total: 152000,
  },
];

function renderDrawer(overrides: Partial<ComponentProps<typeof PendingOrdersDrawer>> = {}) {
  return render(
    <PendingOrdersDrawer
      open
      orders={orders}
      loading={false}
      error=""
      search=""
      onSearch={vi.fn()}
      onRetry={vi.fn()}
      onClose={vi.fn()}
      onCharge={vi.fn()}
      {...overrides}
    />,
  );
}

describe("PendingOrdersDrawer (SPEC-WRTL2)", () => {
  beforeEach(() => {
    vi.mocked(fetchOrderDetail).mockReset();
    vi.mocked(fetchOrderDetail).mockResolvedValue({
      order: orders[0],
      items: orderItems,
    });
    vi.mocked(submitOrderCheckout).mockReset();
    vi.mocked(submitOrderCheckout).mockResolvedValue({
      order_id: "ord-wa-1",
      display_id: "#ORD-108",
      status: "COMPLETED",
      payment_status: "PAID",
      total_amount: "45.2000",
      total_paid: "45.2000",
      change_amount: "0.0000",
      tip_amount: "0.0000",
      retail_order_id: "retail-1",
      folio_number: 108,
      fiscal_document: {
        id: "doc-1",
        document_type: "01",
        generation_code: "GEN-108",
        control_number: "DTE-01-M001-000000000000108",
        mh_status: "PENDING",
      },
    });
  });

  afterEach(() => cleanup());

  it("lists pending Tienda orders with channel badges and customer", () => {
    renderDrawer();

    expect(screen.getByText("#ORD-108")).toBeInTheDocument();
    expect(screen.getByText("María López")).toBeInTheDocument();
    expect(screen.getByText("WhatsApp")).toBeInTheDocument();
    expect(screen.getByText("#ORD-109")).toBeInTheDocument();
    expect(screen.getByText("Instagram")).toBeInTheDocument();
  });

  it("hides cancelled orders", () => {
    renderDrawer();

    expect(screen.queryByText("#ORD-110")).toBeNull();
    expect(screen.queryByText("Anulada")).toBeNull();
  });

  it("filters pending orders by the active business", () => {
    const otherBusinessOrder = {
      ...orders[0],
      id: "ord-other",
      display_id: "#ORD-200",
      customer_name: "Pedido Tortillería",
      business_id: "b2",
    };
    renderDrawer({
      orders: [...orders, otherBusinessOrder],
      businessId: "b1",
    });

    expect(screen.getByText("#ORD-108")).toBeTruthy();
    expect(screen.queryByText("#ORD-200")).toBeNull();
    expect(screen.queryByText("Pedido Tortillería")).toBeNull();
  });

  it("charges an order through POST /v1/orders/{id}/checkout flow", async () => {
    const onCharge = vi.fn();
    renderDrawer({ onCharge });

    fireEvent.click(screen.getAllByRole("button", { name: "Cobrar Orden" })[0]);

    await waitFor(() => expect(fetchOrderDetail).toHaveBeenCalledWith("ord-wa-1"));
    expect(onCharge).toHaveBeenCalledWith(orders[0], orderItems);
  });

  it("shows the order items when expanded", async () => {
    renderDrawer();

    fireEvent.click(screen.getAllByRole("button", { name: "Ver ítems" })[0]);

    expect(await screen.findByText(/Camiseta/)).toBeInTheDocument();
    expect(screen.getByText(/Servicio de impresión/)).toBeInTheDocument();
  });

  it("surfaces detail errors without charging", async () => {
    vi.mocked(fetchOrderDetail).mockRejectedValue(new Error("orden no disponible"));
    const onCharge = vi.fn();
    renderDrawer({ onCharge });

    fireEvent.click(screen.getAllByRole("button", { name: "Cobrar Orden" })[0]);

    expect(await screen.findByRole("alert")).toHaveTextContent("orden no disponible");
    expect(onCharge).not.toHaveBeenCalled();
  });
});

describe("CheckoutDialog — order checkout (SPEC-WRTL2)", () => {
  const order: Order = {
    ...orders[0],
    customer_id: "42",
    customer_tax_id: "0614-121024-101-9",
  };

  afterEach(() => cleanup());

  it("liquidates the selected order via POST /v1/orders/{id}/checkout", async () => {
    const onCompleted = vi.fn();
    render(
      <CheckoutDialog
        open
        items={[]}
        total={0}
        activeOrder={order}
        orderItems={orderItems}
        onClose={vi.fn()}
        onCompleted={onCompleted}
      />,
    );

    expect(screen.getByText(/#ORD-108/)).toBeInTheDocument();
    expect(screen.getAllByText("María López").length).toBeGreaterThan(0);
    expect(screen.getAllByText(/45\.20/).length).toBeGreaterThan(0);

    fireEvent.click(screen.getByRole("button", { name: /Cobrar/ }));

    await waitFor(() => expect(submitOrderCheckout).toHaveBeenCalledTimes(1));
    const [orderId, payload, idempotencyKey] = vi.mocked(submitOrderCheckout).mock.calls[0];
    expect(orderId).toBe("ord-wa-1");
    expect(idempotencyKey).toBe("idem-test");
    expect(payload).toMatchObject({
      document_type: "01",
      payments: [{ payment_method: "CASH", amount: 45.2 }],
    });
    expect(payload.customer).toMatchObject({
      customer_id: "42",
      tax_id: "0614-121024-101-9",
    });

    expect(await screen.findByText("Orden liquidada")).toBeInTheDocument();
    expect(screen.getByText(/Folio: #108/)).toBeInTheDocument();
    expect(screen.getAllByText(/GEN-108/).length).toBeGreaterThan(0);
    expect(onCompleted).toHaveBeenCalledTimes(1);
  });

  it("sends the CCF document type when 03 is selected", async () => {
    const onCompleted = vi.fn();
    render(
      <CheckoutDialog
        open
        items={[]}
        total={0}
        activeOrder={order}
        orderItems={orderItems}
        onClose={vi.fn()}
        onCompleted={onCompleted}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: /03 · CCF/ }));
    fireEvent.click(screen.getByRole("button", { name: /Cobrar/ }));

    await waitFor(() => expect(submitOrderCheckout).toHaveBeenCalledTimes(1));
    const [, payload] = vi.mocked(submitOrderCheckout).mock.calls[0];
    expect(payload.document_type).toBe("03");
  });
});
