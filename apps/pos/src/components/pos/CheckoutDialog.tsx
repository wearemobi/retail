import { useEffect, useState } from "react";
import {
  AlertCircle,
  CheckCircle2,
  FileText,
  Loader2,
  Receipt,
  X,
} from "lucide-react";
import { Button, Input } from "@retail/common";
import {
  EMISSION_POINT,
  WAREHOUSE_ID,
  newOrderIdempotencyKey,
  submitCheckout,
  submitOrderCheckout,
  type CheckoutRequest,
  type Customer,
  type Order,
  type OrderCheckoutRequest,
  type OrderItem,
} from "../../lib/api";
import {
  formatScaledMoney,
  fromScaled,
  parseMoneyInput,
} from "../../lib/quantity";
import type { CartItem } from "../../store/cart.store";
import CustomerSelector from "./CustomerSelector";

type DocumentType = "01" | "03";
type PaymentMethod = "01" | "02" | "03" | "04" | "05";

const PAYMENT_METHODS: { code: PaymentMethod; label: string }[] = [
  { code: "01", label: "Efectivo" },
  { code: "02", label: "Tarjeta" },
  { code: "03", label: "Transferencia" },
  { code: "04", label: "Cheque" },
  { code: "05", label: "Crédito" },
];

interface CheckoutSuccess {
  orderId?: string;
  displayId?: string;
  folio?: number;
  controlNumber?: string;
  generationCode?: string;
  mhStatus?: string;
  totalPaid: number;
  changeDue: number;
}

interface CheckoutDialogProps {
  open: boolean;
  items: CartItem[];
  total: number;
  activeOrder?: Order | null;
  orderItems?: OrderItem[];
  onClose: () => void;
  onCompleted: () => void;
}

function customerFromOrder(order: Order | null | undefined): Customer | null {
  if (!order?.customer_id) return null;
  const id = Number(order.customer_id);
  if (!Number.isFinite(id)) return null;
  return {
    id,
    legal_name: order.customer_name ?? "",
    tax_id: order.customer_tax_id ?? "",
  };
}

function orderPaymentMethod(
  method: PaymentMethod,
): "CASH" | "CREDIT_CARD" | "TRANSFER" {
  if (method === "02") return "CREDIT_CARD";
  if (method === "03") return "TRANSFER";
  return "CASH";
}

