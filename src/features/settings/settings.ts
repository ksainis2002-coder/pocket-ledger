// Settings (SPEC Screens: Settings): phone and PC, backup, spreadsheet, preferences, storage,
// updates, installing, and deleting everything.
import { createChips } from "../../components/chips";
import { sectionTitle } from "../../components/display";
import { h, replaceChildren } from "../../components/dom";
import { openSheet } from "../../components/sheet";
import { DATE_LOCALE } from "../../domain/months";
import type { Theme } from "../../domain/types";
import { type AppContext, type Screen } from "../../app/context";
import { readPref, writePref } from "../../app/prefs";
import { exportBackup, exportCsv } from "../../app/transfer";
import { applyUpdate, onUpdateReady } from "../../app/updates";
import { applyTheme } from "../../app/theme";
import { screenEl } from "../shared/util";
import { startRestore } from "./restore";

/** Currencies with two decimal places (the cents model assumes two). */
export const CURRENCIES = [
  { code: "EUR", label: "Euro (€)" },
  { code: "USD", label: "US dollar ($)" },
  { code: "GBP", label: "Pound sterling (£)" },
  { code: "CHF", label: "Swiss franc" },
  { code: "CAD", label: "Canadian dollar" },
  { code: "AUD", label: "Australian dollar" },
  { code: "SEK", label: "Swedish krona" },
  { code: "PLN", label: "Polish złoty" },
] as const;

