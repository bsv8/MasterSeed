---
sidebar_position: 1
title: Keymaster Seed V1 byte format
---

# Keymaster Seed V1 byte format

The format is deliberately only bytes:

1. Split the source into fixed 262144-byte (256 KiB) blocks; the final block may be shorter.
2. Hash each block with SHA-256 and concatenate each raw 32-byte digest in source order.
3. Compute `seed_hash = SHA256(seed_bytes)` over that exact concatenation.

V1 has no header, metadata, or embedded source size. Hex is a transport/display representation, not file content. Empty input creates a zero-byte seed and its hash is SHA-256 of the empty byte sequence. Use `inspectSeed`/`InspectSeed` for structure and obtain trusted hash and source-size claims from an upper-layer protocol.
