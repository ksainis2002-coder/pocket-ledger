// The app once data is open: shell, screens, toasts, and keeping screens in step with the data.
import { createToaster } from "../components/toast";
import type { Ledger } from "../db/ledger";
import { createExpensesScreen } from "../features/expenses/expenses";
import { createGoalsScreen } from "../features/goals/goals";
import { createIncomeScreen } from "../features/income/income";
import { createNetScreen } from "../features/net/net";
import { createSavingsScreen } from "../features/savings/savings";
import { createSettingsScreen } from "../features/settings/settings";
import type { LedgerData } from "../domain/types";
import { makeWrite, moneyFor, type AppContext, type Screen, type View } from "./context";
import type { ViewId } from "./navigation";
import { applyTheme } from "./theme";
import { mountShell, type NavReason, type Shell } from "./shell";
import type { TodayClock } from "./today";

const FACTORIES: Record<ViewId, (ctx: AppContext) => Screen> = {
  settings: createSettingsScreen,
  net: createNetScreen,
  income: createIncomeScreen,
  expenses: createExpensesScreen,
  savings: createSavingsScreen,
  goals: createGoalsScreen,
};

export interface StartOptions {
  /** A banner above every screen (e.g. "Not installed"). */
  banner?: HTMLElement;
  /** Opened from the "Add expense" shortcut. */
  addExpense?: boolean;
  device?: { isIOS: boolean; isStandalone: boolean };
}

export async function startApp(root: HTMLElement, clock: TodayClock, ledger: Ledger, opts: StartOptions = {}): Promise<void> {
  let data: LedgerData = await ledger.read();
  const toast = createToaster();
  const screens = new Map<ViewId, Screen>();
  applyTheme(data.settings.theme);
  let shell: Shell | null = null;

  const view = (): View => ({ data, month: shell?.nav().month ?? clock.get().slice(0, 7), today: clock.get() });
  const ctx: AppContext = {
    ledger,
    toast,
    get shell(): Shell {
      if (!shell) throw new Error("The shell isn't mounted yet");
      return shell;
    },
    clock,
    view,
    money: (cents) => moneyFor(data)(cents),
    locale: undefined,
    device: opts.device ?? { isIOS: false, isStandalone: false },
    write: makeWrite(ledger, toast),
  };

  const show = (tab: ViewId, reason: NavReason): void => {
    let screen = screens.get(tab);
    if (!screen) {
      screen = FACTORIES[tab](ctx);
      screens.set(tab, screen);
      shell?.content.append(screen.el);
    }
    for (const [t, s] of screens) s.el.hidden = t !== tab;
    screen.update(view());
    screen.shown?.(reason);
  };

  shell = mountShell(root, clock, (state, reason) => show(state.tab, reason), opts.addExpense ? "expenses" : undefined);
  if (opts.banner) shell.banner.append(opts.banner);

  if (opts.addExpense) {
    // SPEC Fast entry: the shortcut opens Expenses on the current month with the amount focused.
    queueMicrotask(() => {
      screens.get("expenses")?.shown?.("program");
      history.replaceState(null, "", location.pathname);
    });
  }

  // Fresh data after every committed write: the visible screen updates now, the others when shown.
  ledger.onChange(async () => {
    try {
      data = await ledger.read();
    } catch {
      toast.show("Couldn't read your data. Reload the app.", { kind: "error" });
      return;
    }
    applyTheme(data.settings.theme);
    if (shell) screens.get(shell.nav().tab)?.update(view());
  });
}
