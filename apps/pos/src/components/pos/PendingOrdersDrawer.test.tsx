import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ComponentProps } from "react";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { fetchOrderDetail, type Order, type OrderItem } from "../../lib/api";
import PendingOrdersDrawer from "./PendingOrdersDrawer";

vi.mock("../../lib/api", () => ({
  fetchOrderDetail: vi.fn(),
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
