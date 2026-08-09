# SDK API 摘要

两个 SDK 的核心操作保持同一语义：`CreateSeed`、`HashSeed`、`InspectSeed`、
`VerifySeed`、`VerifySource`、`ReadBlockHash` 和 `VerifyBlock`。路径便利 API
分别是 Go 的 `CreateSeedFile` / `VerifySourceFile`，以及 TypeScript Node
入口的 `createSeedFile` / `verifySourceFile`。

## Go

根 module 是 `github.com/keymaster/masterseed`。核心流 API 使用
`context.Context`、`io.Reader` 和 `io.Writer`；摘要使用固定长度的 `Digest`
值类型。`SeedInfo.SourceSizeKnown` 为 `false` 时，表示源文件长度不能从
种子文件推断。

```go
info, err := masterseed.CreateSeed(ctx, sourceReader, seedWriter)
hash, err := masterseed.HashSeed(ctx, seedReader)
info, err := masterseed.InspectSeed(ctx, seedReader)
info, err := masterseed.VerifySeed(ctx, seedReader, expected)
verified, err := masterseed.VerifySource(ctx, sourceReader, seedReader)
blockHash, err := masterseed.ReadBlockHash(ctx, randomSeed, seedSize, blockIndex)
actual, err := masterseed.VerifyBlock(ctx, blockBytes, expected)
```

错误通过 `masterseed.CodeOf(err)` 或 `masterseed.IsCode(err, code)` 判断，不能
解析错误消息。`Error` 会在可用时提供 `BlockIndex`、`SourceOffset`、`Expected`
和 `Actual` 等诊断上下文。

## TypeScript

`@keymaster/masterseed` 不依赖 Node `Buffer`，核心输入是
`AsyncIterable<Uint8Array>`，输出 sink 的 `write` 必须在完整写入后 resolve。
所有大小、块编号和偏移都是 `bigint`。

```ts
const info = await createSeed(source, sink, signal);
const hash = await hashSeed(seed, signal);
const inspected = await inspectSeed(seed, signal);
const verifiedSeed = await verifySeed(seed, expected, signal);
const verifiedSource = await verifySource(source, seed, signal);
const blockHash = await readBlockHash(randomSeed, seedSize, blockIndex, signal);
const actual = verifyBlock(blockBytes, expected, signal);
```

Node 文件适配器从 `@keymaster/masterseed/node` 导入。`AbortSignal` 取消和
所有失败都抛出 `MasterSeedError`，通过 `error.code` 判断稳定错误码。

错误码与设计文档一致：

`INVALID_SEED_LENGTH`、`INVALID_HASH_ENCODING`、`SEED_HASH_MISMATCH`、
`BLOCK_HASH_MISMATCH`、`SOURCE_TOO_SHORT`、`SOURCE_TOO_LONG`、
`BLOCK_INDEX_OUT_OF_RANGE`、`INTEGER_OVERFLOW`、`TARGET_EXISTS`、
`READ_FAILED`、`WRITE_FAILED` 和 `ABORTED`。`INVALID_ARGUMENT` 用于路径和
公开参数的即时校验。

