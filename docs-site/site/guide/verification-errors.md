# Verification and errors

Get the expected `seed_hash` and any source size claim from a trusted upper-layer protocol. `VerifySeed` checks structure and the complete seed hash before digest contents are trusted; `VerifySeedForSourceSize` also binds digest count to the claimed size.

```go
if err != nil && masterseed.IsCode(err, masterseed.SeedHashMismatch) { /* retry or report integrity failure */ }
```

```ts
import {Digest, MasterSeedError, verifySeed} from 'masterseed';
try { await verifySeed(seed, Digest.fromHex(expectedHex)); }
catch (error) { if (error instanceof MasterSeedError) console.error(error.code); }
```

Go uses `VerifySeed` / `VerifySeedForSourceSize`; TypeScript uses `verifySeed` / `verifySeedForSourceSize`. For trusted member checks, Go provides `FindBlockHash` and `VerifyBlockInSeed`, while TypeScript provides `findBlockHash` and `verifyBlockInSeed`. Each operation consumes its readers/iterables once, so reopen or recreate them for a second pass.

Stable codes include `INVALID_SEED_LENGTH`, `SEED_HASH_MISMATCH`, `SEED_SIZE_MISMATCH`, `BLOCK_HASH_MISMATCH`, `SOURCE_TOO_SHORT`, `SOURCE_TOO_LONG`, `BLOCK_NOT_IN_SEED`, `BLOCK_SIZE_MISMATCH`, `TARGET_EXISTS`, `READ_FAILED`, `WRITE_FAILED`, and `ABORTED`. A zero `matchCount` is a normal query result.
