---
sidebar_position: 2
title: 创建与验证
---

import Tabs from '@theme/Tabs';
import TabItem from '@theme/TabItem';

# 创建与验证流程

创建过程逐块哈希源数据，并把原始 32 字节摘要写入 sink。验证必须使用可信上层协议提供的 `seed_hash`；如有源大小，也应绑定源大小。结构合法的 seed 本身不能证明发布者身份。

<Tabs groupId="sdk" queryString="sdk">
<TabItem value="typescript" label="TypeScript">

```ts
import {createSeed, verifySeed, Digest} from 'masterseed';
const source = (async function* () { yield new TextEncoder().encode('hello'); })();
const seedBytes: Uint8Array[] = [];
const info = await createSeed(source, {write: async (digest) => { seedBytes.push(digest.slice()); }});
const verified = await verifySeed(seedBytes, Digest.fromHex(info.seedHashHex));
console.log(verified.blockCount, verified.seedHashHex);
```

`ByteSource` 每次只消费一次；下一次验证请创建新的 iterable 或重新打开文件适配器。

</TabItem>
<TabItem value="go" label="Go">

```go
package main
import ("bytes"; "context"; "fmt"; masterseed "github.com/bsv8/MasterSeed")
func main() {
  ctx := context.Background(); var seed bytes.Buffer
  info, err := masterseed.CreateSeed(ctx, bytes.NewReader([]byte("hello")), &seed); if err != nil { panic(err) }
  verified, err := masterseed.VerifySeed(ctx, bytes.NewReader(seed.Bytes()), info.SeedHash); if err != nil { panic(err) }
  fmt.Println(verified.BlockCount, verified.SeedHashHex)
}
```

`io.Reader` 每次只消费一次；再次操作时请用 `bytes.NewReader(seed.Bytes())` 或重新打开 seed。

</TabItem>
</Tabs>
