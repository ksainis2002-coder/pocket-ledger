// Amount field (SPEC Amount input): a text field with the decimal keypad, parsed by parseAmount only.
import { amountErrorMessage, centsToInput, parseAmount, type ParseResult } from "../domain/money";
import { h } from "./dom";

export interface AmountInput {
  el: HTMLElement;
  input: HTMLInputElement;
  /** Parse what's typed. Shows the error under the field when it's invalid. */
  read(): ParseResult;
  setError(message: string | null): void;
  setCents(cents: number | null): void;
  clear(): void;
  focus(): void;
}

export function createAmountInput(opts: { id: string; label: string; allowZero?: boolean; large?: boolean; placeholder?: string; locale?: string | undefined }): AmountInput {
  const errorId = `${opts.id}-error`;
  const input = h("input", {
    id: opts.id,
    class: `input num${opts.large ? " input-large" : ""}`,
    type: "text",
    inputmode: "decimal",
    autocomplete: "off",
    enterkeyhint: "done",
    placeholder: opts.placeholder ?? "0,00",
    "aria-describedby": errorId,
  });
  const error = h("p", { class: "field-error", id: errorId, "aria-live": "polite" });
  const el = h("div", { class: "field" }, h("label", { class: "field-label", for: opts.id }, opts.label), input, error);

  const setError = (message: string | null): void => {
    error.textContent = message ?? "";
    if (message) input.setAttribute("aria-invalid", "true");
    else input.removeAttribute("aria-invalid");
  };
  input.addEventListener("input", () => setError(null));

  return {
    el,
    input,
    read() {
      const r = parseAmount(input.value, { allowZero: opts.allowZero ?? false });
      setError(r.ok ? null : amountErrorMessage(r.error));
      return r;
    },
    setError,
    setCents(cents) {
      input.value = cents === null ? "" : centsToInput(cents, opts.locale);
      setError(null);
    },
    clear() {
      input.value = "";
      setError(null);
    },
    focus() {
      input.focus({ preventScroll: false });
    },
  };
}
