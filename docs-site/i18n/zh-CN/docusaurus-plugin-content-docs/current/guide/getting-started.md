---
sidebar_position: 1
title: 快速开始
---

import Tabs from '@theme/Tabs';
import TabItem from '@theme/TabItem';

# 快速开始

安装 `masterseed` 或 Go 模块 `github.com/bsv8/MasterSeed`。两套 SDK 遵循相同的 Keymaster Seed V1：固定 256 KiB 分块、原始 32 字节 SHA-256 摘要，以及 `seed_hash = SHA256(seed_bytes)`。

<Tabs groupId="sdk" queryString="sdk">
<TabItem value="typescript" label="TypeScript">

```ts
import {createSeed} from 'masterseed';
const source = (async function* () { yield new TextEncoder().encode('abc'); })();
const seedBytes: Uint8Array[] = [];
const info = await createSeed(source, {write: async (digest) => { seedBytes.push(digest.slice()); }});
console.log(info.seedHashHex, seedBytes.length);
```

</TabItem>
<TabItem value="go" label="Go">

```go
package main
import ("context"; "fmt"; masterseed "github.com/bsv8/MasterSeed")
func main() {
  info, err := masterseed.CreateSeedFile(context.Background(), "source.bin", "source.seed", masterseed.CreateSeedFileOptions{})
  if err != nil { panic(err) }
  fmt.Println(info.SeedHashHex)
}
```

</TabItem>
</Tabs>

种子流和输入流都是一次消费；再次检查时请重新创建 iterable 或打开 reader。可信 hash 与源大小应由上层协议提供，而不是从 seed 的字节中推断。
