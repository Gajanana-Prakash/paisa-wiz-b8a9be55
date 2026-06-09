/**
 * Mock NIC E-Way Bill (EWB) service.
 *
 * Same pattern as einvoice.server.ts: while ENABLE_EWAY is false the
 * functions return deterministic mock data so the SaaS can be built and
 * demoed without GSTN/NIC EWB credentials. Swap function bodies later to
 * call the real NIC EWB API.
 */

export const ENABLE_EWAY =
  (process.env.ENABLE_EWAY ?? "false").toLowerCase() === "true";

export type EwbGenerateInput = {
  supplyType: "OUTWARD" | "INWARD";
  transactionType: "REGULAR" | "BILL_TO_SHIP_TO" | "BILL_FROM_DISPATCH_FROM" | "COMBINATION";
  documentType: "TAX_INVOICE" | "BILL_OF_SUPPLY" | "CHALLAN" | "CREDIT_NOTE" | "BILL_OF_ENTRY" | "OTHERS";
  documentNumber: string;
  documentDate: string;
  fromGstin: string | null;
  fromPlace: string | null;
  fromPincode: string | null;
  fromStateCode: string | null;
  toGstin: string | null;
  toTradeName: string | null;
  toPlace: string | null;
  toPincode: string | null;
  toStateCode: string | null;
  totalValue: number;
  hsnCode: string | null;
  transportMode: "ROAD" | "RAIL" | "AIR" | "SHIP";
  vehicleNumber: string | null;
  vehicleType: "REGULAR" | "OVER_DIMENSIONAL_CARGO";
  transporterName: string | null;
  transporterId: string | null;
  distanceKm: number;
  items: Array<{
    productName: string;
    hsnCode: string | null;
    quantity: number;
    unit: string | null;
    taxableValue: number;
    cgstRate: number;
    sgstRate: number;
    igstRate: number;
  }>;
};

export type EwbGenerateResult = {
  ewbNumber: string;
  ewbDate: string; // ISO
  ewbValidUntil: string; // ISO
  raw: Record<string, unknown>;
};

/** Plain-English translation table for common NIC EWB error codes. */
export const EWB_ERROR_MESSAGES: Record<string, string> = {
  "238": "Invalid supplier GSTIN.",
  "239": "Invalid recipient GSTIN.",
  "311": "Vehicle number format is invalid (use MH12AB1234).",
  "312": "Distance must be greater than zero.",
  "350": "EWB already cancelled.",
  "378": "Goods are in transit — cancellation not allowed.",
  "604": "EWB can be cancelled only within 24 hours of generation.",
  "705": "Document number is mandatory.",
};

export class EwbError extends Error {
  code: string;
  constructor(code: string, message?: string) {
    super(message || EWB_ERROR_MESSAGES[code] || `NIC EWB error ${code}`);
    this.code = code;
  }
}

/**
 * Validity is driven by distance and vehicle type (per NIC rules).
 * REGULAR vehicles: 1 day per 200km (1 day minimum). ODC: 1 day per 20km.
 * Returns the valid-until ISO timestamp.
 */
export function computeValidUntil(distanceKm: number, vehicleType: "REGULAR" | "OVER_DIMENSIONAL_CARGO", from = new Date()): string {
  const perDay = vehicleType === "OVER_DIMENSIONAL_CARGO" ? 20 : 200;
  const days = Math.max(1, Math.ceil((distanceKm || 1) / perDay));
  const out = new Date(from);
  out.setDate(out.getDate() + days);
  out.setHours(23, 59, 59, 0);
  return out.toISOString();
}

function randomDigits(len: number): string {
  let out = "";
  for (let i = 0; i < len; i++) out += Math.floor(Math.random() * 10).toString();
  return out;
}

function mockEwbNumber(): string {
  // NIC EWB numbers are 12 digits.
  return randomDigits(12);
}

export async function ewbGenerate(input: EwbGenerateInput): Promise<EwbGenerateResult> {
  if (ENABLE_EWAY) {
    throw new EwbError("EWB_DISABLED_LIVE_NOT_CONFIGURED", "Live NIC EWB integration is not configured in this build.");
  }
  if (!input.documentNumber) throw new EwbError("705");
  if (!input.distanceKm || input.distanceKm <= 0) throw new EwbError("312");
  if (input.transportMode === "ROAD" && input.vehicleNumber) {
    const cleaned = input.vehicleNumber.replace(/\s+/g, "").toUpperCase();
    if (!/^[A-Z]{2}[0-9]{1,2}[A-Z]{1,3}[0-9]{1,4}$/.test(cleaned)) {
      throw new EwbError("311");
    }
  }

  const now = new Date();
  const ewbNumber = mockEwbNumber();
  const ewbDate = now.toISOString();
  const ewbValidUntil = computeValidUntil(input.distanceKm, input.vehicleType, now);
  return {
    ewbNumber,
    ewbDate,
    ewbValidUntil,
    raw: { mock: true, mode: "MOCK", request: input, response: { ewbNo: ewbNumber, ewbDate, validUpto: ewbValidUntil } },
  };
}

export async function ewbCancel(input: { ewbNumber: string; ewbDate: string; reasonCode: string; reasonText: string }): Promise<{ cancelledAt: string; raw: Record<string, unknown> }> {
  if (ENABLE_EWAY) throw new EwbError("EWB_DISABLED_LIVE_NOT_CONFIGURED");
  if (!input.ewbNumber) throw new EwbError("705");
  // 24-hour rule
  if (Date.now() - new Date(input.ewbDate).getTime() > 24 * 60 * 60 * 1000) {
    throw new EwbError("604");
  }
  return { cancelledAt: new Date().toISOString(), raw: { mock: true, ewbNo: input.ewbNumber, reason: input.reasonCode } };
}

export async function ewbExtendValidity(input: {
  ewbNumber: string;
  vehicleNumber: string;
  fromPlace: string;
  remainingDistance: number;
  vehicleType: "REGULAR" | "OVER_DIMENSIONAL_CARGO";
}): Promise<{ newValidUntil: string; raw: Record<string, unknown> }> {
  if (ENABLE_EWAY) throw new EwbError("EWB_DISABLED_LIVE_NOT_CONFIGURED");
  if (!input.ewbNumber) throw new EwbError("705");
  const newValidUntil = computeValidUntil(input.remainingDistance, input.vehicleType);
  return { newValidUntil, raw: { mock: true, ewbNo: input.ewbNumber, newValidUntil } };
}

export async function ewbUpdateVehicle(input: {
  ewbNumber: string;
  vehicleNumber: string;
  fromPlace: string;
  reasonCode: string;
}): Promise<{ updatedAt: string; raw: Record<string, unknown> }> {
  if (ENABLE_EWAY) throw new EwbError("EWB_DISABLED_LIVE_NOT_CONFIGURED");
  if (!input.ewbNumber) throw new EwbError("705");
  return { updatedAt: new Date().toISOString(), raw: { mock: true, ewbNo: input.ewbNumber, vehicleNumber: input.vehicleNumber } };
}

export async function ewbTestConnection(_settings: {
  gstin: string | null;
  ewbUsername: string | null;
  sandboxMode: boolean;
}): Promise<{ ok: boolean; message: string }> {
  if (ENABLE_EWAY) {
    return { ok: false, message: "Live NIC EWB integration is not configured in this build." };
  }
  return { ok: true, message: "Mock NIC EWB connection successful." };
}
