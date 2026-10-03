// A row of single-choice chips (a radio group): category chips, direction, and similar.
import { h } from "./dom";

export interface Chips {
  el: HTMLElement;
  value(): string;
  set(value: string): void;
  setOptions(options: readonly { value: string; label: string }[]): void;
}

export function createChips(opts: {
  label: string;
  options: readonly { value: string; label: string }[];
  value: string;
  onChange?: (value: string) => void;
  /** An extra button after the chips, e.g. "More". */
  extra?: HTMLElement;
  className?: string;
}): Chips {
  let value = opts.value;
  let buttons: HTMLButtonElement[] = [];
  const group = h("div", { class: `chips ${opts.className ?? ""}`.trim(), role: "radiogroup", "aria-label": opts.label });

  const sync = (): void => {
    for (const b of buttons) {
      const on = b.dataset["value"] === value;
      b.setAttribute("aria-checked", String(on));
      b.tabIndex = on ? 0 : -1;
    }
    if (!buttons.some((b) => b.dataset["value"] === value) && buttons[0]) buttons[0].tabIndex = 0;
  };

  const select = (v: string, notify: boolean): void => {
    value = v;
    sync();
    if (notify) opts.onChange?.(v);
  };

  const render = (options: readonly { value: string; label: string }[]): void => {
    buttons = options.map((o) =>
      h("button", { type: "button", class: "chip", role: "radio", "data-value": o.value, onclick: () => select(o.value, true) }, o.label),
    );
    buttons.forEach((b, i) =>
      b.addEventListener("keydown", (e) => {
        const step = e.key === "ArrowRight" || e.key === "ArrowDown" ? 1 : e.key === "ArrowLeft" || e.key === "ArrowUp" ? -1 : 0;
        if (!step) return;
        e.preventDefault();
        const next = buttons[(i + step + buttons.length) % buttons.length];
        if (next) {
          next.focus();
          select(next.dataset["value"] ?? "", true);
        }
      }),
    );
    group.replaceChildren(...buttons, ...(opts.extra ? [opts.extra] : []));
    sync();
  };

  render(opts.options);
  return {
    el: group,
    value: () => value,
    set: (v) => select(v, false),
    setOptions: render,
  };
}
