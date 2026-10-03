// Restore from a backup, or open data from the other device (SPEC Backup Import, Phone and PC):
// pick a file, show what it holds and what would be lost, then replace everything.
import { h, replaceChildren } from "../../components/dom";
import { openSheet } from "../../components/sheet";
import { restorePreview, type BackupFile } from "../../domain/backup";
import { DATE_LOCALE, parseDate } from "../../domain/months";
import { moneyFor, type AppContext } from "../../app/context";
import { copyText, exportBackup, pickBackup } from "../../app/transfer";

function dayLabel(date: string): string {
  const d = parseDate(date);
  return d ? new Intl.DateTimeFormat(DATE_LOCALE, { day: "numeric", month: "short", year: "numeric" }).format(new Date(d.year, d.month - 1, d.day)) : date;
}

const plural = (n: number, one: string, many = `${one}s`): string => `${n} ${n === 1 ? one : many}`;

export async function startRestore(ctx: AppContext, mode: "backup" | "device"): Promise<void> {
  const file = await pickBackup(ctx.toast);
  if (file) openPreview(ctx, file, mode);
}

function openPreview(ctx: AppContext, file: BackupFile, mode: "backup" | "device"): void {
  const body = h("div", { class: "stack restore" });
  const sheet = openSheet({ title: mode === "device" ? "Open from my other device" : "Restore from backup", content: [body] });

  const render = (): void => {
    const { data } = ctx.view();
    const money = moneyFor(data, ctx.locale);
    const p = restorePreview(data, file, Date.now(), money, ctx.locale);
    const unsafe = !p.safety.safe;
    const summary = [plural(p.counts.transactions, "entry", "entries"), plural(p.counts.goals, "goal"), plural(p.counts.budgets, "budget")].join(" · ");

    const copyHost = h("div", {});
    const lossBlock =
      unsafe && p.loss
        ? h(
            "section",
            { class: "loss", "aria-label": "What would be lost" },
            h("p", { class: "loss-title" }, "Only on this device:"),
            p.loss.shown.length
              ? h("ul", { class: "loss-list" }, ...p.loss.shown.map((line) => h("li", { class: "num" }, line)), p.loss.more > 0 ? h("li", { class: "loss-more" }, `and ${p.loss.more} more`) : null)
              : null,
            p.loss.deleted > 0 ? h("p", { class: "loss-extra" }, plural(p.loss.deleted, "deleted entry", "deleted entries")) : null,
            p.loss.goalBudgetChanges > 0 ? h("p", { class: "loss-extra" }, plural(p.loss.goalBudgetChanges, "goal or budget change")) : null,
            p.loss.copyText
              ? h(
                  "div",
                  { class: "stack" },
                  h("p", { class: "sheet-text" }, "To keep both, restore, then re-enter these from the copied list."),
                  h(
                    "button",
                    {
                      type: "button",
                      class: "btn btn-block",
                      onclick: async () => {
                        if (await copyText(p.loss?.copyText ?? "", copyHost)) ctx.toast.show("List copied");
                      },
                    },
                    "Copy list",
                  ),
                  copyHost,
                )
              : null,
          )
        : null;

    const older = p.older
      ? h(
          "p",
          { class: "sheet-text warn-text" },
          `This backup is older than the data on this ${data.settings.deviceName}. ${plural(p.older.count, "entry", "entries")} added or changed since ${new Intl.DateTimeFormat(DATE_LOCALE, { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }).format(new Date(p.older.since))} will be lost.`,
        )
      : null;

    const saveCopy = h("button", { type: "button", class: "btn btn-block" }, "Save a copy first");
    saveCopy.addEventListener("click", async () => {
      saveCopy.disabled = true;
      if (await exportBackup(ctx)) render();
      else saveCopy.disabled = false;
    });

    const confirm = h("button", { type: "button", class: `btn btn-block ${unsafe ? "btn-danger" : "btn-primary"}`, id: "restore-confirm" }, unsafe ? "Restore anyway" : "Replace my data");
    confirm.addEventListener("click", async () => {
      confirm.disabled = true;
      try {
        const { repairedGoals } = await ctx.ledger.importBackup(file);
        sheet.close();
        ctx.toast.show(repairedGoals > 0 ? `Backup restored. Fixed saved amounts on ${plural(repairedGoals, "goal")} to match their movements.` : "Backup restored", { ms: 8000 });
      } catch (e) {
        confirm.disabled = false;
        ctx.toast.show((e as Error).message || "Couldn't restore. Your data hasn't changed.", { kind: "error" });
      }
    });

    replaceChildren(
      body,
      h("p", { class: "restore-source" }, `From your ${p.fromDeviceName} · made ${p.madeAgo}`),
      h("p", { class: "sheet-text num" }, summary, p.newestEntryDate ? ` · newest entry ${dayLabel(p.newestEntryDate)}` : ""),
      unsafe && p.warning ? h("p", { class: "banner restore-warning", role: "alert" }, h("span", { class: "banner-text" }, p.warning)) : null,
      lossBlock,
      older,
      h("p", { class: "sheet-text" }, "Restoring replaces every entry, goal and budget on this device."),
      saveCopy,
      confirm,
    );
  };
  render();
}
