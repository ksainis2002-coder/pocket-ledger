// Full-screen messages: the install gate, and storage problems (SPEC Storage errors, App updates).
import { h, replaceChildren } from "../components/dom";
import { openSheet } from "../components/sheet";
import { BASE_PATH } from "./env";
import { reloadApp } from "./updates";

function fullScreen(root: HTMLElement, ...children: (Node | null)[]): void {
  replaceChildren(root, h("main", { class: "full-screen" }, h("div", { class: "full-screen-card" }, ...children)));
}

const INSTALL_STEPS = (): HTMLElement =>
  h(
    "ol",
    { class: "steps" },
    h("li", {}, "Tap the Share button in Safari."),
    h("li", {}, "Choose Add to Home Screen."),
    h("li", {}, "Open Pocket Ledger from your home screen."),
  );

export function showCantOpen(root: HTMLElement): void {
  fullScreen(
    root,
    h("h1", {}, "Can't open your data"),
    h("p", {}, "Pocket Ledger couldn't open its storage on this device. Your data hasn't been changed. Reload to try again. If it keeps happening, check that the browser isn't in private mode and has space left."),
    h("button", { type: "button", class: "btn btn-primary btn-block", onclick: reloadApp }, "Reload"),
  );
}

export function showUpdated(root: HTMLElement): void {
  fullScreen(
    root,
    h("h1", {}, "Pocket Ledger was updated"),
    h("p", {}, "A newer version was opened in another window. Reload to keep going with it."),
    h("button", { type: "button", class: "btn btn-primary btn-block", onclick: reloadApp }, "Reload"),
  );
}

export function showBlocked(root: HTMLElement): void {
  fullScreen(root, h("h1", {}, "Close other Pocket Ledger windows"), h("p", {}, "Close other Pocket Ledger windows or tabs to finish updating. This screen goes away by itself when they're closed."));
}

/** The install gate. `onUseSafari` runs after the owner confirms "Use in Safari". */
export function showInstallGate(root: HTMLElement, onUseSafari: () => void): void {
  const anyway = h("button", { type: "button", class: "link-btn" }, "Use in Safari anyway");
  anyway.addEventListener("click", () => {
    const go = h("button", { type: "button", class: "btn btn-danger btn-block" }, "Use in Safari");
    const back = h("button", { type: "button", class: "btn btn-block" }, "Go back");
    const sheet = openSheet({
      title: "Use in Safari?",
      content: [
        h("p", { class: "sheet-text" }, "Data you enter in Safari stays in Safari. It won't appear in the installed app, and Safari can delete it if you don't use it for a while."),
        go,
        back,
      ],
    });
    back.addEventListener("click", () => sheet.close());
    go.addEventListener("click", () => {
      sheet.close();
      onUseSafari();
    });
  });
  fullScreen(
    root,
    h("img", { src: BASE_PATH + "icons/icon.svg", alt: "", width: 56, height: 56, class: "gate-icon" }),
    h("h1", {}, "Install Pocket Ledger first"),
    h("p", {}, "On iPhone, data you enter in Safari stays in Safari and can be deleted by the browser."),
    INSTALL_STEPS(),
    anyway,
  );
}

/** The permanent banner shown when the owner chose to use Safari anyway. */
export function safariBanner(): HTMLElement {
  const install = h("button", { type: "button", class: "link-btn" }, "Install");
  install.addEventListener("click", () => openSheet({ title: "Install Pocket Ledger", content: [INSTALL_STEPS()] }));
  return h("div", { class: "banner", role: "note", id: "safari-banner" }, h("p", { class: "banner-text" }, "Not installed: your data may be deleted."), install);
}
