# MasterSeed SDK 设计文档

## 1. 文档目的

本文是 Keymaster Seed V1 的规范性设计，定义种子文件的字节布局、计算规则、SDK 行为、错误模型和跨语言一致性要求。除非明确标为建议，本文件中的“必须”“不得”均属于实现约束。

相关文档：

- [需求文档](./requirements.md)
- [施工单](./implementation-plan.md)

## 2. 总体模型

MasterSeed 是一个顺序块摘要清单，不是 Merkle Tree。源文件按固定边界切分，每个块产生一个 32 字节 SHA-256 原始摘要；摘要按块顺序直接拼接成种子文件。种子文件的 SHA-256 是 `seed_hash`。

```text
source bytes
    │ split every 262144 bytes
    ▼
block[0], block[1], ..., block[n-1]
    │ SHA-256 each block
    ▼
hash[0], hash[1], ..., hash[n-1]       each item is 32 raw bytes
    │ binary concatenation in index order
    ▼
seed_bytes = hash[0] || hash[1] || ... || hash[n-1]
    │ SHA-256 over the exact seed file bytes
    ▼
seed_hash
```

## 3. 规范常量

| 名称 | 值 | 含义 |
|---|---:|---|
| `FORMAT` | `keymaster-seed-v1` | 协议上下文中的格式标识 |
| `BLOCK_SIZE` | 262144 | 256 KiB，以字节计 |
| `DIGEST_SIZE` | 32 | SHA-256 原始摘要长度 |
| `HASH_ALGORITHM` | SHA-256 | 块哈希和种子哈希算法 |

`256 KiB` 不得解释为 256000 字节。

## 4. 源文件分块

设源文件长度为 `L`，块编号 `i` 从 0 开始：

```text
start(i) = i × BLOCK_SIZE
end(i)   = min((i + 1) × BLOCK_SIZE, L)
block[i] = source[start(i):end(i)]
```

块数量：

```text
L = 0: block_count = 0
L > 0: block_count = floor((L - 1) / BLOCK_SIZE) + 1
```

该表达式避免在固定宽度整数中执行 `L + BLOCK_SIZE - 1` 时溢出。

约束：

- 除最后一个块外，每个块必须恰好为 262144 字节。
- 最后一个块长度范围是 1 至 262144 字节。
- 不为对齐文件追加长度为 0 的块。
- 空源文件不产生任何块。

## 5. 块哈希与种子文件布局

每个块的摘要定义为：

```text
block_hash[i] = SHA256(block[i])
```

`block_hash[i]` 是 **32 字节原始二进制值**。种子文件定义为：

```text
seed_bytes = block_hash[0] || ... || block_hash[n-1]
```

因此第 `i` 个块哈希在种子文件中的位置是：

```text
seed_offset(i) = i × 32
seed_bytes[seed_offset(i):seed_offset(i)+32]
```

种子文件大小：

```text
seed_size = block_count × 32
```

### 5.1 二进制存储要求

下列表示是正确的：

```text
[0xba, 0x78, 0x16, 0xbf, ...]          // 共 32 个字节
```

下列表示不得写入种子文件：

```text
"ba7816bf..."                          // 64 个 ASCII 字符
```

十六进制只是摘要的文本表示。若错误地把 hex 文本写入文件，每个块会占用 64 字节，不符合 V1 协议。

### 5.2 合法性

种子文件在结构上合法，当且仅当：

```text
seed_size mod 32 = 0
```

零字节种子文件合法。由于 V1 不含文件头，任意长度为 32 倍数的字节串都只能被判定为“结构合法”；其内容是否可信必须通过预期 `seed_hash` 建立。

## 6. 种子哈希和文本表示

种子哈希定义为：

```text
seed_hash = SHA256(seed_bytes)
```

计算输入必须是种子文件中的实际二进制字节，不是块摘要 hex 字符串，也不是整个种子文件的 hex 编码。

SDK 内部的规范值是 32 字节摘要。跨进程传播、JSON、日志和文件名使用 64 字符小写 hex：

```text
hex(seed_hash_raw)
```

Hex 解析规则：

- 输入长度必须恰好为 64 个字符；
- 允许 `A-F` 或 `a-f`，解析后输出统一小写；
- 不允许 `0x`；
- 不自动裁剪空白；
- 不允许分隔符或换行。

