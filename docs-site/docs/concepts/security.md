---
sidebar_position: 3
title: Security and trust boundary
---

# Security and trust boundary

MasterSeed authenticates bytes against a caller-provided `seed_hash`; it does not identify or sign a publisher. Structural validity (`seed_size` being a multiple of 32) is not trust. A consumer should obtain the expected hash and, for source verification, the source size through a trusted upper-layer protocol.

The seed contains no header or metadata, so it cannot carry its own provenance, filename, or source length. Treat an untrusted seed as input: run `VerifySeed`/`verifySeed` before membership checks, and use `VerifySeedForSourceSize`/`verifySeedForSourceSize` or complete source verification when a trusted size is available. Streaming inputs are consumed once; reopen them for independent passes. Errors and context cancellation are part of the boundary, not evidence that a hash is trustworthy.