const when = (ms: number): string => new Intl.DateTimeFormat(DATE_LOCALE, { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" }).format(new Date(ms));

export function createSettingsScreen(ctx: AppContext): Screen {
  const el = screenEl("settings");
  let updateReady = false;
  let persisted: boolean | null = null;

  const button = (label: string, onClick: () => void | Promise<void>, kind = "", id?: string): HTMLButtonElement => {
    const b = h("button", { type: "button", class: `btn btn-block ${kind}`.trim(), id: id ?? null }, label);
    b.addEventListener("click", async () => {
      b.disabled = true;
      try {
        await onClick();
      } finally {
        b.disabled = false;
      }
    });
    return b;
  };

  const render = (): void => {
    const { data } = ctx.view();
    const s = data.settings;
    const device = ctx.device;

    // Phone and PC
    const lastMoved = s.lastImport ? `Last moved: from ${s.lastImport.fromDeviceName}, ${when(s.lastImport.importedAt)}` : "Not moved yet";
    const phoneAndPc = h(
      "section",
      { class: "card", id: "settings-devices" },
      sectionTitle("Phone and PC"),
      h("p", { class: "sheet-text" }, `This device: ${s.deviceName}. Each device keeps its own data. Use one at a time, and send your data across when you switch.`),
      button("Send to my other device", () => openSendSheet(ctx), "btn-primary", "send-device"),
      button("Open from my other device", () => startRestore(ctx, "device"), "", "open-device"),
      h("p", { class: "hero-note", id: "last-moved" }, lastMoved),
    );

    // Backup
    const backup = h(
      "section",
      { class: "card", id: "settings-backup" },
      sectionTitle("Backup"),
      h("p", { class: "sheet-text" }, "Your data lives only on this device. A backup file is the only way to get it back if the browser clears it or you lose the phone."),
      button("Back up now", () => void exportBackup(ctx), "", "backup-now"),
      button("Restore from backup", () => startRestore(ctx, "backup"), "", "restore-backup"),
      h("p", { class: "hero-note", id: "last-backup" }, `Last backup: ${s.lastBackupAt ? when(s.lastBackupAt) : "Never"}`),
    );

    const spreadsheet = h(
      "section",
      { class: "card" },
      sectionTitle("Spreadsheet"),
      h("p", { class: "sheet-text" }, "All your entries as a CSV file for Excel or Google Sheets. It isn't a backup and can't be restored."),
      button("Export transactions as CSV", () => exportCsv(ctx), "", "export-csv"),
    );

    // Preferences
    const currency = h("select", { id: "currency", class: "select" }, ...CURRENCIES.map((c) => h("option", { value: c.code, selected: c.code === s.currency }, c.label)));
    currency.addEventListener("change", () => void ctx.write(() => ctx.ledger.updateSettings({ currency: currency.value }), { success: "Currency changed" }));
    const theme = createChips({
      label: "Theme",
      className: "seg seg-3",
      options: [
        { value: "system", label: "System" },
        { value: "light", label: "Light" },
        { value: "dark", label: "Dark" },
      ],
      value: s.theme,
      onChange: (v) => {
        applyTheme(v as Theme);
        void ctx.write(() => ctx.ledger.updateSettings({ theme: v as Theme }));
      },
    });
    const prefs = h(
      "section",
      { class: "card" },
      sectionTitle("Preferences"),
      h("div", { class: "field" }, h("label", { class: "field-label", for: "currency" }, "Currency"), currency),
      h("div", { class: "field" }, h("span", { class: "field-label" }, "Theme"), theme.el),
    );

    // Storage
    const storage = h(
      "section",
      { class: "card", id: "settings-storage" },
      sectionTitle("Storage"),
      h(
        "dl",
        { class: "facts" },
        h("dt", {}, "Protected storage"),
        h("dd", {}, persisted === null ? "Checking…" : persisted ? "Yes. The browser won't clear it to free space." : "No. The browser may clear it when space runs low."),
        h("dt", {}, "Installed"),
        h("dd", {}, device.isStandalone ? "Yes, opened as an app" : "No, opened in the browser"),
        h("dt", {}, "Last backup"),
        h("dd", {}, s.lastBackupAt ? when(s.lastBackupAt) : "Never"),
      ),
      h(
        "p",
        { class: "sheet-text" },
        device.isIOS
          ? "On iPhone, Safari can delete the data of web apps you haven't opened for a while. The installed app is treated better, but nothing is guaranteed, so back up regularly."
          : "Clearing this browser's site data deletes your entries. Back up regularly.",
      ),
    );

    // Updates
    const updates = updateReady
      ? h("section", { class: "card", id: "settings-update" }, sectionTitle("Update ready"), h("p", { class: "sheet-text" }, "A new version of Pocket Ledger is ready. Your data stays as it is."), button("Reload now", () => applyUpdate(), "btn-primary"))
      : null;

    // Install
    const hideInstall = readPref("hide-install") === "1" && !device.isIOS;
    const install =
      device.isStandalone || hideInstall
        ? null
        : h(
            "section",
            { class: "card", id: "settings-install" },
            sectionTitle("Install the app"),
            device.isIOS
              ? h("ol", { class: "steps" }, h("li", {}, "In Safari, tap the Share button."), h("li", {}, "Choose Add to Home Screen."), h("li", {}, "Open Pocket Ledger from your home screen."))
              : h(
                  "ul",
                  { class: "steps" },
                  h("li", {}, "PC: in Chrome or Edge, click the install button in the address bar. The app opens in its own window and works offline."),
                  h("li", {}, "Android: in Chrome, open the menu and choose Install app."),
                  h("li", {}, "Mac Safari: File → Add to Dock. Its data is separate from Safari's, so pick one way to open the app and stick to it."),
                ),
            device.isIOS ? null : h("button", { type: "button", class: "link-btn", onclick: () => (writePref("hide-install", "1"), render()) }, "Hide"),
          );

    const danger = h(
      "section",
      { class: "card" },
      sectionTitle("Delete all data"),
      h("p", { class: "sheet-text" }, "Deletes every entry, goal and budget on this device."),
      button("Delete all data", () => openDeleteAll(ctx), "btn-danger", "delete-all"),
    );

    replaceChildren(el, updates, phoneAndPc, backup, spreadsheet, prefs, storage, install, danger);
  };

  onUpdateReady((ready) => {
    updateReady = ready;
    if (el.isConnected) render();
  });
  void (async () => {
    try {
      persisted = (await navigator.storage?.persisted?.()) ?? false;
    } catch {
      persisted = false;
    }
    if (el.isConnected) render();
  })();

  return { el, update: render };
}

function openSendSheet(ctx: AppContext): void {
  const send = h("button", { type: "button", class: "btn btn-primary btn-block", id: "send-confirm" }, "Send");
  const sheet = openSheet({
    title: "Send to my other device",
    content: [
      h("p", { class: "sheet-text" }, "Save it somewhere your other device can open: iCloud Drive, Google Drive or OneDrive, or email it to yourself."),
      h("p", { class: "sheet-text" }, "Then, on the other device, open Settings and choose Open from my other device."),
      send,
    ],
  });
  send.addEventListener("click", async () => {
    send.disabled = true;
    if (await exportBackup(ctx)) sheet.close();
    else send.disabled = false;
  });
}

function openDeleteAll(ctx: AppContext): void {
  const input = h("input", { id: "delete-confirm-text", class: "input", type: "text", autocomplete: "off", autocapitalize: "characters", spellcheck: "false" });
  const go = h("button", { type: "button", class: "btn btn-danger btn-block", disabled: true, id: "delete-confirm" }, "Delete everything");
  input.addEventListener("input", () => (go.disabled = input.value.trim() !== "DELETE"));
  const sheet = openSheet({
    title: "Delete all data?",
    content: [
      h("p", { class: "sheet-text" }, "Every entry, goal and budget on this device will be deleted. This can't be undone. Back up first if you might want them back."),
      h("div", { class: "field" }, h("label", { class: "field-label", for: "delete-confirm-text" }, "Type DELETE to confirm"), input),
      go,
    ],
  });
  go.addEventListener("click", async () => {
    go.disabled = true;
    try {
      await ctx.ledger.deleteAllData();
      sheet.close();
      ctx.toast.show("All data deleted");
      ctx.shell.setTab("net");
    } catch {
      go.disabled = false;
      ctx.toast.show("Couldn't delete your data. Try again.", { kind: "error" });
    }
  });
}
