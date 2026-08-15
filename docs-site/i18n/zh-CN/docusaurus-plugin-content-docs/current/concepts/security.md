---
sidebar_position: 3
title: 安全与信任边界
---

# 安全与信任边界

MasterSeed 将字节与调用方提供的 `seed_hash` 比较，但不会识别或签名发布者。结构有效（例如 `seed_size` 是 32 的倍数）不等于可信。消费者应通过可信上层协议获得预期 hash；验证源数据时还要获得源大小。

seed 不含 header 或 metadata，无法携带来源、文件名或源长度。将不可信 seed 当作输入：先运行 `VerifySeed`/`verifySeed`，再执行成员查询；有可信大小时使用 `VerifySeedForSourceSize`/`verifySeedForSourceSize` 或完整源验证。流式输入只消费一次，独立检查需重新打开。错误与取消属于边界处理，并不能证明 hash 来源可信。
