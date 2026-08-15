# Go file helpers

`CreateSeedFile` writes through a temporary file and, by default, will not overwrite an existing target. `VerifySourceFile` authenticates the seed hash before reopening it for complete source verification:

```go
expected, err := masterseed.ParseDigestHex(seedHashHex)
if err != nil { panic(err) }
info, err := masterseed.VerifySourceFile(ctx, "source.bin", "source.seed", expected)
```
