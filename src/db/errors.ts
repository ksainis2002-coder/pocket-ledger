// Typed errors (SPEC Storage errors). Screens show `message`; they never see raw IndexedDB errors.

/** Something typed is invalid (bad amount, future date, unknown category). Fix the input and retry. */
export class InputError extends Error {
  override name = "InputError";
}

/** A Goals and savings rule refused the write. Nothing was changed. */
export class RuleError extends Error {
  override name = "RuleError";
}

/** The device's storage is full. Nothing was changed. */
export class QuotaError extends Error {
  override name = "QuotaError";
  constructor(message = "Storage is full. Export a backup, then delete old entries.", options?: ErrorOptions) {
    super(message, options);
  }
}

/** Anything else went wrong while reading or writing. Nothing was changed. */
export class StorageError extends Error {
  override name = "StorageError";
  constructor(message = "Couldn't save. Your entry is still in the form.", options?: ErrorOptions) {
    super(message, options);
  }
}

export type AppError = InputError | RuleError | QuotaError | StorageError;

export function isAppError(e: unknown): e is AppError {
  return e instanceof InputError || e instanceof RuleError || e instanceof QuotaError || e instanceof StorageError;
}

/** Error names the storage engine (IndexedDB, or MemoryStore imitating it) can produce. */
const ENGINE_ERRORS = new Set([
  "QuotaExceededError",
  "DataError",
  "ReadOnlyError",
  "TransactionInactiveError",
  "InvalidStateError",
  "InvalidAccessError",
  "AbortError",
  "UnknownError",
  "NotFoundError",
  "ConstraintError",
  "VersionError",
  "DataCloneError",
  "TimeoutError",
]);

/** Map anything thrown by the storage engine to one of our types. */
export function toAppError(e: unknown): AppError {
  if (isAppError(e)) return e;
  const name = (e as { name?: unknown } | null)?.name;
  if (name === "QuotaExceededError") return new QuotaError(undefined, { cause: e });
  return new StorageError(undefined, { cause: e });
}

/**
 * Inside a transaction: storage engine errors become typed errors; anything else thrown by the
 * caller's own code (our typed errors, or a bug) passes through unchanged.
 */
export function mapTransactionError(e: unknown): unknown {
  if (isAppError(e)) return e;
  const name = (e as { name?: unknown } | null)?.name;
  return typeof name === "string" && ENGINE_ERRORS.has(name) ? toAppError(e) : e;
}
