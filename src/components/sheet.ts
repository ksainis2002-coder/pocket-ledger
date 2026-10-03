// Bottom sheet on phones, centered dialog on PCs. Built on <dialog> so focus, Escape and
// the backdrop behave natively. Never window.confirm.
import { h } from "./dom";
import { icon } from "./icons";

export interface Sheet {
  el: HTMLDialogElement;
  body: HTMLElement;
  close(): void;
}

let open: Sheet | null = null;

export function openSheet(opts: { title: string; content: Node[]; onClose?: () => void; labelledBy?: string }): Sheet {
  open?.close();
  const opener = document.activeElement instanceof HTMLElement ? document.activeElement : null;
  const titleId = `sheet-title-${Math.random().toString(36).slice(2, 8)}`;
  const body = h("div", { class: "sheet-body" }, ...opts.content);
  const closeBtn = h("button", { type: "button", class: "icon-btn", "aria-label": "Close" }, icon("close"));
  const dialog = h(
    "dialog",
    { class: "sheet", "aria-labelledby": titleId },
    h("div", { class: "sheet-inner" }, h("div", { class: "sheet-head" }, h("h2", { class: "sheet-title", id: titleId }, opts.title), closeBtn), body),
  );
  document.body.append(dialog);

  let closed = false;
  const close = (): void => {
    if (closed) return;
    closed = true;
    if (dialog.open) dialog.close();
    dialog.remove();
    if (open === sheet) open = null;
    opts.onClose?.();
    if (opener?.isConnected) opener.focus({ preventScroll: true });
  };
  closeBtn.addEventListener("click", close);
  dialog.addEventListener("close", close);
  dialog.addEventListener("cancel", (e) => {
    e.preventDefault();
    close();
  });
  // A tap on the backdrop (outside the inner panel) closes the sheet.
  dialog.addEventListener("click", (e) => {
    if (e.target === dialog) close();
  });

  const sheet: Sheet = { el: dialog, body, close };
  open = sheet;
  dialog.showModal();
  const first = body.querySelector<HTMLElement>("input:not([type=date]), select, textarea, button");
  first?.focus();
  return sheet;
}

export interface Choice {
  label: string;
  kind?: "primary" | "danger" | "plain";
  /** Shown under the button: what this choice will do. */
  note?: string;
  disabled?: boolean;
  onSelect: () => void | Promise<void>;
}

/** A sheet with a short explanation and a list of choices (archive, delete, and similar). */
export function openChoiceSheet(opts: { title: string; text?: string[]; choices: Choice[] }): Sheet {
  const content: Node[] = (opts.text ?? []).map((t) => h("p", { class: "sheet-text" }, t));
  const list = h("div", { class: "choice-list" });
  const sheet = openSheet({ title: opts.title, content: [...content, list] });
  for (const c of opts.choices) {
    const btn = h("button", { type: "button", class: `btn btn-${c.kind ?? "plain"} btn-block`, disabled: c.disabled ?? false }, c.label);
    btn.addEventListener("click", async () => {
      btn.disabled = true;
      try {
        await c.onSelect();
      } finally {
        btn.disabled = c.disabled ?? false;
      }
    });
    list.append(h("div", { class: "choice" }, btn, c.note ? h("p", { class: "choice-note" }, c.note) : null));
  }
  return sheet;
}
