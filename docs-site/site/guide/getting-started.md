# Getting started

Install either SDK:

```sh
npm install masterseed
go get github.com/bsv8/MasterSeed
```

TypeScript core consumes async iterable bytes and reports sizes as `bigint`:

```ts
import {createSeed} from 'masterseed';
const source = (async function* () { yield new TextEncoder().encode('abc'); })();
const info = await createSeed(source, {write: async (bytes) => { /* persist raw 32-byte digest */ }});
console.log(info.seedHashHex); // 64-character lower-case hex for display
```

Go path helper (complete program):

```go
package main
import (
  "context"
  "fmt"
  masterseed "github.com/bsv8/MasterSeed"
)
func main() {
  info, err := masterseed.CreateSeedFile(context.Background(), "source.bin", "source.seed", masterseed.CreateSeedFileOptions{})
  if err != nil { panic(err) }
  fmt.Println(info.SeedHashHex)
}
```

Both SDKs implement Keymaster Seed V1: fixed 256 KiB blocks, raw SHA-256 digests, and `seed_hash = SHA256(seed_bytes)`.
