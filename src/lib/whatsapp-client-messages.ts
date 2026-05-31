export type WaLang = "EN" | "HI";

function formatDateHi(date: string) {
  return new Date(date).toLocaleDateString("hi-IN", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

function formatDateEn(date: string) {
  return new Date(date).toLocaleDateString("en-IN", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

export function documentRequestWhatsApp(opts: {
  lang: WaLang;
  clientName: string;
  firmName: string;
  periodLabel?: string | null;
  docLabel: string;
  link: string;
  dueDate?: string | null;
}) {
  const period = opts.periodLabel ? ` ${opts.periodLabel}` : "";
  const due = opts.dueDate
    ? opts.lang === "HI"
      ? `\nअंतिम तारीख: ${formatDateHi(opts.dueDate)}`
      : `\nDue by: ${formatDateEn(opts.dueDate)}`
    : "";

  if (opts.lang === "HI") {
    return `नमस्ते ${opts.clientName}! आपके CA ${opts.firmName} ने${period} के ${opts.docLabel} मांगे हैं।
कृपया यहाँ अपलोड करें: ${opts.link}${due}`;
  }
  return `Hi ${opts.clientName}! Your CA ${opts.firmName} has requested ${opts.docLabel}${period}.
Please upload here: ${opts.link}${due}`;
}

export function gstFilingReminderWhatsApp(opts: {
  lang: WaLang;
  clientName: string;
  firmName: string;
  filingName: string;
  dueDate: string;
}) {
  const due =
    opts.lang === "HI" ? formatDateHi(opts.dueDate) : formatDateEn(opts.dueDate);

  if (opts.lang === "HI") {
    return `नमस्ते ${opts.clientName}! आपकी ${opts.filingName} फाइलिंग ${due} तक है।
अगर कोई बिल बाकी है तो कृपया अपलोड करें। — ${opts.firmName}`;
  }
  return `Hi ${opts.clientName}! Your ${opts.filingName} filing is due by ${due}.
If any bills are pending, please upload them. — ${opts.firmName}`;
}

export function invoiceNotificationWhatsApp(opts: {
  lang: WaLang;
  clientName: string;
  firmName: string;
  amount: string;
  paymentLink: string;
}) {
  if (opts.lang === "HI") {
    return `नमस्ते ${opts.clientName}! ${opts.firmName} का ${opts.amount} का बिल भेजा गया है।
भुगतान करें: ${opts.paymentLink}`;
  }
  return `Hi ${opts.clientName}! ${opts.firmName} has sent an invoice for ${opts.amount}.
Pay here: ${opts.paymentLink}`;
}