export default function CheckoutDialog({
  open,
  items,
  total,
  activeOrder = null,
  orderItems = [],
  onClose,
  onCompleted,
}: CheckoutDialogProps) {
  const orderMode = activeOrder !== null;
  const activeTotal = orderMode ? activeOrder.total_amount ?? 0 : total;
  const displayItemCount = orderMode ? orderItems.length : items.length;
  const [documentType, setDocumentType] = useState<DocumentType>("01");
  const [customer, setCustomer] = useState<Customer | null>(null);
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>("01");
  const [amountTendered, setAmountTendered] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState<CheckoutSuccess | null>(null);

  const openOrderId = activeOrder?.id;

  useEffect(() => {
    if (!open) return;
    setDocumentType("01");
    setCustomer(customerFromOrder(activeOrder));
    setPaymentMethod("01");
    setAmountTendered(fromScaled(activeTotal).toFixed(2));
    setSubmitting(false);
    setError("");
    setSuccess(null);
    // `total`/`activeTotal` are intentionally read only when the dialog opens;
    // clearing the cart after a successful sale must not reset the receipt.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, openOrderId]);

  if (!open) return null;

  const tenderedScaled = parseMoneyInput(amountTendered);
  const isCash = paymentMethod === "01";
  const cashValid = !isCash || (tenderedScaled !== null && tenderedScaled >= activeTotal);
  const customerValid =
    documentType === "01" ||
    (customer !== null &&
      typeof customer.id === "number" &&
      (customer.tax_id ?? "").trim() !== "");
  const canSubmit =
    displayItemCount > 0 && !submitting && cashValid && customerValid;
  const changeDue =
    isCash && tenderedScaled !== null && tenderedScaled > activeTotal
      ? tenderedScaled - activeTotal
      : 0;

  async function handleSubmit() {
    if (!canSubmit) return;
    setSubmitting(true);
    setError("");

    const changeOnSuccess = changeDue;

    try {
      if (orderMode && activeOrder?.id) {
        const payload: OrderCheckoutRequest = {
          document_type: documentType,
          payments: [
            {
              payment_method: orderPaymentMethod(paymentMethod),
              amount: isCash && tenderedScaled !== null
                ? fromScaled(tenderedScaled)
                : fromScaled(activeTotal),
            },
          ],
        };
        if (customer && typeof customer.id === "number" && (customer.tax_id ?? "").trim()) {
          payload.customer = {
            customer_id: String(customer.id),
            name: customer.legal_name ?? "",
            tax_id: customer.tax_id ?? "",
            document_type: "36",
          };
        }

        const response = await submitOrderCheckout(
          activeOrder.id,
          payload,
          newOrderIdempotencyKey(),
        );
        setSuccess({
          orderId: response.order_id ?? activeOrder.id,
          displayId: response.display_id ?? activeOrder.display_id,
          folio: response.folio_number,
          generationCode: response.fiscal_document?.generation_code,
          mhStatus: response.fiscal_document?.mh_status,
          totalPaid: response.total_paid
            ? fromScaled(Number(response.total_paid))
            : activeTotal,
          changeDue: response.change_amount
            ? fromScaled(Number(response.change_amount))
            : changeOnSuccess,
        });
        onCompleted();
        return;
      }

      const body: CheckoutRequest = {
        warehouse_id: WAREHOUSE_ID,
        emission_point: EMISSION_POINT,
        payment_method: paymentMethod,
        document_type: documentType,
        currency: "USD",
        items: items.map((item) => ({
          sku: item.sku,
          description: item.name,
          quantity: item.quantity,
          unit_price: item.unitPrice,
          discount_amount: 0,
        })),
      };

      if (customer && typeof customer.id === "number") {
        body.customer_id = String(customer.id);
      }

      const response = await submitCheckout(body);
      setSuccess({
        orderId: response.order_id,
        folio: response.folio_number,
        controlNumber: response.control_number,
        totalPaid: response.total_paid ?? total,
        changeDue: changeOnSuccess,
      });
      onCompleted();
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : orderMode
            ? "No fue posible liquidar la orden."
            : "No fue posible procesar la venta.",
      );
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={orderMode ? "Cobrar orden" : "Cobrar venta"}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4"
      onClick={(event) => {
        if (event.target === event.currentTarget && !submitting) onClose();
      }}
    >
      <div className="flex max-h-[92vh] w-full max-w-2xl flex-col overflow-hidden rounded-2xl border border-border bg-card shadow-xl">
        <div className="flex items-center justify-between border-b border-border px-4 py-3">
          <div>
            <h2 className="text-base font-bold">
              {orderMode ? "Cobrar orden" : "Cobrar venta"}
            </h2>
            <p className="text-xs text-muted-foreground">
              {displayItemCount} ítem{displayItemCount === 1 ? "" : "s"} · Total{" "}
              <span className="font-semibold text-foreground">
                {formatScaledMoney(activeTotal)}
              </span>
              {orderMode && activeOrder?.display_id
                ? ` · ${activeOrder.display_id}`
                : ""}
            </p>
            {orderMode && activeOrder?.customer_name && (
              <p className="text-[11px] text-muted-foreground">
                {activeOrder.customer_name}
              </p>
            )}
          </div>
          <Button
            variant="ghost"
            size="xs"
            onClick={onClose}
            disabled={submitting}
            aria-label="Cerrar"
            className="h-8 w-8 px-0"
          >
            <X className="h-4 w-4" aria-hidden="true" />
          </Button>
        </div>

        {success ? (
          <div className="flex flex-col items-center justify-center gap-3 p-8 text-center">
            <div className="flex h-12 w-12 items-center justify-center rounded-full border border-emerald-500/30 bg-emerald-500/10 text-emerald-500">
              <CheckCircle2 className="h-6 w-6" aria-hidden="true" />
            </div>
            <div className="flex flex-col gap-1">
              <h3 className="text-base font-bold">
                {orderMode ? "Orden liquidada" : "Venta procesada"}
              </h3>
              <p className="text-xs text-muted-foreground">
                {success.controlNumber
                  ? `Comprobante: ${success.controlNumber}`
                  : success.generationCode
                    ? `Código de generación: ${success.generationCode}`
                    : `Orden: ${success.displayId ?? success.orderId ?? "—"}`}
              </p>
              {success.mhStatus && (
                <p className="text-[11px] text-muted-foreground">
                  Estado MH: {success.mhStatus}
                </p>
              )}
              {typeof success.folio === "number" && (
                <p className="font-mono text-xs text-muted-foreground">Folio: #{success.folio}</p>
              )}
              <p className="text-sm font-semibold">
                Total cobrado: {formatScaledMoney(success.totalPaid)}
              </p>
              {success.changeDue > 0 && (
                <p className="text-sm font-medium text-emerald-600 dark:text-emerald-400">
                  Cambio: {formatScaledMoney(success.changeDue)}
                </p>
              )}
            </div>
            <Button variant="accent" className="mt-2 w-full max-w-xs" onClick={onClose}>
              Nueva venta
            </Button>
          </div>
        ) : (
          <>
            <div className="min-h-0 flex-1 space-y-4 overflow-y-auto p-4">
              {error && (
                <div
                  role="alert"
                  className="flex items-start gap-2 rounded-lg border border-destructive/30 bg-destructive/15 px-3 py-2 text-xs text-destructive"
                >
                  <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
                  <span>{error}</span>
                </div>
              )}

              <div className="flex flex-col gap-2">
                <span className="text-xs font-medium text-muted-foreground">
                  Tipo de documento
                </span>
                <div className="grid grid-cols-2 gap-2">
                  <Button
                    type="button"
                    variant={documentType === "01" ? "default" : "outline"}
                    onClick={() => setDocumentType("01")}
                    className="h-auto flex-col gap-0.5 py-2.5"
                  >
                    <FileText className="h-4 w-4" aria-hidden="true" />
                    <span className="text-xs font-semibold">01 · Consumidor Final</span>
                  </Button>
                  <Button
                    type="button"
                    variant={documentType === "03" ? "default" : "outline"}
                    onClick={() => setDocumentType("03")}
                    className="h-auto flex-col gap-0.5 py-2.5"
                  >
                    <Receipt className="h-4 w-4" aria-hidden="true" />
                    <span className="text-xs font-semibold">03 · CCF</span>
                  </Button>
                </div>
              </div>

              <div className="space-y-2 rounded-lg border border-border bg-muted/30 p-3">
                <span className="text-xs font-semibold">
                  {documentType === "03" ? "Datos del receptor" : "Cliente (opcional)"}
                </span>
                <CustomerSelector
                  selected={customer}
                  onSelect={setCustomer}
                  onClear={() => setCustomer(null)}
                />
                {documentType === "03" && !customerValid && (
                  <p className="text-[11px] text-amber-600 dark:text-amber-400">
                    Selecciona un cliente con NIT registrado para emitir el CCF.
                  </p>
                )}
              </div>

              <div className="flex flex-col gap-2">
                <span className="text-xs font-medium text-muted-foreground">
                  Condición de pago
                </span>
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                  {PAYMENT_METHODS.filter(
                    (method) => !orderMode || ["01", "02", "03"].includes(method.code),
                  ).map((method) => (
                    <Button
                      key={method.code}
                      type="button"
                      variant={paymentMethod === method.code ? "default" : "outline"}
                      className="h-9 text-xs"
                      onClick={() => {
                        setPaymentMethod(method.code);
                        if (method.code !== "01") setAmountTendered("");
                      }}
                    >
                      {method.code} · {method.label}
                    </Button>
                  ))}
                </div>
              </div>

              {isCash && (
                <div className="flex flex-col gap-2">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-medium text-muted-foreground">
                      Efectivo recibido
                    </span>
                    <Button
                      type="button"
                      variant="ghost"
                      size="xs"
                      className="h-6"
                      onClick={() => setAmountTendered(fromScaled(activeTotal).toFixed(2))}
                    >
                      Exacto
                    </Button>
                  </div>
                  <Input
                    id="pos-cash-tendered"
                    inputMode="decimal"
                    value={amountTendered}
                    onChange={(event) => setAmountTendered(event.target.value)}
                    placeholder="0.00"
                  />
                  {tenderedScaled !== null && tenderedScaled >= activeTotal ? (
                    <div className="flex items-center justify-between text-sm">
                      <span className="font-medium text-muted-foreground">Cambio</span>
                      <span className="font-bold text-emerald-600 dark:text-emerald-400">
                        {formatScaledMoney(changeDue)}
                      </span>
                    </div>
                  ) : (
                    <p className="text-[11px] text-amber-600 dark:text-amber-400">
                      El efectivo recibido debe cubrir el total.
                    </p>
                  )}
                </div>
              )}
            </div>

            <div className="flex items-center justify-end gap-2 border-t border-border px-4 py-3">
              <Button variant="ghost" onClick={onClose} disabled={submitting}>
                Cancelar
              </Button>
              <Button variant="accent" onClick={() => void handleSubmit()} disabled={!canSubmit}>
                {submitting ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                    Procesando…
                  </>
                ) : (
                  `Cobrar ${formatScaledMoney(activeTotal)}`
                )}
              </Button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
