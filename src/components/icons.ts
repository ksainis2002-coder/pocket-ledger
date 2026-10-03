import { s } from "./dom";

const PATHS: Record<string, string[]> = {
  net: ["M4 19V10", "M10 19V5", "M16 19v-7", "M21 19H3"],
  income: ["M12 19V5", "M6 11l6-6 6 6"],
  expenses: ["M12 5v14", "M6 13l6 6 6-6"],
  savings: ["M4 7h16v12H4z", "M4 11h16", "M15 15h2"],
  goals: [],
  prev: ["M15 6l-6 6 6 6"],
  next: ["M9 6l6 6-6 6"],
  close: ["M6 6l12 12", "M18 6L6 18"],
  down: ["M7 10l5 5 5-5"],
  more: ["M5 12h.01", "M12 12h.01", "M19 12h.01"],
  plus: ["M12 5v14", "M5 12h14"],
  edit: ["M4 20h4L19 9l-4-4L4 16v4z"],
  warning: ["M12 4l9 16H3z", "M12 10v4", "M12 17h.01"],
};

/** Line icons drawn with currentColor. */
export function icon(name: keyof typeof PATHS | string, label?: string): SVGSVGElement {
  const svg = s("svg", { viewBox: "0 0 24 24", class: "icon", "aria-hidden": label ? null : "true", role: label ? "img" : null, "aria-label": label ?? null });
  if (name === "goals") {
    svg.append(s("circle", { cx: 12, cy: 12, r: 8 }), s("circle", { cx: 12, cy: 12, r: 4 }), s("circle", { cx: 12, cy: 12, r: 0.8, class: "filled" }));
  } else {
    for (const d of PATHS[name] ?? []) svg.append(s("path", { d }));
  }
  return svg;
}
