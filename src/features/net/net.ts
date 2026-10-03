// Net tab (SPEC Screens 1): net this month, three stats, 6-month chart, all-time figures.
import { netChart } from "../../components/chart";
import { emptyState, hero, sectionTitle } from "../../components/display";
import { h, replaceChildren } from "../../components/dom";
import { DATE_LOCALE, lastMonths } from "../../domain/months";
import { allTimeTotals, monthTotals } from "../../domain/totals";
import { moneyFor, type AppContext, type Screen } from "../../app/context";
import { exportBackup } from "../../app/transfer";
import { SNOOZE_MS, backupReminder, reminderText } from "../../domain/backup";
import type { LedgerData } from "../../domain/types";
import { capitalize, monthPhrase, screenEl } from "../shared/util";

export function createNetScreen(ctx: AppContext): Screen {
  const el = screenEl("net");
  return {
    el,
    update(view) {
      const { data, month, today } = view;
      const money = moneyFor(data, ctx.locale);
      if (data.transactions.length === 0 && data.goals.length === 0) {
        const empty = emptyState(
          "Nothing to show yet",
          "Your net for each month will show here: income, minus expenses, minus what you move to savings. Start by adding your salary in Income.",
        );
        // SPEC Install gate: a fresh install on iPhone may have data stranded in Safari.
        if (ctx.device.isIOS && ctx.device.isStandalone) {
          empty.append(
            h("p", { class: "empty-body" }, "Used Pocket Ledger in Safari before? Export a backup there, then import it here in Settings."),
            h("button", { type: "button", class: "link-btn", onclick: () => ctx.shell.setTab("settings") }, "Open Settings"),
          );
        }
        replaceChildren(el, empty);
        return;
      }
      const t = monthTotals(data.transactions, month);
      const phrase = monthPhrase(month, today, ctx.locale);
      const stat = (label: string, value: number, tone?: string) =>
        h("div", { class: "stat" }, h("p", { class: "label" }, label), h("p", { class: `stat-value num${tone ? ` ${tone}` : ""}` }, money(value)));

      const months = lastMonths(month, 6).map((m) => {
        const mt = monthTotals(data.transactions, m);
        const label = new Intl.DateTimeFormat(DATE_LOCALE, { month: "short" }).format(new Date(Number(m.slice(0, 4)), Number(m.slice(5, 7)) - 1, 1));
        return { label, income: mt.income, expenses: mt.expenses, netToSavings: mt.netToSavings };
      });
      const all = allTimeTotals(data.transactions, data.goals);

      replaceChildren(
        el,
        reminderBanner(ctx, data),
        hero(`Net ${phrase}`, money(t.net), {
          ...(t.net < 0 ? { tone: "bad" as const } : {}),
          note: "Income, minus expenses, minus what you moved to savings.",
          id: "net-hero",
        }),
        h(
          "div",
          { class: "stats", id: "net-stats" },
          stat("Income", t.income, "tone-text-income"),
          stat("Expenses", t.expenses),
          stat("Net to savings", t.netToSavings, "tone-text-save"),
        ),
        h("section", { class: "card" }, sectionTitle("Last 6 months"), netChart(months, money)),
        h(
          "section",
          { class: "card" },
          sectionTitle("All time"),
          h(
            "div",
            { class: "stats" },
            stat("Total earned", all.earned),
            stat("Total spent", all.spent),
            stat("Savings balance", all.savingsBalance, "tone-text-save"),
          ),
        ),
      );
      el.setAttribute("aria-label", capitalize(`net ${phrase}`));
    },
  };
}

/** SPEC Backup Reminder: a banner at the top of Net with "Back up now" and "Later" (snooze 7 days). */
function reminderBanner(ctx: AppContext, data: LedgerData): HTMLElement | null {
  const now = Date.now();
  const last = data.settings.lastBackupAt;
  const changed = last === undefined ? data.transactions.length : data.transactions.filter((t) => t.updatedAt > last).length;
  const r = backupReminder(now, data.settings, changed, data.transactions.length);
  if (!r.due) return null;
  const later = h("button", { type: "button", class: "link-btn" }, "Later");
  later.addEventListener("click", () => void ctx.write(() => ctx.ledger.updateSettings({ backupSnoozedUntil: Date.now() + SNOOZE_MS })));
  const now_ = h("button", { type: "button", class: "btn btn-small btn-primary" }, "Back up now");
  now_.addEventListener("click", async () => {
    now_.disabled = true;
    await exportBackup(ctx);
    now_.disabled = false;
  });
  return h("div", { class: "banner reminder", role: "note", id: "backup-reminder" }, h("p", { class: "banner-text" }, reminderText(r)), h("div", { class: "banner-actions" }, later, now_));
}
