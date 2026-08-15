# Go streaming API

The root package uses `context.Context`, `io.Reader`, and `io.Writer`:

```go
info, err := masterseed.CreateSeed(ctx, sourceReader, seedWriter)
hash, err := masterseed.HashSeed(ctx, newSeedReader())
verified, err := masterseed.VerifySource(ctx, newSourceReader(), newSeedReader())
```

Each sequential reader is consumed once; `newSeedReader`/`newSourceReader` represent newly opened readers for each operation. `Digest` is a fixed 32-byte value; counters use `uint64`.
