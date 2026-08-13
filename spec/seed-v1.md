# Keymaster Seed V1

This is the public, byte-level format specification for `keymaster-seed-v1`.

## Constants

- `BLOCK_SIZE = 262144` bytes (`256 KiB`, not `256000` bytes)
- `DIGEST_SIZE = 32` bytes
- hash algorithm: SHA-256

The seed file has no header or metadata. For a source of length `L`, split the
source into consecutive blocks of at most `BLOCK_SIZE` bytes. Empty input has
zero blocks; an input whose length is exactly a multiple of `BLOCK_SIZE` has no
extra empty block.

For each block, compute its SHA-256 digest and concatenate the **raw 32 digest
bytes** in block order:

```text
seed_bytes = SHA256(block[0]) || SHA256(block[1]) || ...
seed_hash  = SHA256(seed_bytes)
```

Hexadecimal text is only a transport and display encoding. It is not written
to the seed file. One source block therefore produces a 32-byte seed, not a
64-byte ASCII file. `seed_hash` is represented internally as 32 bytes and as
64 lower-case hex characters in JSON, logs, and filenames.

The seed is structurally valid when its byte length is divisible by 32. A
structurally valid seed is not trusted until its `seed_hash` has been checked
against a value obtained through a trusted channel. `seed_hash` is a content
integrity identifier, not a publisher signature.

The V1 format does not encode source length, source name, block size, hash
algorithm, or version. The surrounding protocol must identify the format as
`keymaster-seed-v1`.
