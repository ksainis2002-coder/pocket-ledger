// Net tab (SPEC Screens 1): net this month, three stats, 6-month chart, all-time figures.
import { netChart } from "../../components/chart";
import { emptyState, hero, sectionTitle } from "../../components/display";
import { h, replaceChildren } from "../../components/dom";
import { lastMonths } from "../../domain/months";
import { allTimeTotals, monthTotals } from "../../domain/totals";
import { moneyFor, type AppContext, type Screen } from "../../app/context";
import { capitalize, monthPhrase, screenEl } from "../shared/util";

export function createNetScreen(ctx: AppContext): Screen {
  const el = screenEl("net");
  return {
    el,
    update(view) {
      const { data, month, today } = view;
      const money = moneyFor(data, ctx.locale);
      if (data.transactions.length === 0 && data.goals.length === 0) {
        replaceChildren(
          el,
          emptyState(
            "Nothing to show yet",
            "Your net for each month will show here: income, minus expenses, minus what you move to savings. Start by adding your salary in Income.",
          ),
        );
        return;
      }
      const t = monthTotals(data.transactions, month);
      const phrase = monthPhrase(month, today, ctx.locale);
      const stat = (label: string, value: number, tone?: string) =>
        h("div", { class: "stat" }, h("p", { class: "label" }, label), h("p", { class: `stat-value num${tone ? ` ${tone}` : ""}` }, money(value)));

      const months = lastMonths(month, 6).map((m) => {
        const mt = monthTotals(data.transactions, m);
        const label = new Intl.DateTimeFormat(ctx.locale, { month: "short" }).format(new Date(Number(m.slice(0, 4)), Number(m.slice(5, 7)) - 1, 1));
        return { label, income: mt.income, expenses: mt.expenses, netToSavings: mt.netToSavings };
      });
      const all = allTimeTotals(data.transactions, data.goals);

      replaceChildren(
        el,
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
