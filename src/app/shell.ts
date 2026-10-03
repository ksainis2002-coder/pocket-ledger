import { replaceChildren, h } from "../components/dom";
import { icon } from "../components/icons";
import { monthLabel, type MonthKey } from "../domain/months";
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

export type NavReason = "init" | "tab" | "month" | "day" | "program";

export interface Shell {
  nav(): NavState;
  /** Switch tab from code (e.g. the "Add expense" shortcut). */
  setTab(tab: TabId): void;
  /** Jump to a month, never past the current one. */
  setMonth(month: MonthKey): void;
  /** Where screens are mounted. */
  content: HTMLElement;
  /** Above the content: banners such as "Not installed". */
  banner: HTMLElement;
}

/**
 * Mounts the app shell: header with tab title and month picker, the content area, and the section menu
 * (bottom bar on phones, side menu on PCs). `onNav` runs after every navigation, with what caused it.
 */
export function mountShell(root: HTMLElement, clock: TodayClock, onNav: (state: NavState, reason: NavReason) => void, initialTab?: TabId): Shell {
  let state: NavState = initialNav(initialTab ?? readPref("tab"), clock.get());

  const title = h("h1", { class: "title", id: "page-title" });
  const monthText = h("span", { class: "picker-label", "aria-live": "polite" });
  const prev = h("button", { class: "picker-btn", type: "button", "aria-label": "Previous month" }, icon("prev"));
  const next = h("button", { class: "picker-btn", type: "button", "aria-label": "Next month" }, icon("next"));
  const picker = h("div", { class: "picker", role: "group", "aria-label": "Month" }, prev, monthText, next);
  const header = h("header", { class: "topbar" }, h("div", { class: "topbar-inner" }, title, picker));

  const banner = h("div", { class: "banner-slot" });
  const content = h("div", { class: "screens" });
  const main = h("main", { class: "content", id: "content", role: "tabpanel", tabindex: -1 }, banner, content);

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
  const tablist = h("div", { class: "tabbar-inner", role: "tablist", "aria-orientation": "horizontal" }, ...tabButtons);
  const tabbar = h("nav", { class: "tabbar", "aria-label": "Sections" }, brand, tablist);
  const wide = window.matchMedia("(min-width: 900px)");
  const syncOrientation = (): void => tablist.setAttribute("aria-orientation", wide.matches ? "vertical" : "horizontal");
  syncOrientation();
  wide.addEventListener("change", syncOrientation);

  replaceChildren(root, h("div", { class: "app" }, header, main, tabbar));

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
  };

  const update = (nextState: NavState, reason: NavReason): void => {
    const tabChanged = nextState.tab !== state.tab;
    const changed = nextState !== state;
    state = nextState;
    if (tabChanged) {
      writePref("tab", state.tab);
      window.scrollTo(0, 0);
    }
    render();
    if (changed || reason === "init") onNav(state, reason);
  };

  prev.addEventListener("click", () => update(prevMonth(state), "month"));
  next.addEventListener("click", () => update(nextMonth(state, clock.get()), "month"));

  for (const btn of tabButtons) {
    btn.addEventListener("click", () => update(selectTab(state, btn.dataset["tab"] as TabId), "tab"));
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
      update(selectTab(state, target.dataset["tab"] as TabId), "program");
    });
  }

  clock.subscribe((today, previous) => {
    const moved = onDayChange(state, previous, today);
    if (moved !== state) update(moved, "day");
    else {
      render(); // the "next month" limit may have changed
      onNav(state, "day");
    }
  });

  render();
  queueMicrotask(() => update(state, "init"));

  return {
    nav: () => state,
    setTab: (tab) => update(selectTab(state, tab), "program"),
    setMonth: (month) => {
      const today = clock.get();
      const limit = today.slice(0, 7);
      const m = month > limit ? limit : month;
      if (m !== state.month) update({ ...state, month: m }, "program");
    },
    content,
    banner,
  };
}
