import { h, replaceChildren } from "../components/dom";
import { icon } from "../components/icons";
import { monthLabel } from "../domain/months";
import { renderEmptyTab } from "../features/empty";
import {
  TABS,
  canGoNext,
  initialNav,
  nextMonth,
  onDayChange,
  prevMonth,
  selectTab,
  showsMonthPicker,
  tabInfo,
  type NavState,
  type TabId,
} from "./navigation";
import { BASE_PATH } from "./env";
import { readPref, writePref } from "./prefs";
import type { TodayClock } from "./today";

/** Mounts the app shell: header with tab title and month picker, content area, and the section menu (bottom bar on phones, side menu on PCs). */
export function mountShell(root: HTMLElement, clock: TodayClock): void {
  let state: NavState = initialNav(readPref("tab"), clock.get());

  const title = h("h1", { class: "title", id: "page-title" });
  const monthText = h("span", { class: "picker-label", "aria-live": "polite" });
  const prev = h("button", { class: "picker-btn", type: "button", "aria-label": "Previous month" }, icon("prev"));
  const next = h("button", { class: "picker-btn", type: "button", "aria-label": "Next month" }, icon("next"));
  const picker = h("div", { class: "picker", role: "group", "aria-label": "Month" }, prev, monthText, next);
  const header = h("header", { class: "topbar" }, h("div", { class: "topbar-inner" }, title, picker));

  const main = h("main", { class: "content", id: "content", role: "tabpanel", tabindex: -1 });

  const tabButtons = TABS.map((t) =>
    h(
      "button",
      { class: "tab", type: "button", role: "tab", id: `tab-${t.id}`, "data-tab": t.id, "aria-controls": "content" },
      icon(t.id),
      h("span", { class: "tab-label" }, t.label),
    ),
  );
  // Shown only in the PC side menu (900px and wider).
  const brand = h(
    "div",
    { class: "brand" },
    h("img", { class: "brand-mark", src: BASE_PATH + "icons/icon.svg", alt: "", width: 28, height: 28 }),
    h("span", { class: "brand-name" }, "Pocket Ledger"),
  );
  const tabbar = h(
    "nav",
    { class: "tabbar", "aria-label": "Sections" },
    brand,
    h("div", { class: "tabbar-inner", role: "tablist", "aria-orientation": "horizontal" }, ...tabButtons),
  );
  const tablist = tabbar.querySelector('[role="tablist"]');
  const wide = window.matchMedia("(min-width: 900px)");
  const syncOrientation = (): void => tablist?.setAttribute("aria-orientation", wide.matches ? "vertical" : "horizontal");
  syncOrientation();
  wide.addEventListener("change", syncOrientation);

  replaceChildren(root, h("div", { class: "app" }, header, main, tabbar));

  let renderedTab: TabId | null = null;

  const render = (): void => {
    const info = tabInfo(state.tab);
    title.textContent = info.title;
    document.title = `${info.title} · Pocket Ledger`;

    picker.hidden = !showsMonthPicker(state.tab);
    monthText.textContent = monthLabel(state.month);
    next.disabled = !canGoNext(state, clock.get());

    for (const btn of tabButtons) {
      const selected = btn.dataset["tab"] === state.tab;
      btn.setAttribute("aria-selected", String(selected));
      btn.tabIndex = selected ? 0 : -1;
    }
    main.setAttribute("aria-labelledby", `tab-${state.tab}`);

    if (renderedTab !== state.tab) {
      replaceChildren(main, renderEmptyTab(state.tab));
      renderedTab = state.tab;
      window.scrollTo(0, 0);
    }
  };

  const update = (nextState: NavState): void => {
    if (nextState === state) return;
    const tabChanged = nextState.tab !== state.tab;
    state = nextState;
    if (tabChanged) writePref("tab", state.tab);
    render();
  };

  prev.addEventListener("click", () => update(prevMonth(state)));
  next.addEventListener("click", () => update(nextMonth(state, clock.get())));

  for (const btn of tabButtons) {
    btn.addEventListener("click", () => update(selectTab(state, btn.dataset["tab"] as TabId)));
    btn.addEventListener("keydown", (e) => {
      const i = tabButtons.indexOf(btn);
      const target =
        e.key === "ArrowRight" || e.key === "ArrowDown" ? tabButtons[(i + 1) % tabButtons.length]
        : e.key === "ArrowLeft" || e.key === "ArrowUp" ? tabButtons[(i - 1 + tabButtons.length) % tabButtons.length]
        : e.key === "Home" ? tabButtons[0]
        : e.key === "End" ? tabButtons[tabButtons.length - 1]
        : undefined;
      if (!target) return;
      e.preventDefault();
      target.focus();
      update(selectTab(state, target.dataset["tab"] as TabId));
    });
  }

  clock.subscribe((today, previous) => {
    const moved = onDayChange(state, previous, today);
    if (moved !== state) update(moved);
    else render(); // the "next month" limit may have changed
  });

  render();
}
