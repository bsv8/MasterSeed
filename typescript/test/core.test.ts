import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { describe, it } from "node:test";
import {
  BLOCK_SIZE,
  createSeed,
  Digest,
  ERROR_CODES,
  inspectSeed,
  MasterSeedError,
  readBlockHash,
  verifyBlock,
  verifySeed,
  verifySource
} from "../src/index.ts";

interface Recipe {
  kind: string;
  value?: string;
  byte?: string;
  size?: number;
  segments?: Array<{ byte: string; size: number }>;
}

interface Vector {
  name: string;
  source: Recipe;
  source_size: number;
  block_count: number;
  block_hashes_hex: string[];
  seed_size: number;
  seed_bytes_hex: string;
  seed_hash_hex: string;
}

function bytesFromHex(value: string): Uint8Array {
  const result = new Uint8Array(value.length / 2);
  for (let i = 0; i < result.length; i += 1) result[i] = Number.parseInt(value.slice(i * 2, i * 2 + 2), 16);
  return result;
}

function recipeBytes(recipe: Recipe): Uint8Array {
  if (recipe.kind === "empty") return new Uint8Array(0);
  if (recipe.kind === "hex") return bytesFromHex(recipe.value ?? "");
  if (recipe.kind === "repeat") return Uint8Array.from({ length: recipe.size ?? 0 }, () => Number.parseInt(recipe.byte ?? "00", 16));
  if (recipe.kind === "ramp8") return Uint8Array.from({ length: recipe.size ?? 0 }, (_, index) => index & 0xff);
  if (recipe.kind === "segments") {
    const parts = (recipe.segments ?? []).map((segment) => Uint8Array.from({ length: segment.size }, () => Number.parseInt(segment.byte, 16)));
    const result = new Uint8Array(parts.reduce((sum, part) => sum + part.length, 0));
    let offset = 0;
    for (const part of parts) {
      result.set(part, offset);
      offset += part.length;
    }
    return result;
  }
  throw new Error(`unknown recipe ${recipe.kind}`);
}

async function* chunks(value: Uint8Array, chunkSize: number): AsyncGenerator<Uint8Array> {
  for (let offset = 0; offset < value.byteLength; offset += chunkSize) {
    yield value.slice(offset, Math.min(value.byteLength, offset + chunkSize));
    if (offset === 0) yield new Uint8Array(0);
  }
}

async function* chunksWithSizes(value: Uint8Array, sizes: number[]): AsyncGenerator<Uint8Array> {
  let offset = 0;
  let index = 0;
  while (offset < value.byteLength) {
    const size = sizes[index % sizes.length]!;
    yield value.slice(offset, Math.min(value.byteLength, offset + size));
    offset += size;
    index += 1;
  }
}

class MemorySink {
  readonly chunks: Uint8Array[] = [];
  async write(value: Uint8Array): Promise<void> {
    this.chunks.push(value);
  }
  bytes(): Uint8Array {
    const result = new Uint8Array(this.chunks.reduce((sum, chunk) => sum + chunk.byteLength, 0));
    let offset = 0;
    for (const chunk of this.chunks) {
      result.set(chunk, offset);
      offset += chunk.byteLength;
    }
    return result;
  }
}

function expectCode(action: () => Promise<unknown>, code: string): Promise<void> {
  return assert.rejects(action, (error: unknown) => error instanceof MasterSeedError && error.code === code);
}

const vectorData = JSON.parse(await readFile(new URL("../../testdata/v1/vectors.json", import.meta.url), "utf8")) as { vectors: Vector[] };

