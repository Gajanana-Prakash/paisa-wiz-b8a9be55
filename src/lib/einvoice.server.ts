/**
 * Mock IRP (Invoice Registration Portal) service abstraction.
 *
 * In production this would call NIC IRP sandbox/live endpoints. While
 * ENABLE_EINVOICE is false the same surface returns deterministic mock data
 * so the rest of the SaaS can be built and demoed without GSTN credentials.
 *
 * To swap in the real implementation later, only the body of these functions
 * needs to change — call sites and DB schema stay the same.
 */
import QRCode from "qrcode";

export const ENABLE_EINVOICE =
  (process.env.ENABLE_EINVOICE ?? "false").toLowerCase() === "true";

export type IrnGenerateInput = {
  supplierGstin: string | null;
  buyerGstin: string | null;
  invoiceNumber: string;
  invoiceDate: string;
  totalAmount: number;
  cgst: number;
  sgst: number;
  igst: number;
  items: Array<{
    description: string;
    quantity: number;
    unitPrice: number;
    gstRate: number;
    total: number;
  }>;
};

export type IrnGenerateResult = {
  irn: string;
  ackNumber: string;
  ackDate: string; // ISO
  qrCodeData: string;
  signedInvoiceJson: string;
  raw: Record<string, unknown>;
};

export type IrpCancelInput = {
  irn: string;
  reason: "1" | "2" | "3" | "4";
  reasonText: string;
};

/** Plain-English translation table for common NIC IRP error codes. */
export const IRP_ERROR_MESSAGES: Record<string, string> = {
  "2150": "Duplicate IRN — this invoice has already been registered.",
  "2172": "Invalid supply type.",
  "2176": "Invalid invoice type.",
  "2182": "Total invoice value mismatch.",
  "2189": "Invalid total item value.",
  "2193": "Document date cannot be a future date.",
  "2194": "Document date is older than allowed (>30 days).",
  "2227": "GSTIN is suspended.",
  "3028": "GSTIN is invalid or not registered on IRP.",
  "3029": "Recipient GSTIN cancelled.",
  "RET191106": "GSTIN not found.",
};

export class IrpError extends Error {
  code: string;
  constructor(code: string, message?: string) {
    super(message || IRP_ERROR_MESSAGES[code] || `IRP error ${code}`);
    this.code = code;
  }
}

function randomHash(len: number): string {
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
  let out = "";
  for (let i = 0; i < len; i++) out += chars[Math.floor(Math.random() * chars.length)];
  return out;
}

/** Generate a deterministic 64-char IRN-looking string. */
function mockIrn(input: IrnGenerateInput): string {
  const seed = `${input.supplierGstin || "MOCK"}-${input.invoiceNumber}-${input.invoiceDate}`;
  // Stretch the seed to 64 chars while keeping characters in IRN range.
  const filled = (seed.replace(/[^A-Z0-9]/gi, "").toUpperCase() + randomHash(64)).slice(0, 64);
  return filled;
}

/** Render the signed QR string to a base64 PNG data URL. */
export async function renderQrDataUrl(qrData: string): Promise<string> {
  return QRCode.toDataURL(qrData, { errorCorrectionLevel: "M", width: 320, margin: 1 });
}

/**
 * Mock IRN generator. Behaves like the real IRP for happy-path callers and
 * occasionally throws an IrpError so error paths can be exercised.
 */
export async function irpGenerateIrn(input: IrnGenerateInput): Promise<IrnGenerateResult> {
  if (ENABLE_EINVOICE) {
    // TODO: swap in real NIC IRP call here. Same input/output contract.
    throw new IrpError(
      "EINVOICE_DISABLED_LIVE_NOT_CONFIGURED",
      "Live IRP integration is not configured in this build.",
    );
  }

  if (!input.invoiceNumber || !input.invoiceDate) {
    throw new IrpError("2182", "Invoice number and date are required.");
  }

  const irn = mockIrn(input);
  const ackNumber = `ACK${randomHash(12)}`;
  const ackDate = new Date().toISOString();
  // The real "signed QR" is a JWT; for the mock we pack a compact JSON.
  const qrPayload = {
    SellerGstin: input.supplierGstin,
    BuyerGstin: input.buyerGstin,
    DocNo: input.invoiceNumber,
    DocTyp: "INV",
    DocDt: input.invoiceDate,
    TotInvVal: input.totalAmount,
    ItemCnt: input.items.length,
    MainHsnCode: "998231",
    Irn: irn,
    IrnDt: ackDate,
  };
  const qrCodeData = `MOCK.${Buffer.from(JSON.stringify(qrPayload)).toString("base64url")}`;
  const signedInvoiceJson = JSON.stringify(
    { ...qrPayload, Signature: "MOCK_SIGNATURE_" + randomHash(40) },
    null,
    2,
  );
  return {
    irn,
    ackNumber,
    ackDate,
    qrCodeData,
    signedInvoiceJson,
    raw: { mock: true, mode: "MOCK", request: input, response: qrPayload },
  };
}

export async function irpCancelIrn(input: IrpCancelInput): Promise<{ cancelledAt: string; raw: Record<string, unknown> }> {
  if (ENABLE_EINVOICE) {
    throw new IrpError("EINVOICE_DISABLED_LIVE_NOT_CONFIGURED", "Live IRP integration is not configured in this build.");
  }
  if (!input.irn) throw new IrpError("2150", "IRN is required.");
  return { cancelledAt: new Date().toISOString(), raw: { mock: true, irn: input.irn, reason: input.reason } };
}

/**
 * Mock connection test. Returns ok=true in mock mode so the UI flow works
 * end-to-end without real credentials.
 */
export async function irpTestConnection(_settings: {
  gstin: string | null;
  irpUsername: string | null;
  clientIdIrp: string | null;
  sandboxMode: boolean;
}): Promise<{ ok: boolean; message: string }> {
  if (ENABLE_EINVOICE) {
    return { ok: false, message: "Live IRP integration is not configured in this build." };
  }
  return { ok: true, message: "Mock IRP connection successful." };
}
