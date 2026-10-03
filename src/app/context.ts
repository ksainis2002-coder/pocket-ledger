// What every screen gets: the ledger, the current view of the data, and helpers for
// running writes (errors, toasts, Undo) the same way everywhere.
import type { Toaster } from "../components/toast";
import { InputError, QuotaError, RuleError } from "../db/errors";
import type { Ledger, WriteResult } from "../db/ledger";
import { formatMoney } from "../domain/money";
import type { DateStr, MonthKey } from "../domain/months";
import type { LedgerData } from "../domain/types";
import type { NavReason, Shell } from "./shell";
import type { TodayClock } from "./today";

export interface View {
  data: LedgerData;
  month: MonthKey;
  today: DateStr;
}

export interface Screen {
  el: HTMLElement;
  /** Called with fresh data or a new month. Must not clear what someone is typing. */
  update(view: View): void;
  /** Called when the tab becomes visible. */
  shown?(reason: NavReason): void;
}

export interface AppContext {
  ledger: Ledger;
  toast: Toaster;
  shell: Shell;
  clock: TodayClock;
  view(): View;
  money(cents: number): string;
  locale: string | undefined;
  /** What kind of device this is, for install advice and the iPhone first-run line. */
  device: { isIOS: boolean; isStandalone: boolean };
  /**
   * Run a write. On success, shows its Undo toast (or `success`). Invalid input and rule refusals go to
   * `inline` when given (so a form can show them and keep its values), else to a toast. Storage
   * failures always toast. Returns true when the write was saved.
   */
  write(action: () => Promise<WriteResult>, opts?: { inline?: (message: string) => void; success?: string }): Promise<boolean>;
}

export function moneyFor(data: LedgerData, locale?: string): (cents: number) => string {
  return (cents) => formatMoney(cents, data.settings.currency, locale ?? data.settings.locale);
}

export function makeWrite(ledger: Ledger, toast: Toaster): AppContext["write"] {
  const undoWith = (token: NonNullable<WriteResult["undo"]>) => async () => {
    try {
      await ledger.undo(token);
    } catch (e) {
      toast.show((e as Error).message, { kind: "error" });
    }
  };
  return async (action, opts = {}) => {
    try {
      const result = await action();
      if (result.undo) toast.show(result.undo.label, { undo: undoWith(result.undo) });
      else if (opts.success) toast.show(opts.success);
      return true;
    } catch (e) {
      const message = (e as Error).message || "Couldn't save. Your entry is still in the form.";
      if ((e instanceof InputError || e instanceof RuleError) && opts.inline) opts.inline(message);
      else toast.show(e instanceof QuotaError || e instanceof InputError || e instanceof RuleError ? message : "Couldn't save. Your entry is still in the form.", { kind: "error" });
      return false;
    }
  };
}
