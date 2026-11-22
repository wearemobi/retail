import { Printer } from "lucide-react";
import { Button, cn } from "@retail/common";
import { formatScaledMoney, formatScaledQuantity } from "../../lib/quantity";

export type ThermalPaperWidth = "80mm" | "58mm";

export interface ThermalReceiptLine {
  description: string;
  quantity: number; // 10^-4 scale
  unitPrice: number; // 10^-4 scale
  lineTotal: number; // 10^-4 scale
}

export interface ThermalReceiptData {
  businessName?: string;
  tenantId?: string;
  emissionPoint?: string;
  operatorName?: string;
  documentType?: "01" | "03";
  controlNumber?: string;
  generationCode?: string;
  mhStatus?: string;
  customerName?: string;
  customerTaxId?: string;
  paymentMethod?: string;
  items: ThermalReceiptLine[];
  subtotal: number;
  taxAmount?: number;
  total: number;
  totalPaid?: number;
  changeDue?: number;
  issuedAt?: string;
}

interface ThermalReceiptPrintProps {
  data: ThermalReceiptData;
  width: ThermalPaperWidth;
  onWidthChange: (width: ThermalPaperWidth) => void;
  className?: string;
  printLabel?: string;
}

function mhVerificationUrl(generationCode?: string, issuedAt?: string): string | null {
  if (!generationCode) return null;
  const date = issuedAt ? issuedAt.slice(0, 10) : new Date().toISOString().slice(0, 10);
  const params = new URLSearchParams({
    ambiente: "01",
    codGen: generationCode,
    fechaEmi: date,
  });
  return `https://admin.factura.gob.sv/consultaPublica?${params.toString()}`;
}

function qrImageUrl(url: string): string {
  return `https://api.qrserver.com/v1/create-qr-code/?size=140x140&data=${encodeURIComponent(url)}`;
}

function docLabel(type?: string): string {
  if (type === "03") return "CCF 03";
  if (type === "01") return "Consumidor Final 01";
  return "Comprobante";
}

export default function ThermalReceiptPrint({
  data,
  width,
  onWidthChange,
  className,
  printLabel = "Imprimir Ticket",
}: ThermalReceiptPrintProps) {
  const verifyUrl = mhVerificationUrl(data.generationCode, data.issuedAt);
  const paperClass = width === "58mm" ? "w-[210px]" : "w-[300px]";

  return (
    <div className={cn("flex flex-col gap-3", className)}>
      <div className="thermal-print-controls flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <span className="text-xs font-medium text-muted-foreground">Ancho</span>
          <div className="flex gap-1">
            {(["80mm", "58mm"] as const).map((option) => (
              <Button
                key={option}
                type="button"
                size="xs"
                variant={width === option ? "default" : "outline"}
                onClick={() => onWidthChange(option)}
                aria-pressed={width === option}
              >
                {option}
              </Button>
            ))}
          </div>
        </div>
        <Button type="button" variant="accent" size="sm" onClick={() => window.print()}>
          <Printer className="h-4 w-4" aria-hidden="true" />
          {printLabel}
        </Button>
      </div>

      <div className="thermal-print-area overflow-auto rounded-lg border border-border bg-white p-3 text-black">
        <article
          className={cn(
            "thermal-receipt mx-auto bg-white text-black font-mono text-[11px] leading-snug",
            paperClass,
          )}
        >
          <header className="flex flex-col gap-1 border-b border-dashed border-black/40 pb-2 text-center">
            <p className="text-xs font-bold uppercase">
              {data.businessName || "M.O.B.I. Retail"}
            </p>
            {data.tenantId && <p>Tenant: {data.tenantId}</p>}
            {data.emissionPoint && <p>Punto: {data.emissionPoint}</p>}
            {data.operatorName && <p>Cajero: {data.operatorName}</p>}
            <p>{docLabel(data.documentType)}</p>
            {data.issuedAt && <p>{new Date(data.issuedAt).toLocaleString("es-SV")}</p>}
          </header>

          <section className="flex flex-col gap-1 border-b border-dashed border-black/40 py-2">
            {data.customerName && <p>Cliente: {data.customerName}</p>}
            {data.customerTaxId && <p>NIT/NRC: {data.customerTaxId}</p>}
            {data.paymentMethod && <p>Pago: {data.paymentMethod}</p>}
          </section>

          <section className="flex flex-col gap-1 border-b border-dashed border-black/40 py-2">
            {data.items.map((item, idx) => (
              <div key={`${item.description}-${idx}`} className="flex flex-col gap-0.5">
                <p className="break-words">{item.description}</p>
                <div className="flex justify-between gap-2">
                  <span>
                    {formatScaledQuantity(item.quantity)} x {formatScaledMoney(item.unitPrice)}
                  </span>
                  <span>{formatScaledMoney(item.lineTotal)}</span>
                </div>
              </div>
            ))}
          </section>

          <section className="flex flex-col gap-1 border-b border-dashed border-black/40 py-2">
            <div className="flex justify-between gap-2">
              <span>Subtotal</span>
              <span>{formatScaledMoney(data.subtotal)}</span>
            </div>
            {typeof data.taxAmount === "number" && (
              <div className="flex justify-between gap-2">
                <span>Impuestos</span>
                <span>{formatScaledMoney(data.taxAmount)}</span>
              </div>
            )}
            <div className="flex justify-between gap-2 font-bold">
              <span>TOTAL</span>
              <span>{formatScaledMoney(data.total)}</span>
            </div>
            {typeof data.totalPaid === "number" && (
              <div className="flex justify-between gap-2">
                <span>Pagado</span>
                <span>{formatScaledMoney(data.totalPaid)}</span>
              </div>
            )}
            {typeof data.changeDue === "number" && data.changeDue > 0 && (
              <div className="flex justify-between gap-2">
                <span>Cambio</span>
                <span>{formatScaledMoney(data.changeDue)}</span>
              </div>
            )}
          </section>

          {(data.controlNumber || data.generationCode || verifyUrl) && (
            <footer className="flex flex-col gap-1 pt-2 text-center">
              {data.controlNumber && <p className="break-all">Control: {data.controlNumber}</p>}
              {data.generationCode && <p className="break-all">Generación: {data.generationCode}</p>}
              {data.mhStatus && <p>MH: {data.mhStatus}</p>}
              {verifyUrl && (
                <>
                  <img
                    src={qrImageUrl(verifyUrl)}
                    alt="QR verificación MH"
                    className="mx-auto mt-1 h-[120px] w-[120px]"
                  />
                  <p className="break-all text-[10px]">{verifyUrl}</p>
                </>
              )}
            </footer>
          )}
        </article>
      </div>

      <style>{`
        @media print {
          body * { visibility: hidden !important; }
          .thermal-print-area, .thermal-print-area * { visibility: visible !important; }
          .thermal-print-area {
            position: absolute;
            left: 0;
            top: 0;
            width: 100%;
            border: 0 !important;
            padding: 0 !important;
            margin: 0 !important;
            background: white !important;
          }
          .thermal-receipt {
            width: ${width === "58mm" ? "58mm" : "80mm"} !important;
            max-width: ${width === "58mm" ? "58mm" : "80mm"} !important;
          }
          .thermal-print-controls { display: none !important; }
        }
      `}</style>
    </div>
  );
}
