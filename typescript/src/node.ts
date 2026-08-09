import { randomUUID } from "node:crypto";
import { FileHandle, open, stat, unlink, rename, link } from "node:fs/promises";
import { dirname, basename, join } from "node:path";
import {
  AsyncByteSink,
  BLOCK_SIZE,
  ByteSource,
  createSeed,
  RandomAccessSeed,
  SeedInfo,
  verifySeed,
  verifySource,
  VerifyInfo
} from "./core.js";
import { ERROR_CODES, isMasterSeedError, MasterSeedError, readError, writeError } from "./errors.js";
import { Digest } from "./digest.js";

export interface CreateSeedFileOptions {
  readonly overwrite?: boolean;
  readonly sync?: boolean;
  readonly chunkSize?: number;
}

function pathError(code: typeof ERROR_CODES.READ_FAILED | typeof ERROR_CODES.WRITE_FAILED, operation: string, path: string, cause: unknown): MasterSeedError {
  return new MasterSeedError(code, `${operation} failed`, { operation, path }, cause);
}

function sourceForHandle(handle: FileHandle, chunkSize: number, signal?: AbortSignal): ByteSource {
  return (async function* (): AsyncGenerator<Uint8Array> {
    if (!Number.isInteger(chunkSize) || chunkSize <= 0) throw new MasterSeedError(ERROR_CODES.INVALID_ARGUMENT, "chunkSize must be a positive integer");
    const buffer = new Uint8Array(chunkSize);
    while (true) {
      if (signal?.aborted) throw new MasterSeedError(ERROR_CODES.ABORTED, "operation was aborted", {}, signal.reason);
      let result: { bytesRead: number };
      try {
        result = await handle.read(buffer, 0, buffer.byteLength, null);
      } catch (cause) {
        throw readError(cause, "source file");
      }
      if (result.bytesRead === 0) return;
      yield buffer.slice(0, result.bytesRead);
    }
  })();
}

function sinkForHandle(handle: FileHandle): AsyncByteSink {
  return {
    async write(value: Uint8Array): Promise<void> {
      let offset = 0;
      while (offset < value.byteLength) {
        let result: { bytesWritten: number };
        try {
          result = await handle.write(value, offset, value.byteLength - offset, null);
        } catch (cause) {
          throw writeError(cause, "seed file");
        }
        if (result.bytesWritten <= 0) throw new MasterSeedError(ERROR_CODES.WRITE_FAILED, "seed file write made no progress");
        offset += result.bytesWritten;
      }
    }
  };
}

async function closeQuietly(handle: FileHandle | undefined): Promise<void> {
  if (!handle) return;
  try {
    await handle.close();
  } catch {
    // Preserve the primary operation error.
  }
}

async function statOrUndefined(path: string): Promise<Awaited<ReturnType<typeof stat>> | undefined> {
  try {
    return await stat(path, { bigint: true });
  } catch (cause) {
    if ((cause as NodeJS.ErrnoException).code === "ENOENT") return undefined;
    throw cause;
  }
}

function sameFile(a: Awaited<ReturnType<typeof stat>>, b: Awaited<ReturnType<typeof stat>>): boolean {
  return a.dev === b.dev && a.ino === b.ino;
}

/** Create and atomically publish a seed file in Node.js. */
export async function createSeedFile(
  sourcePath: string,
  seedPath: string,
  options: CreateSeedFileOptions = {},
  signal?: AbortSignal
): Promise<SeedInfo> {
  if (!sourcePath || !seedPath) throw new MasterSeedError(ERROR_CODES.INVALID_ARGUMENT, "source and seed paths are required");
  const overwrite = options.overwrite === true;
  const chunkSize = options.chunkSize ?? 64 * 1024;
  let sourceHandle: FileHandle | undefined;
  let temporaryHandle: FileHandle | undefined;
  let temporaryPath: string | undefined;
  let published = false;

  try {
    let sourceStat: Awaited<ReturnType<typeof stat>>;
    try {
      sourceStat = await stat(sourcePath, { bigint: true });
    } catch (cause) {
      throw pathError(ERROR_CODES.READ_FAILED, "stat source", sourcePath, cause);
    }
    let targetStat: Awaited<ReturnType<typeof stat>> | undefined;
    try {
      targetStat = await statOrUndefined(seedPath);
    } catch (cause) {
      throw pathError(ERROR_CODES.WRITE_FAILED, "stat target", seedPath, cause);
    }
    if (targetStat && sameFile(sourceStat, targetStat)) {
      throw new MasterSeedError(ERROR_CODES.INVALID_ARGUMENT, "source and seed paths refer to the same file", { sourcePath, seedPath });
    }
    if (targetStat && !overwrite) {
      throw new MasterSeedError(ERROR_CODES.TARGET_EXISTS, "seed target already exists", { path: seedPath });
    }

    try {
      sourceHandle = await open(sourcePath, "r");
    } catch (cause) {
      throw pathError(ERROR_CODES.READ_FAILED, "open source", sourcePath, cause);
    }
    temporaryPath = join(dirname(seedPath), `.${basename(seedPath)}.masterseed-${randomUUID()}.tmp`);
    try {
      temporaryHandle = await open(temporaryPath, "wx", 0o600);
    } catch (cause) {
      throw pathError(ERROR_CODES.WRITE_FAILED, "create temporary seed", seedPath, cause);
    }

    const info = await createSeed(sourceForHandle(sourceHandle, chunkSize, signal), sinkForHandle(temporaryHandle), signal);
    if (options.sync === true) await temporaryHandle.sync();
    await temporaryHandle.close();
    temporaryHandle = undefined;

    try {
      if (overwrite) {
        await rename(temporaryPath, seedPath);
      } else {
        await link(temporaryPath, seedPath);
        await unlink(temporaryPath);
      }
    } catch (cause) {
      if (!overwrite && (cause as NodeJS.ErrnoException).code === "EEXIST") {
        throw new MasterSeedError(ERROR_CODES.TARGET_EXISTS, "seed target already exists", { path: seedPath }, cause);
      }
      throw pathError(ERROR_CODES.WRITE_FAILED, "publish seed", seedPath, cause);
    }
    published = true;
    return info;
  } catch (cause) {
    if (isMasterSeedError(cause)) throw cause;
    throw writeError(cause, "seed file");
  } finally {
    await closeQuietly(temporaryHandle);
    await closeQuietly(sourceHandle);
    if (temporaryPath && !published) {
      try {
        await unlink(temporaryPath);
      } catch {
        // The temporary path may already have been published or removed.
      }
    }
  }
}

