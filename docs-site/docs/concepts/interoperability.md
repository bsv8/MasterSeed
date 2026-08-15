---
sidebar_position: 2
title: Interoperability
---

import Tabs from '@theme/Tabs';
import TabItem from '@theme/TabItem';

# Interoperability

Both SDKs implement the same byte contract; only the stream boundary is idiomatic to each language.

<Tabs groupId="sdk" queryString="sdk">
<TabItem value="typescript" label="TypeScript">

Core functions accept an `Iterable<Uint8Array>` or `AsyncIterable<Uint8Array>`. Counts, offsets, and sizes use `bigint`; Node path helpers live in `masterseed/node`.

</TabItem>
<TabItem value="go" label="Go">

Core functions accept `io.Reader`/`io.Writer`. Counts, offsets, and sizes use `uint64`; `CreateSeedFile` and `VerifySourceFile` are in the root package.

</TabItem>
</Tabs>

Input chunk boundaries do not affect protocol blocks: each implementation accumulates exactly 256 KiB before hashing. A reader that returns short chunks is still valid if it eventually supplies the same bytes. Compare raw seed bytes and `seed_hash`, not hex formatting, to establish cross-language equality.
