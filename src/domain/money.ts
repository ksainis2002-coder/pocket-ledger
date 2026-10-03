// Money: parsing typed amounts into integer cents, and formatting cents for display.
// No floating-point math anywhere: cents are built from the digit strings.
import { MAX_CENTS } from "./types";

export type ParseResult = { ok: true; cents: number } | { ok: false; error: "format" | "tooLarge" };

export const AMOUNT_FORMAT_MESSAGE = "Enter an amount like 12,50";
export const AMOUNT_TOO_LARGE_MESSAGE = "That amount is too large.";

const SPACES = /[\s  ]/g;

/**
 * Parse what someone typed into an amount field (SPEC Amount input).
 * Accepts "12,50", "12.50", "1.234,56", "1,234.56", "12,345" (thousands), ",50", "1 234,56".
 * Rejects letters, signs, a trailing separator, 4+ digits after the last separator, and zero
 * (zero is allowed only with `allowZero`, for a goal's "already saved").
 */
export function parseAmount(text: string, { allowZero = false } = {}): ParseResult {
  const s = text.replace(SPACES, "");
  if (s === "" || !/^[0-9.,]+$/.test(s)) return { ok: false, error: "format" };

  const parts = s.split(/([.,])/); // digits, sep, digits, sep, ...
  const groups = parts.filter((_, i) => i % 2 === 0);
  const seps = parts.filter((_, i) => i % 2 === 1);

  let intDigits: string;
  let fracDigits = "";

  if (seps.length === 0) {
    intDigits = s;
  } else {
    const last = groups[groups.length - 1] ?? "";
    if (last.length === 0) return { ok: false, error: "format" }; // trailing separator
    if (last.length >= 4) return { ok: false, error: "format" };

    let thousandSeps: string[];
    let intGroups: string[];
    if (last.length <= 2) {
      // The last separator is the decimal mark.
      fracDigits = last;
      thousandSeps = seps.slice(0, -1);
      intGroups = groups.slice(0, -1);
      const decimal = seps[seps.length - 1];
      if (thousandSeps.some((t) => t === decimal)) return { ok: false, error: "format" };
    } else {
      // Exactly 3 digits after the last separator: it's a thousands separator.
      thousandSeps = seps;
      intGroups = groups;
    }

    if (thousandSeps.length > 0) {
      if (new Set(thousandSeps).size > 1) return { ok: false, error: "format" };
      const [first, ...rest] = intGroups;
      if (!first || first.length > 3 || rest.some((g) => g.length !== 3)) return { ok: false, error: "format" };
    } else if ((intGroups[0] ?? "") === "" && intGroups.length === 1 && fracDigits === "") {
      return { ok: false, error: "format" };
    }
    intDigits = intGroups.join("");
  }

  intDigits = intDigits.replace(/^0+(?=\d)/, "");
  if (intDigits === "") intDigits = "0";
  if (intDigits.length > 8) return { ok: false, error: "tooLarge" };

  const cents = Number(intDigits) * 100 + Number(fracDigits.padEnd(2, "0")); // lint-ignore: integer digits only
  if (cents > MAX_CENTS) return { ok: false, error: "tooLarge" };
  if (cents === 0 && !allowZero) return { ok: false, error: "format" };
  return { ok: true, cents };
}

export function amountErrorMessage(error: "format" | "tooLarge"): string {
  return error === "tooLarge" ? AMOUNT_TOO_LARGE_MESSAGE : AMOUNT_FORMAT_MESSAGE;
}

const formatters = new Map<string, Intl.NumberFormat>();

/** Format cents for display: "€12.50" or "12,50 €" depending on locale. Whole amounts drop the cents ("€120"). */
export function formatMoney(cents: number, currency = "EUR", locale?: string, { alwaysCents = false } = {}): string {
  const whole = cents % 100 === 0 && !alwaysCents;
  const key = `${currency}|${locale ?? ""}|${whole}`;
  let f = formatters.get(key);
  if (!f) {
    f = new Intl.NumberFormat(locale, {
      style: "currency",
      currency,
      minimumFractionDigits: whole ? 0 : 2,
      maximumFractionDigits: whole ? 0 : 2,
    });
    formatters.set(key, f);
  }
  // Integer cents -> major units for display only; never stored or added.
  return f.format(cents / 100);
}

/** Text for an editable amount field: 1250 -> "12,50" or "12.50" by locale, no symbol, no thousands separator. */
export function centsToInput(cents: number, locale?: string): string {
  const decimal = new Intl.NumberFormat(locale).formatToParts(1.5).find((p) => p.type === "decimal")?.value ?? ".";
  const major = Math.trunc(cents / 100);
  const minor = String(cents % 100).padStart(2, "0");
  return `${major}${decimal}${minor}`;
}
