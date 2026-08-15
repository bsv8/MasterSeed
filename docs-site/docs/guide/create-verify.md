---
sidebar_position: 2
title: Create and verify
---

import Tabs from '@theme/Tabs';
import TabItem from '@theme/TabItem';

# Create and verify workflows

Creation hashes each source block independently and writes raw 32-byte digests to a sink. Verification must use a `seed_hash` and, when available, a source size obtained from a trusted upper-layer protocol. A structurally valid seed alone is not proof of publisher intent.

<Tabs groupId="sdk" queryString="sdk">
<TabItem value="typescript" label="TypeScript">

```ts
import {createSeed, verifySeed, Digest} from 'masterseed';

const source = (async function* () { yield new TextEncoder().encode('hello'); })();
const seedBytes: Uint8Array[] = [];
const info = await createSeed(source, {write: async (digest) => { seedBytes.push(digest.slice()); }});
const expected = Digest.fromHex(info.seedHashHex); // obtain this from the trusted protocol in production
const verified = await verifySeed(seedBytes, expected);
console.log(verified.blockCount, verified.seedHashHex);
```

`ByteSource` iterables are consumed once. Create a new iterable (or reopen a file adapter) for every subsequent pass.

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

func main() {
  ctx := context.Background()
  var seed bytes.Buffer
  info, err := masterseed.CreateSeed(ctx, bytes.NewReader([]byte("hello")), &seed)
  if err != nil { panic(err) }
  expected := info.SeedHash
  verified, err := masterseed.VerifySeed(ctx, bytes.NewReader(seed.Bytes()), expected)
  if err != nil { panic(err) }
  fmt.Println(verified.BlockCount, verified.SeedHashHex)
}
```

`io.Reader` values are consumed once; use `bytes.NewReader(seed.Bytes())` or reopen the seed for another operation.

</TabItem>
</Tabs>
