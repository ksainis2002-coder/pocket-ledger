// Repositories: every write in the app goes through Ledger (SPEC Behavior rules).
// Each write runs in one transaction: read everything, compute with pure domain functions,
// check the Goals and savings rules, then write. Nothing else is awaited in between.
import { DEFAULT_RECENT_EXPENSE_CATEGORIES, SAVINGS_CATEGORY, bumpRecent, categoriesFor, isExpenseCategory } from "../domain/categories";
import { detectDeviceName } from "../domain/device";
import { computeSaved } from "../domain/goals";
import { AMOUNT_FORMAT_MESSAGE, AMOUNT_TOO_LARGE_MESSAGE, formatMoney } from "../domain/money";
import { isValidDate, type DateStr } from "../domain/months";
import { checkSavingsRules, freeSavingsMessage, violationMessage } from "../domain/rules";
import { savingsPosition } from "../domain/totals";
import {
  DELETE_LOG_MAX,
  GOAL_NAME_MAX,
  MAX_CENTS,
  NOTE_MAX,
  SCHEMA_VERSION,
  type Budget,
  type DeleteRecord,
  type Goal,
  type Kind,
  type LedgerData,
  type Settings,
  type Transaction,
} from "../domain/types";
import { InputError, RuleError } from "./errors";
import { TABLES, type Store } from "./store";

export interface LedgerDeps {
  /** Epoch milliseconds. */
  now(): number;
  /** Today's local date (from the app's today clock). */
  today(): DateStr;
  newId(): string;
  userAgent?: string;
  maxTouchPoints?: number;
  locale?: string;
}

/** What a toast's Undo button hands back. Only the most recent one can be used. */
export interface UndoToken {
  readonly id: string;
  /** Toast text, e.g. "Expense added". */
  readonly label: string;
}

export interface WriteResult {
  undo?: UndoToken;
}

interface State {
  transactions: Map<string, Transaction>;
  goals: Map<string, Goal>;
  budgets: Map<string, Budget>;
  settings: Settings;
}

interface Plan {
  putTransactions?: Transaction[];
  deleteTransactions?: string[];
  putGoals?: Goal[];
  deleteGoals?: string[];
  putBudgets?: Budget[];
  deleteBudgets?: string[];
  settings?: Partial<Settings>;
  /** Counts toward changesSinceSync (default true). */
  counted?: boolean;
  /** Deletes to record in the delete log, for the "what would be lost" list. */
  logDeletes?: DeleteRecord["what"][];
  /** An undo removes the log records its write added. */
  unlogDeletes?: number;
  /** A settings-only write that still counts as a change (currency, locale). */
  countSettings?: boolean;
  /** Toast label; when set, the write can be undone. */
  undoLabel?: string;
}

interface UndoRecord {
  id: string;
  transactions: Map<string, Transaction | null>;
  goals: Map<string, Goal | null>;
  budgets: Map<string, Budget | null>;
  loggedDeletes: number;
}

export interface NewEntry {
  kind: Kind;
  amountCents: number;
  category?: string;
  date: DateStr;
  note?: string;
}

export interface EntryPatch {
  amountCents?: number;
  date?: DateStr;
  category?: string;
  /** A string sets the note; null removes it. */
  note?: string | null;
}

export interface NewGoal {
  name: string;
  targetCents: number;
  openingCents: number;
  dueDate?: DateStr;
}

export interface GoalPatch {
  name?: string;
  targetCents?: number;
  openingCents?: number;
  /** A date sets it; null removes it. */
  dueDate?: DateStr | null;
}

export type SettingsPatch = Partial<Pick<Settings, "currency" | "locale" | "theme" | "backupSnoozedUntil" | "iosBrowserAcknowledged">>;

const ENTRY_LABEL: Record<Kind, string> = { income: "Income", expense: "Expense", save: "Savings", withdraw: "Savings" };

export class Ledger {
  private listeners = new Set<() => void>();
  private lastUndo: UndoRecord | null = null;

  private constructor(
    private readonly store: Store,
    private readonly deps: LedgerDeps,
  ) {}

  /** Opens the ledger and creates this device's settings on first run. */
  static async open(store: Store, deps: LedgerDeps): Promise<Ledger> {
    const ledger = new Ledger(store, deps);
    await store.transact(["settings"], "readwrite", async (tx) => {
      const existing = await tx.get<Settings>("settings", "settings");
      if (!existing) await tx.put("settings", ledger.defaultSettings());
    });
    return ledger;
  }

