# Interoperability

Go and TypeScript implement the same byte contract. Async iterable chunk sizes and Go reader short reads do not define protocol blocks. Reproduce the same `seed_bytes` and `seed_hash` across languages, then use the language-native API (`uint64` in Go, `bigint` in TypeScript).
