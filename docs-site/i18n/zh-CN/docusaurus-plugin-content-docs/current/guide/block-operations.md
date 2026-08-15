---
sidebar_position: 3
title: 分块与成员操作
---

import Tabs from '@theme/Tabs';
import TabItem from '@theme/TabItem';

# 分块与成员操作

TypeScript 使用 `bigint`，Go 使用 `uint64` 表示分块索引和源大小。成员查询会先认证完整 seed，并将摘要数量绑定到可信源大小，然后才返回匹配结果。

<Tabs groupId="sdk" queryString="sdk">
<TabItem value="typescript" label="TypeScript">

```ts
import {Digest, findBlockHash, verifyBlockInSeed} from 'masterseed';
async function checkMembership(seedBytes: Uint8Array[], block: Uint8Array, sourceSize: bigint, trustedSeedHashHex: string, trustedBlockHashHex: string) {
  const expected = Digest.fromHex(trustedSeedHashHex); // 由可信协议提供
  const blockHash = Digest.fromHex(trustedBlockHashHex);
  const matches = await findBlockHash(seedBytes, expected, sourceSize, blockHash);
  const checked = await verifyBlockInSeed(seedBytes, expected, sourceSize, block);
  console.log(matches.matchCount, checked.blockIndex);
}
```

`readBlockHash` 接受实现 `readAt(offset, length)` 的 `RandomAccessSeed`，并检查 `seedSize` 与 `blockIndex`。没有匹配是正常结果，不等同于验证错误。

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

`ReadBlockHash` 使用 `io.ReaderAt` 和精确 seed 大小。流式 reader 会被消费，请为每次操作重新打开。

</TabItem>
</Tabs>