/** Verify the trusted seed hash, then perform the complete source pass. */
export async function verifySourceFile(sourcePath: string, seedPath: string, expected: Digest, signal?: AbortSignal): Promise<VerifyInfo> {
  if (!sourcePath || !seedPath) throw new MasterSeedError(ERROR_CODES.INVALID_ARGUMENT, "source and seed paths are required");
  let sourceStat: Awaited<ReturnType<typeof stat>>;
  let seedStat: Awaited<ReturnType<typeof stat>>;
  try {
    sourceStat = await stat(sourcePath, { bigint: true });
    seedStat = await stat(seedPath, { bigint: true });
  } catch (cause) {
    throw pathError(ERROR_CODES.READ_FAILED, "stat verification input", `${sourcePath}:${seedPath}`, cause);
  }
  if (sameFile(sourceStat, seedStat)) {
    throw new MasterSeedError(ERROR_CODES.INVALID_ARGUMENT, "source and seed paths refer to the same file", { sourcePath, seedPath });
  }

  let seedHandle: FileHandle | undefined;
  try {
    seedHandle = await open(seedPath, "r");
    await verifySeed(sourceForHandle(seedHandle, 64 * 1024, signal), expected, signal);
  } catch (cause) {
    if (isMasterSeedError(cause)) throw cause;
    throw pathError(ERROR_CODES.READ_FAILED, "verify seed file", seedPath, cause);
  } finally {
    await closeQuietly(seedHandle);
  }

  let sourceHandle: FileHandle | undefined;
  let secondSeedHandle: FileHandle | undefined;
  try {
    sourceHandle = await open(sourcePath, "r");
    secondSeedHandle = await open(seedPath, "r");
    return await verifySource(
      sourceForHandle(sourceHandle, 64 * 1024, signal),
      sourceForHandle(secondSeedHandle, 64 * 1024, signal),
      signal
    );
  } catch (cause) {
    if (isMasterSeedError(cause)) throw cause;
    throw pathError(ERROR_CODES.READ_FAILED, "verify source file", sourcePath, cause);
  } finally {
    await closeQuietly(sourceHandle);
    await closeQuietly(secondSeedHandle);
  }
}

class FileRandomAccess implements RandomAccessSeed {
  constructor(private readonly handle: FileHandle) {}

  async readAt(offset: bigint, length: number): Promise<Uint8Array> {
    if (offset < 0n || offset > BigInt(Number.MAX_SAFE_INTEGER)) {
      throw new MasterSeedError(ERROR_CODES.INTEGER_OVERFLOW, "file offset is not safely representable", { offset });
    }
    const buffer = new Uint8Array(length);
    const result = await this.handle.read(buffer, 0, length, Number(offset));
    return buffer.slice(0, result.bytesRead);
  }
}

/** Read one block hash from a Node seed file without exposing Buffer in core APIs. */
export async function readBlockHashFile(seedPath: string, blockIndex: bigint, signal?: AbortSignal): Promise<Digest> {
  let handle: FileHandle | undefined;
  try {
    const seedStat = await stat(seedPath, { bigint: true });
    handle = await open(seedPath, "r");
    const { readBlockHash } = await import("./core.js");
    return await readBlockHash(new FileRandomAccess(handle), seedStat.size, blockIndex, signal);
  } catch (cause) {
    if (isMasterSeedError(cause)) throw cause;
    throw pathError(ERROR_CODES.READ_FAILED, "read block hash", seedPath, cause);
  } finally {
    await closeQuietly(handle);
  }
}

export { BLOCK_SIZE };