推荐文件名是 `<seed_hash>.seed`，但文件名不参与任何计算，也不能代替对文件内容的校验。

## 7. 格式属性与限制

V1 种子文件没有保存：

- 源文件总长度；
- 最后一个块的实际长度；
- 源文件名和路径；
- 哈希算法和块大小；
- 格式版本。

对于合法且非空的种子文件，只能由块数量 `n` 推断：

```text
(n - 1) × 262144 < source_size <= n × 262144
```

具体源文件长度只能在生成时记录、由外部协议提供，或在完整验证时观察得到。任何增加文件头或元数据的方案都会改变种子文件字节和 `seed_hash`，不得作为 V1 的兼容修改。

## 8. 核心算法

### 8.1 生成

输入是源字节流和种子输出流，输出是统计信息。

1. 初始化块计数、源字节计数和一个 seed SHA-256 状态。
2. 从源流累计读取最多 262144 字节。上游流的单次 chunk 大小不构成块边界。
3. 若首次读取即到达 EOF，则生成零个块。
4. 对实际读取的块字节计算 SHA-256，得到 32 字节原始摘要。
5. 将这 32 字节完整写入种子输出；短写必须继续写或返回错误。
6. 将相同的 32 字节送入 seed SHA-256 状态。
7. 更新计数并继续，直到源流 EOF。
8. 完成 seed SHA-256，返回结果。

禁止先把块摘要转成 hex 再写入种子输出。生成过程只需保留一个数据块、哈希状态和少量计数。

### 8.2 计算种子哈希

`HashSeed` 流式读取任意字节并返回 SHA-256，不对长度合法性作承诺。`InspectSeed` 在同一过程中累计字节数，并在 EOF 后要求总长度是 32 的整数倍。

将这两个语义分开，可以避免调用方把“能够计算 hash”错误理解为“种子格式合法”。

### 8.3 验证种子文件

严格验证顺序：

1. 流式计算实际 `seed_hash` 和种子大小。
2. 检查种子大小是否为 32 的整数倍。
3. 解码并检查调用方提供的预期摘要。
4. 比较实际摘要与预期摘要。
5. 返回块数量。

当种子文件来自不可信渠道时，应先完成这一步，再信任其中的块摘要。

### 8.4 验证完整源文件

完整验证需要同时检查块内容和文件边界：

1. 每次从种子输入精确读取 32 字节期望摘要。
2. 从源输入累计读取最多 262144 字节作为对应块。
3. 若仍有期望摘要但源输入已经没有字节，返回 `SOURCE_TOO_SHORT`。
4. 计算实际块摘要并比较；不匹配时返回块编号、源偏移、期望值和实际值。
5. 若实际块不足 262144 字节，则它必须是最后一块；种子文件中还有摘要时返回 `SOURCE_TOO_SHORT`。
6. 所有期望摘要消费完毕后，再尝试读取源输入；仍有字节则返回 `SOURCE_TOO_LONG`。
7. 种子输入最后不足 32 字节时返回 `INVALID_SEED_LENGTH`。

若便利接口同时接收预期 `seed_hash`，推荐先单独验证种子文件，再重置或重新打开种子输入执行源文件验证。不可重复读取的流式接口可以单遍同时计算，但只有在最终 `seed_hash` 匹配后才能返回成功。

### 8.5 验证单块

块 `i` 的源偏移和种子偏移分别是：

```text
source_offset = i × 262144
seed_offset   = i × 32
```

读取期望摘要后，对调用方提供的块字节计算 SHA-256 并比较。单块接口不得自行假定不足 262144 字节的块一定是最后一个块；这一事实需要块数量或源文件长度作为额外上下文。

## 9. 公开数据模型

两个 SDK 共享以下概念模型，实际名称遵循各语言命名习惯。

### 9.1 Digest

- 固定 32 字节，不允许任意长度。
- 支持从严格 hex 解析。
- 支持输出规范小写 hex。
- 不暴露可改变内部值的可变引用。

### 9.2 SeedInfo

| 字段 | 类型语义 | 说明 |
|---|---|---|
| format | 常量字符串 | `keymaster-seed-v1` |
| blockSize | 固定整数 | 262144 |
| blockCount | uint64 | 块数量 |
| sourceSize | uint64 / 可缺省 | 仅生成或源验证时可知 |
| seedSize | uint64 | 种子文件字节数 |
| seedHash | Digest | 32 字节摘要 |
| seedHashHex | string | 64 字符小写 hex，可作为派生属性 |

