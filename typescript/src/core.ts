import { Digest, DIGEST_SIZE } from "./digest.js";
import { ERROR_CODES, invalidArgument, isMasterSeedError, MasterSeedError, readError, throwIfAborted, writeError } from "./errors.js";
import { Sha256 } from "./sha256.js";

export const FORMAT = "keymaster-seed-v1" as const;
export const BLOCK_SIZE = 524288;
export const BLOCK_SIZE_BIGINT = 524288n;
export const HASH_ALGORITHM = "SHA-256" as const;

export type ByteSource = AsyncIterable<Uint8Array> | Iterable<Uint8Array>;

export interface AsyncByteSink {
  write(value: Uint8Array): void | PromiseLike<void>;
}

export interface SeedInfo {
  readonly format: typeof FORMAT;
  readonly blockSize: bigint;
  readonly blockCount: bigint;
  readonly sourceSize: bigint;
  readonly sourceSizeKnown: boolean;
  readonly seedSize: bigint;
  readonly seedHash: Digest;
  readonly seedHashHex: string;
}

export interface VerifyInfo extends SeedInfo {
  readonly blocksVerified: bigint;
}

export interface RandomAccessSeed {
  readAt(offset: bigint, length: number): Promise<Uint8Array>;
}

function makeInfo(blockCount: bigint, sourceSize: bigint, sourceSizeKnown: boolean, seedSize: bigint, seedHash: Digest): SeedInfo {
  return {
    format: FORMAT,
    blockSize: BLOCK_SIZE_BIGINT,
    blockCount,
    sourceSize,
    sourceSizeKnown,
    seedSize,
    seedHash,
    seedHashHex: seedHash.toHex()
  };
}

function makeReadError(cause: unknown, operation: string): MasterSeedError {
  return isMasterSeedError(cause) ? cause : readError(cause, operation);
}

function makeWriteError(cause: unknown, operation: string): MasterSeedError {
  return isMasterSeedError(cause) ? cause : writeError(cause, operation);
}

function toDigest(value: Uint8Array): Digest {
  return Digest.fromBytes(value);
}

function addSize(current: bigint, amount: number): bigint {
  if (amount < 0) throw new MasterSeedError(ERROR_CODES.INTEGER_OVERFLOW, "negative byte count");
  const next = current + BigInt(amount);
  if (next < current || next > (1n << 64n) - 1n) throw new MasterSeedError(ERROR_CODES.INTEGER_OVERFLOW, "byte count overflow");
  return next;
}

function checkedOffset(index: bigint, unit: bigint): bigint {
  if (index < 0n || unit < 0n || index > ((1n << 64n) - 1n) / unit) {
    throw new MasterSeedError(ERROR_CODES.INTEGER_OVERFLOW, "offset multiplication overflow", { index, unit });
  }
  return index * unit;
}

function iteratorOf(source: ByteSource): AsyncIterator<Uint8Array> {
  const asyncIterator = (source as AsyncIterable<Uint8Array>)[Symbol.asyncIterator];
  if (typeof asyncIterator === "function") return asyncIterator.call(source);
  const syncIterator = (source as Iterable<Uint8Array>)[Symbol.iterator];
  if (typeof syncIterator === "function") return syncIterator.call(source) as unknown as AsyncIterator<Uint8Array>;
  throw invalidArgument("source must be iterable or async iterable");
}

class ByteReader {
  private readonly iterator: AsyncIterator<Uint8Array>;
  private current: Uint8Array | undefined;
  private offset = 0;
  private done = false;

  constructor(source: ByteSource, private readonly signal?: AbortSignal) {
    this.iterator = iteratorOf(source);
  }

  async readInto(target: Uint8Array, targetOffset: number, length: number): Promise<{ count: number; eof: boolean }> {
    if (targetOffset < 0 || length < 0 || targetOffset + length > target.byteLength) throw invalidArgument("read range is outside target");
    let count = 0;
    while (count < length) {
      throwIfAborted(this.signal);
      if (!this.current || this.offset >= this.current.byteLength) {
        if (this.done) return { count, eof: true };
        let next: IteratorResult<Uint8Array>;
        try {
          next = await this.iterator.next();
        } catch (cause) {
          throw makeReadError(cause, "source iterator");
        }
        if (next.done) {
          this.done = true;
          this.current = undefined;
          return { count, eof: true };
        }
        if (!(next.value instanceof Uint8Array)) throw makeReadError(new TypeError("source yielded a non-Uint8Array value"), "source iterator");
        this.current = next.value;
        this.offset = 0;
        if (this.current.byteLength === 0) continue;
      }
      const available = this.current.byteLength - this.offset;
      const take = Math.min(available, length - count);
      target.set(this.current.subarray(this.offset, this.offset + take), targetOffset + count);
      this.offset += take;
      count += take;
    }
    return { count, eof: false };
  }

