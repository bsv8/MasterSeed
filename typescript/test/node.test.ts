import assert from "node:assert/strict";
import { mkdtemp, readdir, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, it } from "node:test";
import { createSeedFile, verifySourceFile } from "../src/node.ts";

describe("Node path adapter", () => {
  it("publishes raw seed bytes and verifies it", async () => {
    const directory = await mkdtemp(join(tmpdir(), "masterseed-test-"));
    const sourcePath = join(directory, "source.bin");
    const seedPath = join(directory, "seed.bin");
    await writeFile(sourcePath, Buffer.from("abc"));
    const info = await createSeedFile(sourcePath, seedPath, { chunkSize: 1 });
    const seed = await readFile(seedPath);
    assert.equal(seed.byteLength, 32);
    assert.equal(info.seedHashHex, "4f8b42c22dd3729b519ba6f68d2da7cc5b2d606d05daed5ad5128cc03e6c6358");
    await assert.rejects(() => createSeedFile(sourcePath, seedPath), (error: unknown) => (error as { code?: string }).code === "TARGET_EXISTS");
    await verifySourceFile(sourcePath, seedPath, info.seedHash);
  });

  it("cleans the temporary path after cancellation", async () => {
    const directory = await mkdtemp(join(tmpdir(), "masterseed-abort-"));
    const sourcePath = join(directory, "source.bin");
    const seedPath = join(directory, "seed.bin");
    await writeFile(sourcePath, Buffer.alloc(1024));
    const controller = new AbortController();
    controller.abort();
    await assert.rejects(() => createSeedFile(sourcePath, seedPath, {}, controller.signal), (error: unknown) => (error as { code?: string }).code === "ABORTED");
    assert.equal((await readdir(directory)).some((name) => name.includes(".masterseed-") || name === "seed.bin"), false);
  });
});
