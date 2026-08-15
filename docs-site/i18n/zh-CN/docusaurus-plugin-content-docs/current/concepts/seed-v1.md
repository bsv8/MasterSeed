---
sidebar_position: 1
title: Keymaster Seed V1 字节格式
---

# Keymaster Seed V1 字节格式

格式只包含字节：

1. 将源数据切成固定 262144 字节（256 KiB）分块，最后一块可以更短。
2. 对每块执行 SHA-256，按源顺序拼接原始 32 字节摘要。
3. 对这段精确拼接结果计算 `seed_hash = SHA256(seed_bytes)`。

V1 没有 header、metadata 或内置源大小。十六进制只用于传输和展示，不是文件内容。空输入生成零字节 seed，其 hash 是对空字节序列执行 SHA-256 的结果。请用 `inspectSeed`/`InspectSeed` 检查结构，并从可信上层协议获取 hash 与源大小声明。