  async close(): Promise<void> {
    const returnMethod = this.iterator.return;
    if (returnMethod && !this.done) {
      try {
        await returnMethod.call(this.iterator);
      } catch {
        // A primary read/verification error must remain the reported error.
      }
    }
  }
}

async function writeChunk(sink: AsyncByteSink, value: Uint8Array, signal?: AbortSignal): Promise<void> {
  throwIfAborted(signal);
  try {
    await sink.write(value.slice());
  } catch (cause) {
    throw makeWriteError(cause, "seed sink");
  }
  throwIfAborted(signal);
}

export async function createSeed(source: ByteSource, sink: AsyncByteSink, signal?: AbortSignal): Promise<SeedInfo> {
  const reader = new ByteReader(source, signal);
  const block = new Uint8Array(BLOCK_SIZE);
  const seedHasher = new Sha256();
  let filled = 0;
  let blockCount = 0n;
  let sourceSize = 0n;
  let seedSize = 0n;

  const processBlock = async (length: number): Promise<void> => {
    throwIfAborted(signal);
    const digest = toDigest(new Sha256().update(block.subarray(0, length)).digest());
    await writeChunk(sink, digest.toBytes(), signal);
    seedHasher.update(digest.toBytes());
    blockCount += 1n;
    seedSize += BigInt(DIGEST_SIZE);
  };

  try {
    while (true) {
      const result = await reader.readInto(block, filled, BLOCK_SIZE - filled);
      sourceSize = addSize(sourceSize, result.count);
      filled += result.count;
      if (filled === BLOCK_SIZE) {
        await processBlock(filled);
        filled = 0;
      }
      if (result.eof) {
        if (filled > 0) {
          await processBlock(filled);
          filled = 0;
        }
        break;
      }
    }
  } finally {
    await reader.close();
  }
  const seedHash = toDigest(seedHasher.digest());
  return makeInfo(blockCount, sourceSize, true, seedSize, seedHash);
}

async function hashStream(seed: ByteSource, signal?: AbortSignal): Promise<{ digest: Digest; size: bigint }> {
  const reader = new ByteReader(seed, signal);
  const buffer = new Uint8Array(64 * 1024);
  const hasher = new Sha256();
  let size = 0n;
  try {
    while (true) {
      const result = await reader.readInto(buffer, 0, buffer.byteLength);
      if (result.count > 0) {
        hasher.update(buffer.subarray(0, result.count));
        size = addSize(size, result.count);
      }
      if (result.eof) break;
    }
  } finally {
    await reader.close();
  }
  return { digest: toDigest(hasher.digest()), size };
}

export async function hashSeed(seed: ByteSource, signal?: AbortSignal): Promise<Digest> {
  return (await hashStream(seed, signal)).digest;
}

export async function inspectSeed(seed: ByteSource, signal?: AbortSignal): Promise<SeedInfo> {
  const result = await hashStream(seed, signal);
  if (result.size % BigInt(DIGEST_SIZE) !== 0n) {
    throw new MasterSeedError(ERROR_CODES.INVALID_SEED_LENGTH, "seed size is not a multiple of the digest size", { seedSize: result.size });
  }
  return makeInfo(result.size / BigInt(DIGEST_SIZE), 0n, false, result.size, result.digest);
}

export async function verifySeed(seed: ByteSource, expected: Digest, signal?: AbortSignal): Promise<SeedInfo> {
  const info = await inspectSeed(seed, signal);
  if (!info.seedHash.equals(expected)) {
    throw new MasterSeedError(ERROR_CODES.SEED_HASH_MISMATCH, "seed hash does not match expected digest", {
      expected: expected.toHex(),
      actual: info.seedHash.toHex(),
      seedSize: info.seedSize
    });
  }
  return info;
}

