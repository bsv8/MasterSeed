---
sidebar_position: 2
title: 互操作性
---

import Tabs from '@theme/Tabs';
import TabItem from '@theme/TabItem';

# 互操作性

两个 SDK 实现相同的字节契约，只在流边界上采用各自语言的习惯。

<Tabs groupId="sdk" queryString="sdk">
<TabItem value="typescript" label="TypeScript">

核心函数接受 `Iterable<Uint8Array>` 或 `AsyncIterable<Uint8Array>`；大小、偏移和计数使用 `bigint`。Node 路径助手位于 `masterseed/node`。

</TabItem>
<TabItem value="go" label="Go">

核心函数接受 `io.Reader`/`io.Writer`；大小、偏移和计数使用 `uint64`。`CreateSeedFile` 与 `VerifySourceFile` 位于根 package。

</TabItem>
</Tabs>

输入分块边界不会改变协议分块：实现会累积精确 256 KiB 后再哈希。只要最终字节相同，短读也不会影响结果。跨语言比较应使用原始 seed 字节和 `seed_hash`，不要比较十六进制格式。
