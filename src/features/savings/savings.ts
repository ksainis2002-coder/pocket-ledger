// Savings tab (SPEC Screens 4): balance, set aside and free, move money in or out, this month's movements.
import { hero, sectionTitle } from "../../components/display";
import { h, replaceChildren } from "../../components/dom";
import { entryList } from "../../components/entry-list";
import { inMonth, monthTotals, savingsPosition } from "../../domain/totals";
import { moneyFor, type AppContext, type Screen } from "../../app/context";
import { createEntryForm } from "../shared/entry-form";
import { openEntrySheet } from "../shared/entry-sheet";
import { monthPhrase, screenEl } from "../shared/util";

export function createSavingsScreen(ctx: AppContext): Screen {
  const el = screenEl("savings");
  const summary = h("div", { class: "stack" });
  const form = createEntryForm("savings", ctx);
  const list = h("div", { class: "stack" });
  el.append(summary, form.el, list);

  return {
    el,
    update(view) {
      form.update(view);
      const { data, month, today } = view;
      const money = moneyFor(data, ctx.locale);
      const pos = savingsPosition(data.transactions, data.goals);
      const t = monthTotals(data.transactions, month);
      const phrase = monthPhrase(month, today, ctx.locale);

      const split =
        pos.free < 0
          ? h(
              "p",
              { class: "banner", role: "note" },
              h("span", { class: "banner-text" }, `Goals add up to ${money(-pos.free)} more than your savings balance.`),
              h("button", { type: "button", class: "link-btn", onclick: () => ctx.shell.setTab("goals") }, "Go to Goals"),
            )
          : h("p", { class: "hero-note", id: "savings-split" }, `${money(pos.setAside)} set aside for goals · ${money(pos.free)} free`);

      replaceChildren(
        summary,
        hero("Savings balance", money(pos.balance), { tone: "save", note: `${money(t.saves)} in and ${money(t.withdrawals)} out ${phrase}.` }),
        split,
      );
      replaceChildren(
        list,
        h(
          "section",
          { class: "card" },
          sectionTitle(`Movements ${phrase}`),
          entryList({
            entries: data.transactions.filter((x) => (x.kind === "save" || x.kind === "withdraw") && inMonth(x, month)),
            goals: data.goals,
            today,
            money,
            locale: ctx.locale,
            onOpen: (x) => openEntrySheet(x, ctx),
            empty: `No money moved ${phrase}.`,
          }),
        ),
      );
    },
  };
}