describe("shared V1 vectors", () => {
  for (const vector of vectorData.vectors) {
    it(vector.name, async () => {
      const source = recipeBytes(vector.source);
      assert.equal(source.byteLength, vector.source_size);
      const sink = new MemorySink();
      const info = await createSeed(chunksWithSizes(source, [1, 8191, 524289, 3]), sink);
      const expectedSeed = bytesFromHex(vector.seed_bytes_hex);
      assert.deepEqual(sink.bytes(), expectedSeed);
      assert.equal(info.blockCount, BigInt(vector.block_count));
      assert.equal(info.seedSize, BigInt(vector.seed_size));
      assert.equal(info.sourceSize, BigInt(vector.source_size));
      assert.equal(info.seedHashHex, vector.seed_hash_hex);
      assert.equal(expectedSeed.byteLength, vector.block_count * 32);

      const inspected = await inspectSeed(chunksWithSizes(expectedSeed, [1, 7, 32, 2]));
      assert.equal(inspected.seedHashHex, vector.seed_hash_hex);
      await verifySeed(chunks(expectedSeed, 3), Digest.fromHex(vector.seed_hash_hex));
      const verified = await verifySource(chunks(source, 17), chunks(expectedSeed, 5));
      assert.equal(verified.blocksVerified, BigInt(vector.block_count));
      for (let index = 0; index < vector.block_count; index += 1) {
        const actual = await readBlockHash({ readAt: async (offset, length) => expectedSeed.slice(Number(offset), Number(offset) + length) }, BigInt(vector.seed_size), BigInt(index));
        assert.equal(actual.toHex(), vector.block_hashes_hex[index]);
      }
    });
  }
});

describe("validation and failure semantics", () => {
  it("keeps Digest immutable and parses strict hex", () => {
    const digest = Digest.fromHex("ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad");
    const bytes = digest.toBytes();
    bytes[0] ^= 0xff;
    assert.equal(digest.toHex(), "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad");
    for (const invalid of ["", `0x${digest.toHex()}`, ` ${digest.toHex()}`, digest.toHex().slice(0, 63), `${digest.toHex()}00`, `zz${digest.toHex().slice(2)}`]) {
      assert.throws(() => Digest.fromHex(invalid), (error: unknown) => error instanceof MasterSeedError && error.code === ERROR_CODES.INVALID_HASH_ENCODING);
    }
    assert.equal(Digest.fromHex(digest.toHex().toUpperCase()).toHex(), digest.toHex());
  });

  it("rejects invalid seed lengths before trusting the hash", async () => {
    for (const size of [1, 31, 33, 63]) await expectCode(() => inspectSeed(chunks(new Uint8Array(size), 2)), ERROR_CODES.INVALID_SEED_LENGTH);
  });

  it("classifies short, long, mismatched and cancelled operations", async () => {
    const oneBlock = new Uint8Array(BLOCK_SIZE);
    const sink = new MemorySink();
    await createSeed(chunks(oneBlock, BLOCK_SIZE), sink);
    const seed = sink.bytes();
    await expectCode(() => verifySource(chunks(new Uint8Array(0), 1), chunks(seed, 2)), ERROR_CODES.SOURCE_TOO_SHORT);
    await expectCode(() => verifySource(chunks(Uint8Array.from([1]), 1), chunks(seed, 2)), ERROR_CODES.BLOCK_HASH_MISMATCH);
    await expectCode(() => verifySource(chunks(Uint8Array.from([...oneBlock, 1]), 8191), chunks(seed, 2)), ERROR_CODES.SOURCE_TOO_LONG);
    await expectCode(() => verifySource(chunks(oneBlock, 8191), chunks(Uint8Array.from([...seed, 1]), 2)), ERROR_CODES.INVALID_SEED_LENGTH);

    const controller = new AbortController();
    controller.abort();
    await expectCode(() => createSeed(chunks(oneBlock, 1), new MemorySink(), controller.signal), ERROR_CODES.ABORTED);
  });

  it("maps source and sink failures to stable codes", async () => {
    const failingSource: AsyncIterable<Uint8Array> = {
      [Symbol.asyncIterator]() {
        return {
          async next(): Promise<IteratorResult<Uint8Array>> {
            throw new Error("source boom");
          }
        };
      }
    };
    await expectCode(() => createSeed(failingSource, new MemorySink()), ERROR_CODES.READ_FAILED);
    await expectCode(() => createSeed(chunks(Uint8Array.from([1, 2, 3]), 1), { write: async () => { throw new Error("sink boom"); } }), ERROR_CODES.WRITE_FAILED);
  });

  it("verifies a short standalone block without claiming it is final", () => {
    const block = new TextEncoder().encode("abc");
    const digest = Digest.fromHex("ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad");
    assert.equal(verifyBlock(block, digest).toHex(), digest.toHex());
  });
});