  private defaultSettings(): Settings {
    return {
      key: "settings",
      currency: "EUR",
      theme: "system",
      deviceId: this.deps.newId(),
      deviceName: detectDeviceName(this.deps.userAgent ?? "", this.deps.maxTouchPoints ?? 0),
      stateLineage: [],
      changesSinceSync: 0,
      deleteLog: [],
      recentExpenseCategories: [...DEFAULT_RECENT_EXPENSE_CATEGORIES],
      schemaVersion: SCHEMA_VERSION,
    };
  }

  /** Subscribe to "data changed". Returns an unsubscribe function. */
  onChange(fn: () => void): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  /** Everything, read in one transaction. */
  read(): Promise<LedgerData> {
    return this.store.transact(TABLES, "readonly", async (tx) => {
      const [transactions, goals, budgets, settings] = await Promise.all([
        tx.getAll<Transaction>("transactions"),
        tx.getAll<Goal>("goals"),
        tx.getAll<Budget>("budgets"),
        tx.get<Settings>("settings", "settings"),
      ]);
      return { transactions, goals, budgets, settings: settings ?? this.defaultSettings() };
    });
  }

  // ---------- Entries ----------

  /** Add income, an expense, or a savings movement from the Savings tab (not linked to a goal). */
  addEntry(input: NewEntry): Promise<WriteResult> {
    return this.change((s) => {
      const kind = input.kind;
      const category = kind === "save" || kind === "withdraw" ? SAVINGS_CATEGORY : (input.category ?? "");
      this.checkCategory(kind, category);
      const amountCents = this.checkAmount(input.amountCents);
      const date = this.checkDate(input.date);
      if (kind === "withdraw") {
        const free = savingsPosition([...s.transactions.values()], [...s.goals.values()]).free;
        if (amountCents > free) throw new RuleError(freeSavingsMessage(free, this.money(s)));
      }
      const now = this.deps.now();
      const t: Transaction = { id: this.deps.newId(), kind, amountCents, category, date, createdAt: now, updatedAt: now };
      const note = this.checkNote(input.note);
      if (note) t.note = note;
      const settings: Partial<Settings> = {};
      if (kind === "expense") settings.recentExpenseCategories = bumpRecent(s.settings.recentExpenseCategories, category);
      if (kind === "income") settings.recentIncomeSource = category;
      const label = kind === "save" ? "Moved into savings" : kind === "withdraw" ? "Taken out of savings" : `${ENTRY_LABEL[kind]} added`;
      return { putTransactions: [t], settings, undoLabel: label };
    });
  }

  /** Edit amount, date, note, or category (income and expenses only). Kind and goal link can't change. */
  editEntry(id: string, patch: EntryPatch): Promise<WriteResult> {
    return this.change((s) => {
      const t = s.transactions.get(id);
      if (!t) throw new InputError("This entry no longer exists.");
      const next: Transaction = { ...t, updatedAt: this.deps.now() };
      if (patch.amountCents !== undefined) next.amountCents = this.checkAmount(patch.amountCents);
      if (patch.date !== undefined) next.date = this.checkDate(patch.date);
      if (patch.category !== undefined && patch.category !== t.category) {
        if (t.kind === "save" || t.kind === "withdraw") throw new InputError("Savings movements don't have a category.");
        this.checkCategory(t.kind, patch.category);
        next.category = patch.category;
      }
      if (patch.note !== undefined) {
        const note = patch.note === null ? undefined : this.checkNote(patch.note);
        if (note) next.note = note;
        else delete next.note;
      }
      return { putTransactions: [next], undoLabel: "Changes saved" };
    });
  }

  deleteEntry(id: string): Promise<WriteResult> {
    return this.change((s) => {
      const t = s.transactions.get(id);
      if (!t) throw new InputError("This entry no longer exists.");
      const label = t.kind === "save" || t.kind === "withdraw" ? "Savings movement deleted" : `${ENTRY_LABEL[t.kind]} deleted`;
      return { deleteTransactions: [id], logDeletes: ["entry"], undoLabel: label };
    });
  }

  // ---------- Goals ----------

  createGoal(input: NewGoal): Promise<WriteResult & { goalId: string }> {
    let goalId = "";
    return this.change(() => {
      const now = this.deps.now();
      const openingCents = this.checkAmount(input.openingCents, { allowZero: true });
      const g: Goal = {
        id: this.deps.newId(),
        name: this.checkGoalName(input.name),
        targetCents: this.checkAmount(input.targetCents),
        openingCents,
        savedCents: openingCents,
        archived: false,
        createdAt: now,
        updatedAt: now,
      };
      if (input.dueDate !== undefined) g.dueDate = this.checkDueDate(input.dueDate);
      goalId = g.id;
      return { putGoals: [g] };
    }).then((r) => ({ ...r, goalId }));
  }

