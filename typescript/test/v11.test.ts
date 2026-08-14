import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  BLOCK_SIZE, Digest, ERROR_CODES, findBlockHash, hashSeed, MasterSeedError,
  verifyBlockInSeed, verifySeedForSourceSize, expectedBlockSize, createSeed
} from "../src/index.ts";

async function* chunks(value: Uint8Array, size = 1): AsyncGenerator<Uint8Array> {
  for (let offset = 0; offset < value.byteLength; offset += size) yield value.slice(offset, Math.min(value.byteLength, offset + size));
}

class Sink {
  readonly parts: Uint8Array[] = [];
  async write(value: Uint8Array): Promise<void> { this.parts.push(value.slice()); }
  bytes(): Uint8Array {
    const result = new Uint8Array(this.parts.reduce((n, p) => n + p.byteLength, 0));
    let offset = 0;
    for (const part of this.parts) { result.set(part, offset); offset += part.byteLength; }
    return result;
  }
}

async function seedFor(source: Uint8Array): Promise<{ seed: Uint8Array; hash: Digest }> {
  const sink = new Sink();
  await createSeed(chunks(source, 3), sink);
  const seed = sink.bytes();
  return { seed, hash: await hashSeed(chunks(seed, 2)) };
}

function codeOf(action: () => Promise<unknown>, code: string): Promise<void> {
  return assert.rejects(action, (error: unknown) => error instanceof MasterSeedError && error.code === code);
}

