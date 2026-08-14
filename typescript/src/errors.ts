export const ERROR_CODES = {
  INVALID_SEED_LENGTH: "INVALID_SEED_LENGTH",
  INVALID_HASH_ENCODING: "INVALID_HASH_ENCODING",
  SEED_HASH_MISMATCH: "SEED_HASH_MISMATCH",
  BLOCK_HASH_MISMATCH: "BLOCK_HASH_MISMATCH",
  SOURCE_TOO_SHORT: "SOURCE_TOO_SHORT",
  SOURCE_TOO_LONG: "SOURCE_TOO_LONG",
  BLOCK_INDEX_OUT_OF_RANGE: "BLOCK_INDEX_OUT_OF_RANGE",
  INTEGER_OVERFLOW: "INTEGER_OVERFLOW",
  TARGET_EXISTS: "TARGET_EXISTS",
  READ_FAILED: "READ_FAILED",
  WRITE_FAILED: "WRITE_FAILED",
  ABORTED: "ABORTED",
  INVALID_ARGUMENT: "INVALID_ARGUMENT",
  SEED_SIZE_MISMATCH: "SEED_SIZE_MISMATCH",
  BLOCK_NOT_IN_SEED: "BLOCK_NOT_IN_SEED",
  BLOCK_SIZE_MISMATCH: "BLOCK_SIZE_MISMATCH"
} as const;

export type ErrorCode = (typeof ERROR_CODES)[keyof typeof ERROR_CODES];

export type ErrorContext = Readonly<Record<string, unknown>>;

export class MasterSeedError extends Error {
  readonly code: ErrorCode;
  readonly context: ErrorContext;
  readonly cause: unknown;

  constructor(code: ErrorCode, message: string, context: ErrorContext = {}, cause?: unknown) {
    super(message);
    this.name = "MasterSeedError";
    this.code = code;
    this.context = context;
    this.cause = cause;
  }
}

export function isMasterSeedError(value: unknown): value is MasterSeedError {
  return value instanceof MasterSeedError;
}

export function throwIfAborted(signal?: AbortSignal): void {
  if (signal?.aborted) {
    throw new MasterSeedError(ERROR_CODES.ABORTED, "operation was aborted", {}, signal.reason);
  }
}

export function readError(cause: unknown, operation = "read"): MasterSeedError {
  if (isMasterSeedError(cause)) return cause;
  return new MasterSeedError(ERROR_CODES.READ_FAILED, `${operation} failed`, { operation }, cause);
}

export function writeError(cause: unknown, operation = "write"): MasterSeedError {
  if (isMasterSeedError(cause)) return cause;
  return new MasterSeedError(ERROR_CODES.WRITE_FAILED, `${operation} failed`, { operation }, cause);
}

export function invalidArgument(message: string): MasterSeedError {
  return new MasterSeedError(ERROR_CODES.INVALID_ARGUMENT, message);
}