  editGoal(id: string, patch: GoalPatch): Promise<WriteResult> {
    return this.change((s) => {
      const g = this.requireGoal(s, id);
      const next: Goal = { ...g, updatedAt: this.deps.now() };
      if (patch.name !== undefined) next.name = this.checkGoalName(patch.name);
      if (patch.targetCents !== undefined) next.targetCents = this.checkAmount(patch.targetCents);
      if (patch.openingCents !== undefined) next.openingCents = this.checkAmount(patch.openingCents, { allowZero: true });
      if (patch.dueDate === null) delete next.dueDate;
      else if (patch.dueDate !== undefined) next.dueDate = this.checkDueDate(patch.dueDate);
      return { putGoals: [next] };
    });
  }

  /** "Add" on a goal card: a linked save. */
  addToGoal(goalId: string, amountCents: number, date: DateStr = this.deps.today()): Promise<WriteResult> {
    return this.change((s) => {
      const g = this.requireGoal(s, goalId);
      if (g.archived) throw new InputError("This goal is archived. Unarchive it to add money.");
      const amount = this.checkAmount(amountCents);
      const now = this.deps.now();
      const t: Transaction = { id: this.deps.newId(), kind: "save", amountCents: amount, category: SAVINGS_CATEGORY, date: this.checkDate(date), goalId, createdAt: now, updatedAt: now };
      return { putTransactions: [t], undoLabel: `${this.money(s)(amount)} added to ${g.name}` };
    });
  }

  /** "Take out" on a goal card: a linked withdrawal, at most what the goal has. */
  takeFromGoal(goalId: string, amountCents: number, date: DateStr = this.deps.today()): Promise<WriteResult> {
    return this.change((s) => {
      const g = this.requireGoal(s, goalId);
      const amount = this.checkAmount(amountCents);
      if (amount > g.savedCents) throw new RuleError(`This goal only has ${this.money(s)(Math.max(0, g.savedCents))}.`);
      const now = this.deps.now();
      const t: Transaction = { id: this.deps.newId(), kind: "withdraw", amountCents: amount, category: SAVINGS_CATEGORY, date: this.checkDate(date), goalId, createdAt: now, updatedAt: now };
      return { putTransactions: [t], undoLabel: `${this.money(s)(amount)} taken from ${g.name}` };
    });
  }

  /**
   * Archive a goal (SPEC Archiving). "spent": a linked withdrawal for everything saved, dated today.
   * "keep": the money becomes free savings. A goal with nothing saved is archived either way.
   */
  archiveGoal(goalId: string, mode: "spent" | "keep"): Promise<WriteResult> {
    return this.change((s) => {
      const g = this.requireGoal(s, goalId);
      if (g.archived) return { counted: false };
      const now = this.deps.now();
      const plan: Plan = { putGoals: [{ ...g, archived: true, updatedAt: now }] };
      if (mode === "spent" && g.savedCents > 0) {
        const note = `Spent: ${g.name}`.slice(0, NOTE_MAX);
        plan.putTransactions = [
          { id: this.deps.newId(), kind: "withdraw", amountCents: g.savedCents, category: SAVINGS_CATEGORY, date: this.deps.today(), note, goalId, createdAt: now, updatedAt: now },
        ];
      }
      return plan;
    });
  }

  /** Refused (by the savings rules) if free savings can't cover what the goal has saved. */
  unarchiveGoal(goalId: string): Promise<WriteResult> {
    return this.change((s) => {
      const g = this.requireGoal(s, goalId);
      if (!g.archived) return { counted: false };
      return { putGoals: [{ ...g, archived: false, updatedAt: this.deps.now() }] };
    });
  }

  /** SPEC Deleting a goal: keep the movements as general savings, or delete them too. */
  deleteGoal(goalId: string, mode: "keep" | "delete"): Promise<WriteResult> {
    return this.change((s) => {
      this.requireGoal(s, goalId);
      const linked = [...s.transactions.values()].filter((t) => t.goalId === goalId);
      const plan: Plan = { deleteGoals: [goalId], logDeletes: ["goal"] };
      if (mode === "delete") {
        plan.deleteTransactions = linked.map((t) => t.id);
        plan.logDeletes = ["goal", ...linked.map(() => "entry" as const)];
      } else {
        const now = this.deps.now();
        plan.putTransactions = linked.map((t) => {
          const { goalId: _drop, ...rest } = t;
          return { ...rest, updatedAt: now };
        });
      }
      return plan;
    });
  }

