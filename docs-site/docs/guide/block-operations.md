---
sidebar_position: 3
title: Block and membership operations
---

import Tabs from '@theme/Tabs';
import TabItem from '@theme/TabItem';

# Block and membership operations

All block indexes and source sizes are `bigint` in TypeScript and `uint64` in Go. Membership helpers authenticate the complete seed and bind its digest count to the trusted source size before returning a match.

<Tabs groupId="sdk" queryString="sdk">
<TabItem value="typescript" label="TypeScript">

```ts
import {Digest, findBlockHash, verifyBlockInSeed} from 'masterseed';

async function checkMembership(seedBytes: Uint8Array[], block: Uint8Array, sourceSize: bigint, trustedSeedHashHex: string, trustedBlockHashHex: string) {
  const expectedSeedHash = Digest.fromHex(trustedSeedHashHex); // supplied by a trusted protocol
  const expectedBlockHash = Digest.fromHex(trustedBlockHashHex);
  const matches = await findBlockHash(seedBytes, expectedSeedHash, sourceSize, expectedBlockHash);
  const checked = await verifyBlockInSeed(seedBytes, expectedSeedHash, sourceSize, block);
  console.log(matches.matchCount, checked.blockIndex);
}
```

`readBlockHash` additionally accepts a `RandomAccessSeed` (`readAt(offset, length)`) and checks `seedSize` and `blockIndex`; use it when random access is available. An empty match result is valid and distinct from a verification error.

</TabItem>
<TabItem value="go" label="Go">

```go
package main

import (
  "bytes"
  "context"
  "fmt"
  masterseed "github.com/bsv8/MasterSeed"
)

func checkMembership(ctx context.Context, seedBytes, block []byte, expected masterseed.Digest, sourceSize uint64, blockHash masterseed.Digest) error {
  matches, err := masterseed.FindBlockHash(ctx, bytes.NewReader(seedBytes), expected, sourceSize, blockHash)
  if err != nil { return err }
  checked, err := masterseed.VerifyBlockInSeed(ctx, bytes.NewReader(seedBytes), expected, sourceSize, block)
  if err != nil { return err }
  fmt.Println(matches.MatchCount, checked.BlockIndex)
  return nil
}
```

`ReadBlockHash` uses an `io.ReaderAt` and the exact seed size. Reopen readers for each operation because every streaming reader is consumed.

</TabItem>
</Tabs>
