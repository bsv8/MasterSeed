# Keymaster Seed V1 byte format

`BLOCK_SIZE = 262144` bytes (256 KiB), `DIGEST_SIZE = 32`, and SHA-256 are protocol constants. V1 has no header or metadata:

```text
seed_bytes = SHA256(block[0]) || SHA256(block[1]) || ...
seed_hash  = SHA256(seed_bytes)
```

Digests are raw binary bytes; hex is display/transport only. Empty input makes a zero-byte seed. Structural validity means only that the seed length is divisible by 32. Source size, name, algorithm, and version are outside the file.