`InspectSeed` 不得伪造 `sourceSize`；该字段应缺省或使用不同结果类型表达未知。

## 10. SDK 操作面

### 10.1 语言无关操作

| 操作 | 输入 | 输出 | 说明 |
|---|---|---|---|
| CreateSeed | source stream, seed sink | SeedInfo | 流式生成 |
| HashSeed | seed stream | Digest | 只计算 hash |
| InspectSeed | seed stream | SeedInfo | 计算 hash 并检查结构 |
| VerifySeed | seed stream, expected digest | SeedInfo | 检查结构和预期 hash |
| VerifySource | source stream, seed stream | VerifyInfo | 完整逐块校验 |
| ReadBlockHash | random-access seed, index | Digest | 获取指定块摘要 |
| VerifyBlock | block bytes, expected digest | result | 校验单块摘要 |
| CreateSeedFile | source path, seed path, options | SeedInfo | 原子路径封装 |
| VerifySourceFile | source path, seed path, expected digest | VerifyInfo | 文件路径封装 |

### 10.2 Go 映射

- 顺序输入使用 `io.Reader`，输出使用 `io.Writer`。
- 随机访问种子使用 `io.ReaderAt`，并要求调用方提供或可获得文件大小。
- 操作取消采用 `context.Context`。
- 摘要采用固定长度值类型。
- 计数采用 `uint64`；转换到 `int64` 文件偏移前检查上界。
- 路径便利接口与核心流接口分层，核心逻辑不依赖文件系统。

### 10.3 TypeScript 映射

- 核心输入接受异步 `Uint8Array` 字节序列；不得把上游 chunk 当作协议块。
- 输出抽象支持异步、背压和完整写入。
- 取消采用 `AbortSignal`。
- 文件适配首先支持 Node 文件流，Web Stream 适配与核心协议解耦。
- 文件大小、块数量和偏移使用 `bigint`；只在已检查安全范围后转换为 `number`。
- 核心公开类型不要求调用方使用 Node `Buffer`。

## 11. 错误模型

错误代码是跨 SDK 的稳定语义，语言可分别实现为类型化错误或带 code 的错误对象。

| 错误代码 | 含义 | 推荐上下文 |
|---|---|---|
| `INVALID_SEED_LENGTH` | 种子长度不是 32 的整数倍 | seedSize |
| `INVALID_HASH_ENCODING` | 外部摘要文本不合法 | 不回显不可信大输入 |
| `SEED_HASH_MISMATCH` | 种子内容与预期 hash 不同 | expected, actual |
| `BLOCK_HASH_MISMATCH` | 源数据块摘要不匹配 | blockIndex, sourceOffset, expected, actual |
| `SOURCE_TOO_SHORT` | 源文件缺少种子描述的数据 | blockIndex, sourceOffset |
| `SOURCE_TOO_LONG` | 源文件存在额外数据 | blockIndex, sourceOffset |
| `BLOCK_INDEX_OUT_OF_RANGE` | 请求的块编号不存在 | blockIndex, blockCount |
| `INTEGER_OVERFLOW` | 大小或偏移无法安全表达 | operation |
| `TARGET_EXISTS` | 默认禁止覆盖时目标已存在 | target path |
| `READ_FAILED` | 底层读取失败 | cause |
| `WRITE_FAILED` | 底层写入失败 | cause |
| `ABORTED` | 调用方取消操作 | cause |
| `INVALID_ARGUMENT` | 调用方参数或源/目标路径关系不合法 | operation, path |

摘要不匹配错误中的 hex 仅用于诊断；它不会被写回种子文件。

## 12. 路径写入和失败原子性

`CreateSeedFile` 的目标发布流程：

1. 验证源路径与目标参数。
2. 在目标目录创建唯一临时文件。
3. 使用核心生成流程写入临时文件。
4. 刷新并关闭文件；是否要求持久化同步由明确选项控制。
5. 按覆盖策略发布到最终路径。
6. 任一步骤失败均关闭并删除临时文件。

