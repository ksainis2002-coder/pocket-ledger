// Income tab (SPEC Screens 2): quick add form, income this month, bars per source, entries.
import { barRow, hero, sectionTitle } from "../../components/display";
import { h, replaceChildren } from "../../components/dom";
import { entryList } from "../../components/entry-list";
import { categoryTotals, inMonth, monthTotals } from "../../domain/totals";
import { moneyFor, type AppContext, type Screen } from "../../app/context";
import { createEntryForm } from "../shared/entry-form";
import { openEntrySheet } from "../shared/entry-sheet";
import { capitalize, monthPhrase, screenEl } from "../shared/util";

export function createIncomeScreen(ctx: AppContext): Screen {
  const el = screenEl("income");
  const form = createEntryForm("income", ctx);
  const summary = h("div", { class: "stack" });
  el.append(form.el, summary);

  return {
    el,
    update(view) {
      form.update(view);
      const { data, month, today } = view;
      const money = moneyFor(data, ctx.locale);
      const total = monthTotals(data.transactions, month).income;
      const bySource = categoryTotals(data.transactions, month, "income");
      const max = bySource[0]?.cents ?? 1;
      const entries = data.transactions.filter((t) => t.kind === "income" && inMonth(t, month));
      const phrase = monthPhrase(month, today, ctx.locale);
      replaceChildren(
        summary,
        hero(capitalize(`income ${phrase}`), money(total), { tone: "income" }),
        bySource.length
          ? h("section", { class: "card" }, sectionTitle("By source"), h("div", { class: "bars" }, ...bySource.map((s) => barRow({ label: s.category, value: money(s.cents), fraction: s.cents / max, tone: "income" }))))
          : null,
        h(
          "section",
          { class: "card" },
          sectionTitle("Entries"),
          entryList({
            entries,
            goals: data.goals,
            today,
            money,
            locale: ctx.locale,
            onOpen: (t) => openEntrySheet(t, ctx),
            empty: `No income ${phrase} yet. Add your salary, a bonus or a gift above.`,
          }),
        ),
      );
    },
  };
}
