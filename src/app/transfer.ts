// Getting files out of and into the app (SPEC Backup, CSV export): the share sheet where there is one
// (iPhone, Android), else a download (PCs); picking a file; copying text.
import { h } from "../components/dom";
import { openSheet } from "../components/sheet";
import type { Toaster } from "../components/toast";
import { backupFileName, csvFileName, readBackupText, type BackupFile } from "../domain/backup";
import { toCsv } from "../domain/csv";
import type { AppContext } from "./context";

export type DeliverResult = "delivered" | "cancelled";

function download(file: File): void {
  const url = URL.createObjectURL(file);
  const a = h("a", { href: url, download: file.name, hidden: true });
  document.body.append(a);
  a.click();
  a.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
}

function canShareFile(file: File): boolean {
  try {
    return typeof navigator.share === "function" && typeof navigator.canShare === "function" && navigator.canShare({ files: [file] });
  } catch {
    return false;
  }
}

/**
 * Hand a file to the owner. With a share sheet: share it; if Safari says the tap was too long ago
 * (NotAllowedError), show "File ready" with a button that shares straight from a fresh tap. Without
 * one: download it. Resolves "cancelled" if the owner closed the share sheet.
 */
export async function deliverFile(file: File, readyTitle = "Backup ready"): Promise<DeliverResult> {
  if (!canShareFile(file)) {
    download(file);
    return "delivered";
  }
  try {
    await navigator.share({ files: [file] });
    return "delivered";
  } catch (e) {
    const name = (e as { name?: string } | null)?.name;
    if (name === "AbortError") return "cancelled";
    if (name !== "NotAllowedError") {
      download(file);
      return "delivered";
    }
  }
  // SPEC Export step 3: share again from a fresh tap.
  return new Promise<DeliverResult>((resolve) => {
    let settled = false;
    const done = (r: DeliverResult): void => {
      if (settled) return;
      settled = true;
      resolve(r);
    };
    const btn = h("button", { type: "button", class: "btn btn-primary btn-block" }, "Share file");
    const sheet = openSheet({ title: readyTitle, content: [h("p", { class: "sheet-text" }, "Your file is ready. Tap to save or send it."), btn], onClose: () => done("cancelled") });
    btn.addEventListener("click", async () => {
      try {
        await navigator.share({ files: [file] });
        done("delivered");
      } catch (e) {
        if ((e as { name?: string } | null)?.name !== "AbortError") {
          download(file);
          done("delivered");
        } else done("cancelled");
      }
      sheet.close();
    });
  });
}

/**
 * Back up everything (SPEC Export). The new state is recorded only once the file is delivered.
 * Returns true when it was delivered.
 */
export async function exportBackup(ctx: AppContext): Promise<boolean> {
  let prepared: Awaited<ReturnType<AppContext["ledger"]["prepareExport"]>>;
  try {
    prepared = await ctx.ledger.prepareExport();
  } catch {
    ctx.toast.show("Couldn't read your data to back it up. Try again.", { kind: "error" });
    return false;
  }
  const file = backupAsFile(prepared.file, ctx.view().today);
  const result = await deliverFile(file);
  if (result !== "delivered") return false;
  return ctx.write(() => ctx.ledger.commitExport(prepared.commit), { success: "Backup saved" });
}

export function backupAsFile(backup: BackupFile, today: string): File {
  return new File([JSON.stringify(backup, null, 1)], backupFileName(today), { type: "application/json" });
}

export async function exportCsv(ctx: AppContext): Promise<void> {
  const { data, today } = ctx.view();
  const file = new File([toCsv(data.transactions, data.goals, ctx.locale)], csvFileName(today), { type: "text/csv" });
  if ((await deliverFile(file, "Spreadsheet ready")) === "delivered") ctx.toast.show("Spreadsheet saved");
}

/**
 * Let the owner pick a file. No `accept` filter: iOS can grey out .json files in the Files picker
 * when one is set; the backup check rejects anything that isn't a backup.
 */
export function pickFile(): Promise<File | null> {
  return new Promise((resolve) => {
    const input = h("input", { type: "file", hidden: true });
    input.addEventListener("change", () => {
      resolve(input.files?.[0] ?? null);
      input.remove();
    });
    input.addEventListener("cancel", () => {
      resolve(null);
      input.remove();
    });
    document.body.append(input);
    input.click();
  });
}

/** Pick a backup file and check it. Shows the first problem as a toast. */
export async function pickBackup(toast: Toaster): Promise<BackupFile | null> {
  const file = await pickFile();
  if (!file) return null;
  let text: string;
  try {
    text = await file.text();
  } catch {
    toast.show("Couldn't read that file. Try picking it again.", { kind: "error", ms: 8000 });
    return null;
  }
  const r = readBackupText(text);
  if (!r.ok) {
    toast.show(r.message, { kind: "error", ms: 8000 });
    return null;
  }
  return r.file;
}

/** Copy text; if the clipboard isn't available, select it in a text box so the owner can copy it. */
export async function copyText(text: string, fallbackHost: HTMLElement): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    const box = h("textarea", { class: "input copy-box", readonly: true, rows: 6, "aria-label": "Copied list" });
    box.value = text;
    fallbackHost.replaceChildren(box);
    box.focus();
    box.select();
    return false;
  }
}