默认覆盖策略为禁止覆盖。实现必须考虑源路径与目标路径指向同一文件的情况，不能在读取源文件前截断它。

## 13. 性能设计

- 默认采用顺序处理，基准实现只保留一个 256 KiB 块。
- 生成时同步将每个块摘要写入输出并送入 seed hash，无需二次读取。
- TypeScript 必须正确处理任意大小、包括零长度的上游 chunk。
- Go 必须正确处理合法的短读；单次 `Read` 返回不足一块不代表 EOF。
- 第一版不把并行哈希作为公开承诺。以后如增加 worker，必须按块编号有序写出，并明确限制 `workerCount × BLOCK_SIZE` 内存。

种子文件与源文件的理论大小比约为：

```text
32 / 262144 = 1 / 8192
```

即每 8 MiB 完整源数据对应约 1 KiB 种子数据，不计最后块取整。

## 14. 安全模型

`seed_hash` 提供内容完整性和内容寻址，不提供发布者身份认证。若攻击者可以同时替换种子文件和传播的 `seed_hash`，SDK 无法发现发布者被冒充。需要身份真实性时，应由 Keymaster 的可信信道或数字签名覆盖格式版本和 `seed_hash`。

验证数据块前应先通过可信渠道取得 `seed_hash` 并验证种子文件。仅验证一个未经认证种子文件中的块摘要不能建立信任。

实现还必须：

- 在执行 `index × size` 前检查溢出；
- 避免由不可信长度触发大块分配；
- 在取消或 I/O 错误后停止继续写出；
- 不在普通日志中输出源数据内容。

## 15. 共享测试向量

共享向量使用 JSON 保存元数据和 hex 表示，hex 只是测试文件描述方式。实际 `.seed` fixture 必须解码成原始二进制字节。

### 15.1 空输入

```text
source_size    = 0
block_count    = 0
seed_size      = 0
seed_bytes_hex = ""
seed_hash_hex  = e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855
```

### 15.2 UTF-8 字节 `abc`

```text
source_hex     = 616263
source_size    = 3
block_count    = 1
block_hash_hex = ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad
seed_size      = 32
seed_bytes_hex = ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad
seed_hash_hex  = 4f8b42c22dd3729b519ba6f68d2da7cc5b2d606d05daed5ad5128cc03e6c6358
```

注意：`seed_bytes_hex` 有 64 个 hex 字符，是对 **32 字节种子文件**的可读编码；种子文件本身不是这 64 个 ASCII 字符。

### 15.3 256 KiB 全零

```text
source_size    = 262144
block_count    = 1
block_hash_hex = 8a39d2abd3999ab73c34db2476849cddf303ce389b35826850f9a700589b4a90
seed_size      = 32
seed_hash_hex  = c67554c8836dd666772ca9eeccc27bde97704632fd4ca9bb898d775216cc18cf
```

### 15.4 必测边界与失败用例

- 1 字节、262143 字节、262144 字节、262145 字节；
- 两个相同块，验证重复摘要仍按顺序保留；
- 交换不同块，验证 `seed_hash` 改变；
- 将源流以不同 chunk 序列切分；
- 种子长度 1、31、33、63 字节；
- 修改种子文件一个 bit；
- 修改源文件每个边界附近的一个 bit；
- 源文件过短和过长；
- 超大块编号和偏移溢出；
- 读失败、写失败和取消。

## 16. 仓库组织

建议结构：

```text
MasterSeed/
├── README.md
├── LICENSE
├── docs/
│   ├── requirements.md
│   ├── design.md
│   └── implementation-plan.md
├── spec/                         protocol-focused public specification
├── testdata/v1/                  shared vectors and binary fixtures
├── go.mod                        Go module at repository root
├── Go SDK source and tests
└── typescript/
    ├── package.json
    ├── src/
    └── test/
```

实施时可从本文抽取面向 SDK 使用者的精简 `spec/seed-v1.md`；本文继续保留内部设计决策和实现约束。

## 17. 版本演进

V1 文件内部不可自描述。未来只要改变下列任一项，就必须定义新格式标识并保留 V1 解析器：

- 块大小；
- 哈希算法；
- 摘要长度；
- 种子文件头或元数据；
- 块摘要排列或编码方式。

不得根据文件长度猜测版本。版本必须来自调用参数或 Keymaster 外层协议。
