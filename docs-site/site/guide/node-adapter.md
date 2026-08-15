# Node adapter

File paths live behind `masterseed/node`, not the core package:

```ts
import {createSeedFile, verifySourceFile} from 'masterseed/node';
import {Digest} from 'masterseed';
const info = await createSeedFile('source.bin', 'source.seed');
await verifySourceFile('source.bin', 'source.seed', Digest.fromHex(info.seedHashHex));
```

The default path writer refuses to overwrite an existing target and publishes via a temporary file. Failures and cancellation clean up the temporary file.
