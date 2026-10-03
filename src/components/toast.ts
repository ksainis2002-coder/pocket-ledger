// Toast with an optional Undo button (SPEC Undo: 6 seconds, the newest replaces the old one).
import { h } from "./dom";

export interface Toaster {
  show(message: string, opts?: { undo?: () => void | Promise<void>; kind?: "info" | "error"; ms?: number }): void;
  hide(): void;
}

export function createToaster(): Toaster {
  const text = h("span", { class: "toast-text" });
  const undo = h("button", { type: "button", class: "toast-action" }, "Undo");
  const el = h("div", { class: "toast", role: "status", "aria-live": "polite", hidden: true }, text, undo);
  document.body.append(el);
  let timer: number | undefined;
  let onUndo: (() => void | Promise<void>) | undefined;

  const hide = (): void => {
    el.hidden = true;
    onUndo = undefined;
    window.clearTimeout(timer);
  };
  undo.addEventListener("click", async () => {
    const fn = onUndo;
    hide();
    await fn?.();
  });

  return {
    show(message, opts = {}) {
      window.clearTimeout(timer);
      text.textContent = message;
      onUndo = opts.undo;
      undo.hidden = !opts.undo;
      el.classList.toggle("toast-error", opts.kind === "error");
      el.hidden = false;
      timer = window.setTimeout(hide, opts.ms ?? 6000);
    },
    hide,
  };
}
