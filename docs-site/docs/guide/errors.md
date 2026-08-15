---
sidebar_position: 4
title: Errors and cancellation
---

import Tabs from '@theme/Tabs';
import TabItem from '@theme/TabItem';

# Errors and cancellation

Do not parse error messages. TypeScript throws `MasterSeedError` with a stable `error.code`; Go returns an `*Error` inspected with `CodeOf` or `IsCode`. `ABORTED` is reported when an `AbortSignal` or `context.Context` cancels work. File adapters add `READ_FAILED`, `WRITE_FAILED`, and `TARGET_EXISTS` without changing the core format.

<Tabs groupId="sdk" queryString="sdk">
<TabItem value="typescript" label="TypeScript">

```ts
import {verifySeed, Digest, isMasterSeedError} from 'masterseed';

try {
  await verifySeed(seedBytes, Digest.fromHex(expectedHex));
} catch (error) {
  if (isMasterSeedError(error)) console.error(error.code, error.context);
  else throw error;
}
```

</TabItem>
<TabItem value="go" label="Go">

```go
info, err := masterseed.VerifySeed(ctx, seedReader, expected)
if err != nil {
  if masterseed.CodeOf(err) == masterseed.SeedHashMismatch { /* reject */ }
  return
}
_ = info
```

</TabItem>
</Tabs>

Important codes include `INVALID_SEED_LENGTH`, `SEED_HASH_MISMATCH`, `SEED_SIZE_MISMATCH`, `BLOCK_HASH_MISMATCH`, `SOURCE_TOO_SHORT`, `SOURCE_TOO_LONG`, `BLOCK_NOT_IN_SEED`, `BLOCK_SIZE_MISMATCH`, `TARGET_EXISTS`, `READ_FAILED`, `WRITE_FAILED`, and `ABORTED`. A valid structure is still only as trustworthy as the expected hash and source size supplied by the caller.
