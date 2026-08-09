# Shared V1 vectors

`vectors.json` is language-neutral JSON. Its `source` field is a deterministic
recipe, not a language-specific stream representation:

- `empty`: no bytes;
- `hex`: decode `value`;
- `repeat`: repeat one byte for `size` bytes;
- `ramp8`: byte `i` is `i mod 256`;
- `segments`: concatenate repeated-byte segments.

`seed_bytes_hex` is an audit-friendly encoding of the raw binary seed. Tests
decode it before comparing bytes; the ASCII hex characters are never a seed
fixture.