describe("v1.1 trusted seed operations", () => {
  it("verifies, computes tail sizes, finds, and verifies a block", async () => {
    const source = new Uint8Array(BLOCK_SIZE + 1).fill(0x5a);
    const { seed, hash } = await seedFor(source);
    const info = await verifySeedForSourceSize(chunks(seed), hash, BigInt(source.byteLength));
    assert.equal(info.sourceSizeKnown, true);
    assert.equal(info.blockCount, 2n);
    assert.equal(expectedBlockSize(BigInt(source.byteLength), 0n), BigInt(BLOCK_SIZE));
    assert.equal(expectedBlockSize(BigInt(source.byteLength), 1n), 1n);
    const found = await findBlockHash(chunks(seed), hash, BigInt(source.byteLength), Digest.fromBytes((await hashSeed(chunks(source.slice(0, BLOCK_SIZE)))).toBytes()));
    assert.deepEqual([found.matchCount, found.firstIndex, found.lastIndex], [1n, 0n, 0n]);
    const verified = await verifyBlockInSeed(chunks(seed), hash, BigInt(source.byteLength), source.slice(0, BLOCK_SIZE));
    assert.deepEqual([verified.blockIndex, verified.blockSize], [0n, BigInt(BLOCK_SIZE)]);
  });

  it("handles zero, duplicate hashes, and selects a compatible length", async () => {
    const empty = await seedFor(new Uint8Array(0));
    await verifySeedForSourceSize(chunks(empty.seed), empty.hash, 0n);
    const emptyFound = await findBlockHash(chunks(empty.seed), empty.hash, 0n, Digest.fromBytes(new Uint8Array(32)));
    assert.equal(emptyFound.matchCount, 0n);
    const digest = Digest.fromBytes((await hashSeed(chunks(Uint8Array.of(1)))).toBytes());
    const raw = new Uint8Array([...digest.toBytes(), ...digest.toBytes()]);
    const hash = await hashSeed(chunks(raw));
    const found = await findBlockHash(chunks(raw), hash, BigInt(BLOCK_SIZE + 1), digest);
    assert.deepEqual([found.matchCount, found.firstIndex, found.lastIndex], [2n, 0n, 1n]);
    const verified = await verifyBlockInSeed(chunks(raw), hash, BigInt(BLOCK_SIZE + 1), Uint8Array.of(1));
    assert.deepEqual([verified.blockIndex, verified.blockSize], [1n, 1n]);
    assert.equal(expectedBlockSize(BigInt(BLOCK_SIZE), 0n), BigInt(BLOCK_SIZE));
    assert.throws(() => expectedBlockSize(1n << 64n, 0n), (e: unknown) => e instanceof MasterSeedError && e.code === ERROR_CODES.INVALID_ARGUMENT);
  });

  it("preserves error priority and distinguishes membership errors", async () => {
    const malformed = Uint8Array.of(1);
    await codeOf(() => verifySeedForSourceSize(chunks(malformed), Digest.fromBytes(new Uint8Array(32)), 1n), ERROR_CODES.INVALID_SEED_LENGTH);
    const digest = Digest.fromBytes((await hashSeed(chunks(Uint8Array.of(1)))).toBytes());
    const raw = digest.toBytes();
    const hash = await hashSeed(chunks(raw));
    await codeOf(() => verifyBlockInSeed(chunks(raw), hash, BigInt(BLOCK_SIZE), Uint8Array.of(1)), ERROR_CODES.BLOCK_SIZE_MISMATCH);
    await codeOf(() => verifyBlockInSeed(chunks(raw), hash, BigInt(BLOCK_SIZE), Uint8Array.of(2)), ERROR_CODES.BLOCK_NOT_IN_SEED);
    const oversized = new Uint8Array(BLOCK_SIZE + 1).fill(9);
    const oversizedHash = await hashSeed(chunks(oversized));
    const oversizedSeed = oversizedHash.toBytes();
    const oversizedSeedHash = await hashSeed(chunks(oversizedSeed));
    await assert.rejects(() => verifyBlockInSeed(chunks(oversizedSeed), oversizedSeedHash, BigInt(BLOCK_SIZE), oversized), (e: unknown) => e instanceof MasterSeedError && e.code === ERROR_CODES.BLOCK_SIZE_MISMATCH && e.context.actualBlockSize === BigInt(BLOCK_SIZE + 1));
    await codeOf(() => verifyBlockInSeed(chunks(oversizedSeed), Digest.fromBytes(new Uint8Array(32)), BigInt(BLOCK_SIZE), oversized), ERROR_CODES.SEED_HASH_MISMATCH);
    const absent = new Uint8Array(BLOCK_SIZE + 1).fill(7);
    await codeOf(() => verifyBlockInSeed(chunks(oversizedSeed), oversizedSeedHash, BigInt(BLOCK_SIZE), absent), ERROR_CODES.BLOCK_NOT_IN_SEED);
    let consumed = 0;
    const trackedBytes = new Uint8Array([...raw, ...raw]);
    const tracked: AsyncIterable<Uint8Array> = { async *[Symbol.asyncIterator]() { const a = trackedBytes.slice(0, 32); consumed += a.byteLength; yield a; const b = trackedBytes.slice(32, 64); consumed += b.byteLength; yield b; } };
    await codeOf(() => findBlockHash(tracked, Digest.fromBytes(new Uint8Array(32)), BigInt(BLOCK_SIZE), digest), ERROR_CODES.SEED_HASH_MISMATCH);
    assert.equal(consumed, trackedBytes.byteLength);
    await codeOf(() => verifySeedForSourceSize(chunks(raw), Digest.fromBytes(new Uint8Array(32)), BigInt(BLOCK_SIZE + 1)), ERROR_CODES.SEED_HASH_MISMATCH);
    await assert.rejects(() => verifySeedForSourceSize(chunks(raw), hash, BigInt(BLOCK_SIZE + 1)), (e: unknown) => e instanceof MasterSeedError && e.code === ERROR_CODES.SEED_SIZE_MISMATCH && e.context.blockCount === 1n && e.context.expectedBlockCount === 2n);
    await codeOf(() => verifySeedForSourceSize(chunks(new Uint8Array([...raw, 1])), hash, BigInt(BLOCK_SIZE)), ERROR_CODES.INVALID_SEED_LENGTH);
    await codeOf(() => findBlockHash(chunks(new Uint8Array([...raw, 1])), hash, BigInt(BLOCK_SIZE), digest), ERROR_CODES.INVALID_SEED_LENGTH);
    await codeOf(() => findBlockHash(chunks(raw), Digest.fromBytes(new Uint8Array(32)), BigInt(BLOCK_SIZE), digest), ERROR_CODES.SEED_HASH_MISMATCH);
    await assert.rejects(() => verifyBlockInSeed(chunks(raw), hash, BigInt(BLOCK_SIZE), Uint8Array.of(2)), (e: unknown) => e instanceof MasterSeedError && e.code === ERROR_CODES.BLOCK_NOT_IN_SEED && typeof e.context.actual === "string");
  });

  it("maps cancellation and reader failures", async () => {
    const controller = new AbortController();
    controller.abort();
    await codeOf(() => verifySeedForSourceSize(chunks(new Uint8Array(0)), Digest.fromBytes(new Uint8Array(32)), 0n, controller.signal), ERROR_CODES.ABORTED);
    const failing: AsyncIterable<Uint8Array> = { [Symbol.asyncIterator]() { return { async next(): Promise<IteratorResult<Uint8Array>> { throw new Error("boom"); } }; } };
    await codeOf(() => verifySeedForSourceSize(failing, Digest.fromBytes(new Uint8Array(32)), 0n), ERROR_CODES.READ_FAILED);
    assert.throws(() => expectedBlockSize(-1n, 0n), (error: unknown) => error instanceof MasterSeedError && error.code === ERROR_CODES.INVALID_ARGUMENT);
    assert.throws(() => expectedBlockSize(0n, (1n << 64n)), (error: unknown) => error instanceof MasterSeedError && error.code === ERROR_CODES.INVALID_ARGUMENT);
  });

  it("aborts when cancellation happens during a pending read that resolves EOF", async () => {
    const controller = new AbortController();
    let entered!: () => void;
    const enteredPromise = new Promise<void>((resolve) => { entered = resolve; });
    let release!: () => void;
    const releasePromise = new Promise<void>((resolve) => { release = resolve; });
    const pending: AsyncIterable<Uint8Array> = { async *[Symbol.asyncIterator]() { entered(); await releasePromise; return; } };
    const operation = verifySeedForSourceSize(pending, Digest.fromBytes(new Uint8Array(32)), 0n, controller.signal);
    await enteredPromise;
    controller.abort();
    release();
    await codeOf(() => operation, ERROR_CODES.ABORTED);
  });
});