export async function verifySource(source: ByteSource, seed: ByteSource, signal?: AbortSignal): Promise<VerifyInfo> {
  const sourceReader = new ByteReader(source, signal);
  const seedReader = new ByteReader(seed, signal);
  const seedHasher = new Sha256();
  const expectedBytes = new Uint8Array(DIGEST_SIZE);
  const sourceBlock = new Uint8Array(BLOCK_SIZE);
  let seedSize = 0n;
  let sourceSize = 0n;
  let blockCount = 0n;

  try {
    while (true) {
      const seedResult = await seedReader.readInto(expectedBytes, 0, DIGEST_SIZE);
      if (seedResult.count > 0) {
        seedHasher.update(expectedBytes.subarray(0, seedResult.count));
        seedSize = addSize(seedSize, seedResult.count);
      }
      if (seedResult.count === 0 && seedResult.eof) break;
      if (seedResult.count !== DIGEST_SIZE) {
        throw new MasterSeedError(ERROR_CODES.INVALID_SEED_LENGTH, "seed ended in the middle of a digest", { seedSize });
      }

      const sourceOffset = sourceSize;
      const sourceResult = await sourceReader.readInto(sourceBlock, 0, BLOCK_SIZE);
      if (sourceResult.count === 0 && sourceResult.eof) {
        throw new MasterSeedError(ERROR_CODES.SOURCE_TOO_SHORT, "source ended before the seed described block", { blockIndex: blockCount, sourceOffset });
      }
      sourceSize = addSize(sourceSize, sourceResult.count);
      const expected = Digest.fromBytes(expectedBytes);
      const actual = toDigest(new Sha256().update(sourceBlock.subarray(0, sourceResult.count)).digest());
      if (!actual.equals(expected)) {
        throw new MasterSeedError(ERROR_CODES.BLOCK_HASH_MISMATCH, "source block hash does not match seed", {
          blockIndex: blockCount,
          sourceOffset,
          expected: expected.toHex(),
          actual: actual.toHex()
        });
      }
      blockCount += 1n;
    }

    const extra = new Uint8Array(1);
    const extraResult = await sourceReader.readInto(extra, 0, 1);
    if (extraResult.count > 0) {
      throw new MasterSeedError(ERROR_CODES.SOURCE_TOO_LONG, "source contains bytes not described by seed", {
        blockIndex: blockCount,
        sourceOffset: sourceSize
      });
    }
  } finally {
    await sourceReader.close();
    await seedReader.close();
  }

  const seedHash = toDigest(seedHasher.digest());
  return { ...makeInfo(blockCount, sourceSize, true, seedSize, seedHash), blocksVerified: blockCount };
}

export async function readBlockHash(seed: RandomAccessSeed, seedSize: bigint, blockIndex: bigint, signal?: AbortSignal): Promise<Digest> {
  throwIfAborted(signal);
  if (seedSize < 0n || seedSize > (1n << 64n) - 1n || seedSize % BigInt(DIGEST_SIZE) !== 0n) {
    throw new MasterSeedError(ERROR_CODES.INVALID_SEED_LENGTH, "seed size is not a multiple of the digest size", { seedSize });
  }
  const blockCount = seedSize / BigInt(DIGEST_SIZE);
  if (blockIndex < 0n || blockIndex >= blockCount) {
    throw new MasterSeedError(ERROR_CODES.BLOCK_INDEX_OUT_OF_RANGE, "block index is outside the seed", { blockIndex, blockCount });
  }
  const offset = checkedOffset(blockIndex, BigInt(DIGEST_SIZE));
  try {
    const bytes = await seed.readAt(offset, DIGEST_SIZE);
    throwIfAborted(signal);
    if (bytes.byteLength !== DIGEST_SIZE) throw new MasterSeedError(ERROR_CODES.READ_FAILED, "random-access read returned a short digest");
    return Digest.fromBytes(bytes);
  } catch (cause) {
    throw makeReadError(cause, "random-access seed");
  }
}

export function verifyBlock(block: Uint8Array, expected: Digest, signal?: AbortSignal): Digest {
  throwIfAborted(signal);
  if (block.byteLength > BLOCK_SIZE) throw invalidArgument("a block cannot exceed BLOCK_SIZE");
  const actual = toDigest(new Sha256().update(block).digest());
  if (!actual.equals(expected)) {
    throw new MasterSeedError(ERROR_CODES.BLOCK_HASH_MISMATCH, "block hash does not match expected digest", {
      expected: expected.toHex(),
      actual: actual.toHex()
    });
  }
  return actual;
}

export function blockCountForSourceSize(sourceSize: bigint): bigint {
  if (sourceSize < 0n) throw invalidArgument("source size cannot be negative");
  return sourceSize === 0n ? 0n : ((sourceSize - 1n) / BLOCK_SIZE_BIGINT) + 1n;
}

export function seedSizeForBlockCount(blockCount: bigint): bigint {
  if (blockCount < 0n || blockCount > ((1n << 64n) - 1n) / BigInt(DIGEST_SIZE)) {
    throw new MasterSeedError(ERROR_CODES.INTEGER_OVERFLOW, "seed size multiplication overflow", { blockCount });
  }
  return blockCount * BigInt(DIGEST_SIZE);
}

export function sourceOffset(blockIndex: bigint): bigint {
  return checkedOffset(blockIndex, BLOCK_SIZE_BIGINT);
}

export function seedOffset(blockIndex: bigint): bigint {
  return checkedOffset(blockIndex, BigInt(DIGEST_SIZE));
}