  // ---------- Budgets and settings ----------

  setBudget(category: string, limitCents: number): Promise<WriteResult> {
    return this.change(() => {
      if (!isExpenseCategory(category)) throw new InputError("Choose an expense category.");
      return { putBudgets: [{ category, limitCents: this.checkAmount(limitCents), updatedAt: this.deps.now() }] };
    });
  }

  removeBudget(category: string): Promise<WriteResult> {
    return this.change((s) => (s.budgets.has(category) ? { deleteBudgets: [category], logDeletes: ["budget"] } : { counted: false }));
  }

  /**
   * Preferences. Currency and locale travel with the data, so changing them counts as a change;
   * theme, snooze and the install acknowledgement stay on this device and don't.
   */
  updateSettings(patch: SettingsPatch): Promise<WriteResult> {
    return this.change((s) => {
      if (patch.currency !== undefined && !/^[A-Z]{3}$/.test(patch.currency)) throw new InputError("Choose a currency.");
      const traveling = (patch.currency !== undefined && patch.currency !== s.settings.currency) || ("locale" in patch && patch.locale !== s.settings.locale);
      return { settings: patch, counted: traveling, countSettings: traveling };
    });
  }

  // ---------- Undo ----------

  /** Undo the most recent undoable write (SPEC Undo). Refused if a savings rule would break. */
  undo(token: UndoToken): Promise<WriteResult> {
    const record = this.lastUndo;
    if (!record || record.id !== token.id) return Promise.reject(new InputError("There's nothing to undo."));
    return this.change(() => {
      const plan: Plan = { putTransactions: [], deleteTransactions: [], putGoals: [], deleteGoals: [], putBudgets: [], deleteBudgets: [], unlogDeletes: record.loggedDeletes };
      for (const [id, v] of record.transactions) v ? plan.putTransactions!.push(v) : plan.deleteTransactions!.push(id);
      for (const [id, v] of record.goals) v ? plan.putGoals!.push(v) : plan.deleteGoals!.push(id);
      for (const [id, v] of record.budgets) v ? plan.putBudgets!.push(v) : plan.deleteBudgets!.push(id);
      return plan;
    }).then((r) => {
      if (this.lastUndo === record) this.lastUndo = null;
      return r;
    });
  }

  // ---------- The write pipeline ----------

