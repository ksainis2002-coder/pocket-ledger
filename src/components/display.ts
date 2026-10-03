// Small display pieces: bar rows, the goal ring, hero figures and empty states.
import { h, s } from "./dom";

export type BarTone = "income" | "spend" | "save" | "ok" | "warn" | "bad";

/** A labeled bar. `fraction` is 0..1 of the track. */
export function barRow(opts: { label: string; value: string; fraction: number; tone: BarTone; pill?: { text: string; tone: "ok" | "warn" | "bad" }; onClick?: () => void; ariaLabel?: string }): HTMLElement {
  const fill = h("span", { class: `bar-fill tone-${opts.tone}` });
  fill.style.width = `${Math.max(0, Math.min(1, opts.fraction)) * 100}%`;
  const children = [
    h("span", { class: "bar-label" }, opts.label),
    h("span", { class: "bar-track", "aria-hidden": "true" }, fill),
    opts.pill ? h("span", { class: `pill pill-${opts.pill.tone}` }, opts.pill.text) : h("span", { class: "bar-value num" }, opts.value),
  ];
  if (opts.onClick) {
    return h("button", { type: "button", class: "bar-row bar-row-btn", onclick: opts.onClick, "aria-label": opts.ariaLabel ?? null }, ...children);
  }
  return h("div", { class: "bar-row" }, ...children);
}

export function ring(fraction: number, label: string): SVGSVGElement {
  const r = 26;
  const c = 2 * Math.PI * r;
  const f = Math.max(0, Math.min(1, fraction));
  return s(
    "svg",
    { class: "ring", viewBox: "0 0 64 64", role: "img", "aria-label": label },
    s("circle", { cx: 32, cy: 32, r, class: "ring-track" }),
    f > 0 ? s("circle", { cx: 32, cy: 32, r, class: "ring-fill", "stroke-dasharray": `${c * f} ${c}`, transform: "rotate(-90 32 32)" }) : null,
    s("text", { x: 32, y: 36, "text-anchor": "middle", class: "ring-text" }, `${Math.round(f * 100)}%`),
  );
}

export function hero(label: string, value: string, opts: { tone?: "bad" | "income" | "save"; note?: string | Node; id?: string } = {}): HTMLElement {
  return h(
    "section",
    { class: "hero", id: opts.id ?? null },
    h("p", { class: "label" }, label),
    h("p", { class: `hero-value num${opts.tone ? ` tone-text-${opts.tone}` : ""}` }, value),
    opts.note ? h("p", { class: "hero-note" }, opts.note) : null,
  );
}

export function emptyState(heading: string, body: string): HTMLElement {
  return h("section", { class: "empty" }, h("h2", { class: "empty-heading" }, heading), h("p", { class: "empty-body" }, body));
}

export function sectionTitle(text: string, action?: HTMLElement): HTMLElement {
  return h("div", { class: "section-head" }, h("h2", { class: "section-title" }, text), action ?? null);
}
