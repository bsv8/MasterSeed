# TypeScript core async iterable API

`createSeed`, `hashSeed`, `inspectSeed`, `verifySeed`, `verifySource`, `findBlockHash`, and `verifyBlockInSeed` accept `ByteSource` (`AsyncIterable<Uint8Array> | Iterable<Uint8Array>`). Inputs are consumed once; create a fresh iterable for each pass.

```ts
import {Digest, verifySeedForSourceSize, expectedBlockSize} from 'masterseed';
const info = await verifySeedForSourceSize(seed, Digest.fromHex(expectedHex), sourceSize);
const blockLength = info.blockCount > 0n ? expectedBlockSize(sourceSize, info.blockCount - 1n) : 0n;
```

Counts, sizes, offsets, and indices are `bigint`. `Digest.fromHex` accepts exactly 64 hexadecimal characters and rejects whitespace and `0x` prefixes.
