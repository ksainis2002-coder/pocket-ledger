// Tiny DOM helpers. Text always goes in with textContent, never as HTML.

type Child = Node | string | number | null | undefined | false;
type Attrs = Record<string, string | number | boolean | null | undefined | EventListener>;

function apply(el: Element, attrs: Attrs | undefined): void {
  if (!attrs) return;
  for (const [key, value] of Object.entries(attrs)) {
    if (value === null || value === undefined || value === false) continue;
    if (key.startsWith("on") && typeof value === "function") {
      el.addEventListener(key.slice(2).toLowerCase(), value);
    } else if (value === true) {
      el.setAttribute(key, "");
    } else {
      el.setAttribute(key, String(value));
    }
  }
}

function append(el: Element, children: Child[]): void {
  for (const c of children) {
    if (c === null || c === undefined || c === false) continue;
    el.append(typeof c === "string" || typeof c === "number" ? document.createTextNode(String(c)) : c);
  }
}

/** Create an HTML element: h("button", { class: "btn", onclick: fn }, "Add"). */
export function h<K extends keyof HTMLElementTagNameMap>(tag: K, attrs?: Attrs, ...children: Child[]): HTMLElementTagNameMap[K] {
  const el = document.createElement(tag);
  apply(el, attrs);
  append(el, children);
  return el;
}

const SVG_NS = "http://www.w3.org/2000/svg";

/** Create an SVG element. */
export function s<K extends keyof SVGElementTagNameMap>(tag: K, attrs?: Attrs, ...children: Child[]): SVGElementTagNameMap[K] {
  const el = document.createElementNS(SVG_NS, tag);
  apply(el, attrs);
  append(el, children);
  return el;
}

/** Replace all children of an element. */
export function replaceChildren(el: Element, ...children: Child[]): void {
  el.replaceChildren();
  append(el, children);
}
