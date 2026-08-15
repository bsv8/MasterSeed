---
sidebar_position: 4
title: 错误与取消
---

import Tabs from '@theme/Tabs';
import TabItem from '@theme/TabItem';

# 错误与取消

不要解析错误消息。TypeScript 抛出带稳定 `error.code` 的 `MasterSeedError`；Go 返回 `*Error`，使用 `CodeOf` 或 `IsCode` 检查。`AbortSignal` 或 `context.Context` 取消时会报告 `ABORTED`。文件适配器还会报告 `READ_FAILED`、`WRITE_FAILED` 与 `TARGET_EXISTS`。

<Tabs groupId="sdk" queryString="sdk">
<TabItem value="typescript" label="TypeScript">

```ts
import {verifySeed, Digest, isMasterSeedError} from 'masterseed';
try { await verifySeed(seedBytes, Digest.fromHex(expectedHex)); }
catch (error) { if (isMasterSeedError(error)) console.error(error.code, error.context); else throw error; }
```

</TabItem>
<TabItem value="go" label="Go">

```go
info, err := masterseed.VerifySeed(ctx, seedReader, expected)
if err != nil { if masterseed.CodeOf(err) == masterseed.SeedHashMismatch { /* 拒绝 */ }; return }
_ = info
```

</TabItem>
</Tabs>

常见错误码包括 `INVALID_SEED_LENGTH`、`SEED_HASH_MISMATCH`、`SEED_SIZE_MISMATCH`、`BLOCK_HASH_MISMATCH`、`SOURCE_TOO_SHORT`、`SOURCE_TOO_LONG`、`BLOCK_NOT_IN_SEED`、`BLOCK_SIZE_MISMATCH`、`TARGET_EXISTS`、`READ_FAILED`、`WRITE_FAILED` 与 `ABORTED`。可信 hash 和源大小仍由调用方的上层协议提供。
