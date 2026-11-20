const CURRENCY_CODE_PATTERN = /^[A-Z]{3}$/;
const AMOUNT_PATTERN = /^(?:\d+(?:\.\d*)?|\.\d+)$/;

export function getCurrencySettings(user) {
  const metadata = user?.user_metadata;
  const preference =
    typeof metadata?.currency_code === "string" && metadata.currency_code.trim()
      ? metadata.currency_code.trim()
      : metadata?.currency;
  const match =
    typeof preference === "string"
      ? preference.match(/^([A-Za-z]{3})$|\(([A-Za-z]{3})\)\s*$/)
      : null;
  const preferredCode = (match?.[1] || match?.[2])?.toUpperCase();

  if (preferredCode && CURRENCY_CODE_PATTERN.test(preferredCode)) {
    try {
      new Intl.NumberFormat(undefined, {
        style: "currency",
        currency: preferredCode,
      });
      return { code: preferredCode, isFallback: false };
    } catch {
      // Use the safe fallback below for invalid account metadata.
    }
  }

  return { code: "USD", isFallback: true };
}

export function formatCurrency(amount, currencyCode) {
  const code =
    typeof currencyCode === "string" &&
    CURRENCY_CODE_PATTERN.test(currencyCode.toUpperCase())
      ? currencyCode.toUpperCase()
      : "USD";

  try {
    return new Intl.NumberFormat(undefined, {
      style: "currency",
      currency: code,
    }).format(Number(amount));
  } catch {
    return `${code} ${Number(amount).toLocaleString()}`;
  }
}

export function getCurrencyDecimalPlaces(currencyCode) {
  try {
    return new Intl.NumberFormat(undefined, {
      style: "currency",
      currency: currencyCode.toUpperCase(),
    }).resolvedOptions().maximumFractionDigits;
  } catch {
    return 2;
  }
}

export function validateCurrencyAmount(value, currencyCode) {
  const amountText =
    typeof value === "string" ? value.trim() : String(value ?? "");

  if (!amountText) {
    return "Enter an amount.";
  }
  if (amountText.startsWith("-")) {
    return "Enter an amount greater than zero.";
  }
  if (!AMOUNT_PATTERN.test(amountText)) {
    return "Use digits and a decimal point only.";
  }

  const amount = Number(amountText);
  if (!Number.isFinite(amount) || amount <= 0) {
    return "Enter an amount greater than zero.";
  }
  if (amount >= 100000000000000) {
    return "Enter a smaller amount.";
  }

  const decimalPlaces = getCurrencyDecimalPlaces(currencyCode);
  const decimalPart = amountText.split(".")[1] || "";
  if (decimalPart.length > decimalPlaces) {
    return `Enter an amount with no more than ${decimalPlaces} decimal places.`;
  }

  return "";
}