  private change(build: (s: State) => Plan): Promise<WriteResult> {
    return this.store
      .transact(TABLES, "readwrite", async (tx) => {
        const [transactions, goals, budgets, settings] = await Promise.all([
          tx.getAll<Transaction>("transactions"),
          tx.getAll<Goal>("goals"),
          tx.getAll<Budget>("budgets"),
          tx.get<Settings>("settings", "settings"),
        ]);
        const before: State = {
          transactions: new Map(transactions.map((t) => [t.id, t])),
          goals: new Map(goals.map((g) => [g.id, g])),
          budgets: new Map(budgets.map((b) => [b.category, b])),
          settings: settings ?? this.defaultSettings(),
        };

        // Everything below is synchronous until the writes.
        const plan = build(before);
        const after: State = {
          transactions: new Map(before.transactions),
          goals: new Map(before.goals),
          budgets: new Map(before.budgets),
          settings: before.settings,
        };
        const touchedTx = new Set<string>();
        const touchedGoals = new Set<string>();
        const touchedBudgets = new Set<string>();
        for (const t of plan.putTransactions ?? []) (after.transactions.set(t.id, t), touchedTx.add(t.id));
        for (const id of plan.deleteTransactions ?? []) (after.transactions.delete(id), touchedTx.add(id));
        for (const g of plan.putGoals ?? []) (after.goals.set(g.id, g), touchedGoals.add(g.id));
        for (const id of plan.deleteGoals ?? []) (after.goals.delete(id), touchedGoals.add(id));
        for (const b of plan.putBudgets ?? []) (after.budgets.set(b.category, b), touchedBudgets.add(b.category));
        for (const c of plan.deleteBudgets ?? []) (after.budgets.delete(c), touchedBudgets.add(c));

        // Keep every goal's savedCents equal to the invariant. It's derived, so updatedAt doesn't change.
        const txList = [...after.transactions.values()];
        const now = this.deps.now();
        for (const g of after.goals.values()) {
          const saved = computeSaved(g, txList);
          if (saved !== g.savedCents) {
            after.goals.set(g.id, { ...g, savedCents: saved });
            touchedGoals.add(g.id);
          }
        }

        const violation = checkSavingsRules(
          { transactions: [...before.transactions.values()], goals: [...before.goals.values()] },
          { transactions: txList, goals: [...after.goals.values()] },
        );
        if (violation) throw new RuleError(violationMessage(violation, this.money(before)));

        const counted = plan.counted !== false;
        const nothingTouched = touchedTx.size + touchedGoals.size + touchedBudgets.size === 0;
        const s = before.settings;
        const nextSettings: Settings = { ...s, ...plan.settings };
        if (counted && (!nothingTouched || plan.countSettings)) nextSettings.changesSinceSync = s.changesSinceSync + 1;
        const logged = (plan.logDeletes ?? []).map((what) => ({ at: now, what }));
        if (logged.length || plan.unlogDeletes) {
          const kept = plan.unlogDeletes ? s.deleteLog.slice(0, Math.max(0, s.deleteLog.length - plan.unlogDeletes)) : s.deleteLog;
          nextSettings.deleteLog = [...kept, ...logged].slice(-DELETE_LOG_MAX);
        }

        const undo: UndoRecord | null = plan.undoLabel
          ? {
              id: this.deps.newId(),
              transactions: new Map([...touchedTx].map((id) => [id, before.transactions.get(id) ?? null])),
              goals: new Map([...touchedGoals].map((id) => [id, before.goals.get(id) ?? null])),
              budgets: new Map([...touchedBudgets].map((id) => [id, before.budgets.get(id) ?? null])),
              loggedDeletes: logged.length,
            }
          : null;

        // Writes: issued together, awaited together.
        const writes: Promise<void>[] = [];
        for (const id of touchedTx) {
          const t = after.transactions.get(id);
          writes.push(t ? tx.put("transactions", t) : tx.delete("transactions", id));
        }
        for (const id of touchedGoals) {
          const g = after.goals.get(id);
          writes.push(g ? tx.put("goals", g) : tx.delete("goals", id));
        }
        for (const c of touchedBudgets) {
          const b = after.budgets.get(c);
          writes.push(b ? tx.put("budgets", b) : tx.delete("budgets", c));
        }
        if (JSON.stringify(nextSettings) !== JSON.stringify(s) || !settings) writes.push(tx.put("settings", nextSettings));
        await Promise.all(writes);

        return { undo, label: plan.undoLabel, changed: !nothingTouched || writes.length > 0 };
      })
      .then(({ undo, label, changed }) => {
        if (undo && label) this.lastUndo = undo;
        else if (changed) this.lastUndo = null; // a new action replaces the toast
        if (changed) for (const fn of this.listeners) fn();
        return undo && label ? { undo: { id: undo.id, label } } : {};
      });
  }

  // ---------- Validation ----------

  private money(s: State): (cents: number) => string {
    return (cents) => formatMoney(cents, s.settings.currency, this.deps.locale ?? s.settings.locale);
  }

  private checkAmount(cents: number, { allowZero = false } = {}): number {
    if (!Number.isSafeInteger(cents) || cents < 0 || (cents === 0 && !allowZero)) throw new InputError(AMOUNT_FORMAT_MESSAGE);
    if (cents > MAX_CENTS) throw new InputError(AMOUNT_TOO_LARGE_MESSAGE);
    return cents;
  }

  private checkDate(date: DateStr): DateStr {
    if (!isValidDate(date)) throw new InputError("Enter a valid date.");
    if (date > this.deps.today()) throw new InputError("Dates can't be in the future.");
    return date;
  }

  private checkDueDate(date: DateStr): DateStr {
    if (!isValidDate(date)) throw new InputError("Enter a valid date.");
    return date;
  }

  private checkNote(note: string | undefined): string | undefined {
    const n = note?.trim() ?? "";
    if (n.length > NOTE_MAX) throw new InputError(`Notes can be up to ${NOTE_MAX} characters.`);
    return n === "" ? undefined : n;
  }

  private checkCategory(kind: Kind, category: string): void {
    if (!categoriesFor(kind).includes(category)) throw new InputError(kind === "income" ? "Choose a source." : "Choose a category.");
  }

  private checkGoalName(name: string): string {
    const n = name.trim();
    if (n === "") throw new InputError("Give the goal a name.");
    if (n.length > GOAL_NAME_MAX) throw new InputError(`Goal names can be up to ${GOAL_NAME_MAX} characters.`);
    return n;
  }

  private requireGoal(s: State, id: string): Goal {
    const g = s.goals.get(id);
    if (!g) throw new InputError("This goal no longer exists.");
    return g;
  }
}
