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
  WAREHOUSE_ID,
  getCurrentEmissionPoint,
  isApiNetworkError,
  newOrderIdempotencyKey,
  resolveTenantId,
  submitCheckout,
  submitOrderCheckout,
  type CheckoutRequest,
  type Customer,
  type Order,
  type OrderCheckoutRequest,
  type OrderItem,
} from "../../lib/api";
import { enqueueOfflineSale } from "../../lib/offlineStore";
import {
  cartLineTotal,
} from "../../store/cart.store";
import {
  formatScaledMoney,
  fromScaled,
  parseMoneyInput,
} from "../../lib/quantity";
import type { CartItem } from "../../store/cart.store";
import { useAuthStore } from "../../store/auth";
import CustomerSelector from "./CustomerSelector";
import ThermalReceiptPrint, { type ThermalPaperWidth } from "./ThermalReceiptPrint";

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
  receiptItems: { description: string; quantity: number; unitPrice: number; lineTotal: number }[];
  documentType: DocumentType;
  customerName?: string;
  customerTaxId?: string;
  paymentLabel: string;
  issuedAt: string;
  contingency?: boolean;
  idempotencyKey?: string;
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

function toScaledNumber(value: string | number): number {
  const n = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(n)) return 0;
  // Order checkout totals are decimal strings (e.g. "45.2000") in API.
  return Math.round(n * 10000);
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
  const [receiptWidth, setReceiptWidth] = useState<ThermalPaperWidth>("80mm");
  const operatorName = useAuthStore((s) => s.operatorName);
  const emissionPoint = getCurrentEmissionPoint();

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
    const idempotencyKey = newOrderIdempotencyKey();
    const paymentLabel = PAYMENT_METHODS.find((m) => m.code === paymentMethod)?.label ?? paymentMethod;
    const tenantId = resolveTenantId();

    try {
      if (orderMode && activeOrder?.id) {
        const payload: OrderCheckoutRequest = {
          document_type: documentType,
          emission_point: emissionPoint,
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

        const receiptItems = orderItems.map((it) => ({
          description: it.name ?? it.sku ?? "Ítem",
          quantity: it.quantity ?? 0,
          unitPrice: it.unit_price ?? 0,
          lineTotal: it.line_total ?? Math.round(((it.quantity ?? 0) * (it.unit_price ?? 0)) / 10000),
        }));

        try {
          const response = await submitOrderCheckout(activeOrder.id, payload, idempotencyKey);
          setSuccess({
            orderId: response.order_id ?? activeOrder.id,
            displayId: response.display_id ?? activeOrder.display_id,
            folio: response.folio_number,
            generationCode: response.fiscal_document?.generation_code,
            mhStatus: response.fiscal_document?.mh_status,
            totalPaid: response.total_paid ? toScaledNumber(response.total_paid) : activeTotal,
            changeDue: response.change_amount ? toScaledNumber(response.change_amount) : changeOnSuccess,
            receiptItems,
            documentType,
            customerName: customer?.legal_name,
            customerTaxId: customer?.tax_id,
            paymentLabel,
            issuedAt: new Date().toISOString(),
          });
          onCompleted();
          return;
        } catch (err) {
          if (!isApiNetworkError(err)) throw err;
          enqueueOfflineSale(tenantId, {
            idempotencyKey,
            tenantId,
            kind: "ORDER_CHECKOUT",
            orderId: activeOrder.id,
            payload,
            total: activeTotal,
            customerName: customer?.legal_name ?? activeOrder.customer_name,
            customerTaxId: customer?.tax_id,
            documentType,
            paymentLabel,
            receiptItems,
            createdAt: new Date().toISOString(),
            status: "PENDING",
          });
          setSuccess({
            orderId: activeOrder.id,
            displayId: activeOrder.display_id,
            totalPaid: isCash && tenderedScaled !== null ? tenderedScaled : activeTotal,
            changeDue: changeOnSuccess,
            receiptItems,
            documentType,
            customerName: customer?.legal_name ?? activeOrder.customer_name,
            customerTaxId: customer?.tax_id,
            paymentLabel,
            issuedAt: new Date().toISOString(),
            contingency: true,
            idempotencyKey,
          });
          onCompleted();
          return;
        }
      }

      const body: CheckoutRequest = {
        warehouse_id: WAREHOUSE_ID,
        emission_point: emissionPoint,
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

      const receiptItems = items.map((item) => ({
        description: item.name,
        quantity: item.quantity,
        unitPrice: item.unitPrice,
        lineTotal: cartLineTotal(item),
      }));

      try {
        const response = await submitCheckout(body, idempotencyKey);
        const raw = response as Record<string, unknown>;
        setSuccess({
          orderId: response.order_id,
          folio: response.folio_number,
          controlNumber: response.control_number,
          generationCode: typeof raw.generation_code === "string" ? raw.generation_code : undefined,
          mhStatus: typeof raw.mh_status === "string" ? raw.mh_status : undefined,
          totalPaid: response.total_paid ?? total,
          changeDue: changeOnSuccess,
          receiptItems,
          documentType,
          customerName: customer?.legal_name,
          customerTaxId: customer?.tax_id,
          paymentLabel,
          issuedAt: new Date().toISOString(),
        });
        onCompleted();
      } catch (err) {
        if (!isApiNetworkError(err)) throw err;
        enqueueOfflineSale(tenantId, {
          idempotencyKey,
          tenantId,
          kind: "POS_CHECKOUT",
          payload: body,
          total,
          customerName: customer?.legal_name,
          customerTaxId: customer?.tax_id,
          documentType,
          paymentLabel,
          receiptItems,
          createdAt: new Date().toISOString(),
          status: "PENDING",
        });
        setSuccess({
          totalPaid: isCash && tenderedScaled !== null ? tenderedScaled : total,
          changeDue: changeOnSuccess,
          receiptItems,
          documentType,
          customerName: customer?.legal_name,
          customerTaxId: customer?.tax_id,
          paymentLabel,
          issuedAt: new Date().toISOString(),
          contingency: true,
          idempotencyKey,
        });
        onCompleted();
      }
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
          <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto p-4">
            <div className="flex items-center gap-3 rounded-lg border border-emerald-500/30 bg-emerald-500/10 p-3 text-emerald-700 dark:text-emerald-400">
              <CheckCircle2 className="h-5 w-5 shrink-0" aria-hidden="true" />
              <div className="flex flex-col gap-0.5">
                <p className="text-sm font-bold">
                  {success.contingency
                    ? "Venta en contingencia"
                    : orderMode
                      ? "Orden liquidada"
                      : "Venta procesada"}
                </p>
                <p className="text-xs">
                  {success.contingency
                    ? "PENDIENTE DE SINCRONIZACIÓN · se enviará al recuperar conexión"
                    : `Total cobrado: ${formatScaledMoney(success.totalPaid)}${success.changeDue > 0 ? ` · Cambio: ${formatScaledMoney(success.changeDue)}` : ""}`}
                </p>
                {success.contingency && (
                  <p className="text-xs">Total: {formatScaledMoney(success.totalPaid)}{success.changeDue > 0 ? ` · Cambio: ${formatScaledMoney(success.changeDue)}` : ""}</p>
                )}
                {success.idempotencyKey && <p className="text-[11px] font-mono break-all">Idempotency: {success.idempotencyKey}</p>}
                {typeof success.folio === "number" && <p className="text-xs">Folio: #{success.folio}</p>}
                {success.generationCode && <p className="text-xs break-all">Generación: {success.generationCode}</p>}
                {success.controlNumber && <p className="text-xs break-all">Control: {success.controlNumber}</p>}
              </div>
            </div>

            <ThermalReceiptPrint
              width={receiptWidth}
              onWidthChange={setReceiptWidth}
              data={{
                businessName: "MobiWare Retail",
                tenantId: resolveTenantId(),
                emissionPoint,
                operatorName: operatorName || undefined,
                documentType: success.documentType,
                controlNumber: success.controlNumber,
                generationCode: success.generationCode,
                mhStatus: success.mhStatus,
                customerName: success.customerName,
                customerTaxId: success.customerTaxId,
                paymentMethod: success.paymentLabel,
                items: success.receiptItems,
                subtotal: success.receiptItems.reduce((a, i) => a + i.lineTotal, 0),
                total: success.receiptItems.reduce((a, i) => a + i.lineTotal, 0),
                totalPaid: success.totalPaid,
                changeDue: success.changeDue,
                issuedAt: success.issuedAt,
              }}
            />

            <Button variant="accent" className="w-full" onClick={onClose}>
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
