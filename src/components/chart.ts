// The Net tab's 6-month chart: income, expenses and net to savings per month, as grouped bars
// on one scale, with a zero line (net to savings can go below it). A hidden table carries the same
// figures for screen readers.
import { h, s } from "./dom";

export interface ChartMonth {
  label: string;
  income: number;
  expenses: number;
  netToSavings: number;
}

const SERIES = [
  { key: "income", name: "Income", tone: "income" },
  { key: "expenses", name: "Expenses", tone: "spend" },
  { key: "netToSavings", name: "Net to savings", tone: "save" },
] as const;

/** A "nice" step (1, 2 or 5 × 10^n) for about `target` gridlines. */
export function niceStep(range: number, target = 4): number {
  if (range <= 0) return 1;
  const raw = range / target;
  const p = Math.pow(10, Math.floor(Math.log10(raw)));
  const n = raw / p;
  return (n <= 1 ? 1 : n <= 2 ? 2 : n <= 5 ? 5 : 10) * p;
}

/** Axis labels in whole units of currency: 1200 € -> "1.2k". Display only. */
function axisLabel(cents: number): string {
  const units = cents / 100;
  const abs = Math.abs(units);
  if (abs >= 1000) return `${units < 0 ? "−" : ""}${+(abs / 1000).toFixed(1)}k`;
  return `${units < 0 ? "−" : ""}${Math.round(abs)}`;
}

export function netChart(months: readonly ChartMonth[], money: (cents: number) => string): HTMLElement {
  const W = 360;
  const H = 200;
  const L = 40;
  const R = 8;
  const T = 10;
  const B = 26;
  const values = months.flatMap((m) => [m.income, m.expenses, m.netToSavings]);
  const hi = Math.max(0, ...values);
  const lo = Math.min(0, ...values);
  const step = niceStep(hi - lo || 100);
  const top = Math.ceil(hi / step) * step || step;
  const bottom = Math.floor(lo / step) * step;
  const y = (v: number): number => T + ((top - v) / (top - bottom)) * (H - T - B);
  const groupW = (W - L - R) / months.length;
  const barW = Math.min(12, groupW / 4.2);

  const svg = s("svg", { viewBox: `0 0 ${W} ${H}`, class: "chart", "aria-hidden": "true", focusable: "false" });
  for (let v = bottom; v <= top + step / 2; v += step) {
    svg.append(s("line", { x1: L, x2: W - R, y1: y(v), y2: y(v), class: v === 0 ? "chart-zero" : "chart-grid" }));
    svg.append(s("text", { x: L - 6, y: y(v) + 3, "text-anchor": "end", class: "chart-axis" }, axisLabel(v)));
  }
  months.forEach((m, i) => {
    const cx = L + groupW * i + groupW / 2;
    SERIES.forEach((series, j) => {
      const v = m[series.key];
      if (v === 0) return;
      const x = cx - (barW * 3 + 2) / 2 + j * (barW + 1);
      const y0 = y(0);
      const y1 = y(v);
      svg.append(s("rect", { x, y: Math.min(y0, y1), width: barW, height: Math.max(1, Math.abs(y1 - y0)), rx: 2, class: `chart-bar tone-fill-${series.tone}` }));
    });
    svg.append(s("text", { x: cx, y: H - 8, "text-anchor": "middle", class: "chart-axis" }, m.label));
  });

  const legend = h(
    "ul",
    { class: "legend", "aria-hidden": "true" },
    ...SERIES.map((sr) => h("li", {}, h("span", { class: `legend-key tone-fill-${sr.tone}` }), sr.name)),
  );
  // Tables ignore the 1px "visually hidden" size, so the wrapper is what's hidden.
  const table = h(
    "table",
    {},
    h("caption", {}, "Income, expenses and net to savings, last 6 months"),
    h("thead", {}, h("tr", {}, h("th", { scope: "col" }, "Month"), ...SERIES.map((sr) => h("th", { scope: "col" }, sr.name)))),
    h("tbody", {}, ...months.map((m) => h("tr", {}, h("th", { scope: "row" }, m.label), ...SERIES.map((sr) => h("td", {}, money(m[sr.key])))))),
  );
  return h("figure", { class: "chart-wrap" }, svg, legend, h("div", { class: "visually-hidden" }, table));
}
