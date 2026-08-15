---
sidebar_position: 1
---
# Getting started

import Tabs from '@theme/Tabs';
import TabItem from '@theme/TabItem';

Install `masterseed` with `npm install masterseed` or the Go module `github.com/bsv8/MasterSeed`. Both SDKs implement Keymaster Seed V1: 256 KiB blocks, raw 32-byte SHA-256 digests, and `seed_hash = SHA256(seed_bytes)`.

<Tabs groupId="sdk" queryString="sdk"><TabItem value="typescript" label="TypeScript">
```tsx
import {createSeed} from 'masterseed';
const source = (async function*(){ yield new TextEncoder().encode('abc'); })();
const seedBytes: Uint8Array[] = [];
const info = await createSeed(source, {write: async rawDigest => { seedBytes.push(rawDigest.slice()); }});
```

</TabItem><TabItem value="go" label="Go">
```go
package main
import("context";"fmt"; masterseed "github.com/bsv8/MasterSeed")
func main(){ info,err:=masterseed.CreateSeedFile(context.Background(),"source.bin","source.seed",masterseed.CreateSeedFileOptions{}); if err!=nil{panic(err)}; fmt.Println(info.SeedHashHex) }
```
</TabItem></Tabs>
