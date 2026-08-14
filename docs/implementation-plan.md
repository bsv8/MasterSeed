# MasterSeed SDK 施工单

> 实施状态：V1 施工项已落地。Go、TypeScript、共享向量、Node/Go 路径适配、
> 自动化检查和 API 文档均在仓库中；以下清单保留为逐项验收依据。

## 1. 施工目标

按照[需求文档](./requirements.md)和[设计文档](./design.md)实现 Keymaster Seed V1 的 Go 与 TypeScript SDK，并通过共享测试向量证明两种实现字节级兼容。

本施工单是任务拆分和验收清单，不在其中重新定义协议。遇到歧义时，以设计文档为准；若实现需要改变种子文件字节，必须先修改并重新评审协议，而不是直接改代码。

## 2. 总体完成定义

全部满足才可发布 V1：

- [ ] Go 和 TypeScript 的核心生成、检查、完整验证和单块验证均完成。
- [ ] 两个 SDK 使用同一份共享测试向量，所有结果一致。
- [ ] 任意块在种子文件中只占 32 字节原始二进制，测试明确阻止 hex 文本落盘。
- [ ] 空文件和 256 KiB 边界测试通过。
- [ ] 错误代码、取消、短读、短写和路径失败清理测试通过。
- [ ] 公开 API 文档和最小使用示例完成。
- [ ] 格式规范、代码、测试和 README 对同一常量及术语没有冲突。
- [ ] 自动化检查在干净环境中通过。

## 3. 任务依赖图

```text
MS-001 协议与工程骨架
    ├── MS-002 共享测试向量
    ├── MS-003 Go 基础类型
    │       ├── MS-004 Go 生成与检查
    │       └── MS-005 Go 验证
    │               └── MS-006 Go 路径封装
    └── MS-007 TypeScript 基础类型
            ├── MS-008 TypeScript 生成与检查
            └── MS-009 TypeScript 验证
                    └── MS-010 TypeScript 路径封装

MS-002 + MS-004 + MS-005 + MS-008 + MS-009
    └── MS-011 跨语言一致性测试
            └── MS-012 文档、CI 与发布检查
```

Go 与 TypeScript 两条实现线可以并行，但 `MS-001` 和测试向量结构必须先冻结。

## 4. 施工原则

1. 先测试向量，后核心实现，再路径封装。
2. 先完成正确的顺序流式版本，不在 V1 首次实现中引入并行 worker。
3. 核心算法不依赖文件系统，路径 API 只做资源管理和原子发布。
4. 任何示例中出现的 hex 都必须注明它是展示编码，不是种子文件存储格式。
5. 每个任务合并前必须包含正向、边界和失败测试。
6. 不在同一任务中顺带加入 CLI、网络下载或签名能力。

## 5. 详细施工单

### MS-001 协议规范与工程骨架

**目标**

建立双 SDK 单仓结构，并将设计文档中的格式部分抽取为稳定的公开规范。

**工作内容**

- [ ] 建立根 Go module。
- [ ] 建立 `typescript/` package。
- [ ] 建立 `spec/seed-v1.md` 和 `testdata/v1/`。
- [ ] 在两种语言中预留单元测试、集成测试和共享向量测试目录。
- [ ] 明确包名、公开模块名、最低运行时版本和许可证元数据。
- [ ] 配置基础格式化、静态检查和测试命令。

**产物**

- 工程清单文件；
- 公开 V1 格式规范；
- 可运行但尚无业务实现的测试骨架。

**验收**

- Go 和 TypeScript 各自的空测试套件可在本地执行。
- `BLOCK_SIZE=262144`、`DIGEST_SIZE=32`、`SHA-256` 在公开规范中只有一种解释。
- 规范明确写出种子文件保存原始二进制摘要，不保存 hex 文本。

**依赖**：无。

---

### MS-002 共享测试向量与 fixture

**目标**

建立不依赖任一 SDK 实现的黄金数据，作为跨语言兼容基线。

**工作内容**

- [ ] 定义向量 JSON schema，包括源数据描述、块摘要 hex、种子内容 hex、大小和 `seed_hash`。
- [ ] 为小输入保存可审核的内联 hex。
- [ ] 为大输入使用确定性生成规则，避免无意义提交大型源文件。
- [ ] 保存必要的二进制 `.seed` fixture 或在测试中从已审核 hex 解码。
- [ ] 加入空输入、`abc`、256 KiB 全零、262143/262144/262145 字节和多块向量。
- [ ] 加入顺序变化和重复块向量。
- [ ] 对测试向量本身做 schema 和长度自检。

**关键防回归断言**

- [ ] `abc` 的 `seed_size` 是 32，不是 64。
- [ ] 单块 fixture 的文件长度是 32。
- [ ] 二块 fixture 的文件长度是 64。
- [ ] `len(seed_bytes_hex) / 2 == seed_size`。
- [ ] `seed_hash` 是对解码后的 seed bytes 计算，不是对 hex 字符串计算。

**验收**

- 向量能由独立的标准 SHA-256 工具复核。
- 向量格式不包含语言专属字段。
- 测试数据生成步骤可重复且有说明。

**依赖**：MS-001。

---

### MS-003 Go 基础类型、常量和错误

**目标**

建立 Go SDK 的稳定基础模型，不实现完整文件流程。

**工作内容**

- [ ] 定义格式、块大小和摘要大小常量。
- [ ] 定义固定 32 字节 Digest 值类型。
- [ ] 实现严格 hex 解析和规范小写输出。
- [ ] 定义 SeedInfo、VerifyInfo 及未知 `source_size` 的明确表达。
- [ ] 定义稳定错误类型/代码和结构化上下文。
- [ ] 实现安全的块编号、种子偏移和源偏移计算。

**测试**

- [ ] Digest 长度和复制/不可变语义。
- [ ] 大小写 hex 输入、规范小写输出。
- [ ] 拒绝 `0x`、空白、奇数长度、非 hex 和非 64 字符输入。
- [ ] 偏移边界和溢出。
- [ ] 错误可通过类型或 code 判断。

**验收**

- 公开接口不能构造长度错误的 Digest。
- 计数和偏移没有未检查的窄化转换。

**依赖**：MS-001。

---

### MS-004 Go 流式生成和种子检查

**目标**

完成 Go 核心生成、hash 和 inspect 能力。

**工作内容**

- [ ] 实现流式 CreateSeed。
- [ ] 正确处理 `io.Reader` 合法短读和 `(n > 0, EOF)` 情况。
- [ ] 确保每个块只写 32 字节原始摘要。
- [ ] 写种子文件的同时流式计算 `seed_hash`。
- [ ] 实现 HashSeed 和严格 InspectSeed。
- [ ] 接入上下文取消。
- [ ] 保留底层 I/O cause，并映射稳定错误代码。

**测试**

- [ ] 共享合法向量。
- [ ] 每次只返回 1 字节或随机长度的 reader。
- [ ] 零长度 read、短写、写失败、读失败和取消。
- [ ] 内存使用不随源文件线性增长。
- [ ] 输出长度恒等于 `block_count × 32`。

**验收**

- 所有共享向量输出逐字节一致。
- 实现中不存在把块摘要格式化为 hex 后写入 sink 的路径。

**依赖**：MS-002、MS-003。

---

### MS-005 Go 验证能力

**目标**

完成种子验证、完整源文件验证、读取块摘要和单块验证。

**工作内容**

- [ ] 实现 VerifySeed。
- [ ] 实现 VerifySource，并检查短源、长源和截断种子。
- [ ] 实现 ReadBlockHash。
- [ ] 实现 VerifyBlock。
- [ ] 摘要不匹配时返回块编号、偏移、期望值和实际值。
- [ ] 接入取消和安全摘要比较。

**测试**

- [ ] 共享合法向量完整验证。
- [ ] 每个块首字节、末字节及块边界附近变异。
- [ ] 源文件为空、过短、过长。
- [ ] 种子长度为 1、31、33、63 字节。
- [ ] seed hash 不匹配。
- [ ] 块编号越界和偏移溢出。
- [ ] 验证失败的错误分类及上下文字段。

**验收**

- 所有失败模式能稳定区分。
- 不可信种子在便利验证流程中先验证结构和 `seed_hash`。

**依赖**：MS-002、MS-003、MS-004。

---

### MS-006 Go 文件路径封装

**目标**

提供符合 Go 使用习惯的文件便利接口和失败原子性。

**工作内容**

- [ ] 实现 CreateSeedFile 和 VerifySourceFile。
- [ ] 目标同目录临时文件写入后发布。
- [ ] 默认禁止覆盖，提供显式覆盖选项。
- [ ] 检查源和目标指向同一文件的风险。
- [ ] 所有失败路径关闭资源并清理临时文件。
- [ ] 定义可选持久化同步行为。

**测试**

- [ ] 成功发布。
- [ ] 目标已存在。
- [ ] 源目标相同。
- [ ] 中途取消、写失败和重命名失败。
- [ ] 失败后目标未被半成品污染，临时文件被清理。

**验收**

- 路径接口复用核心算法，不复制哈希逻辑。
- 默认行为不会静默覆盖已有种子文件。

**依赖**：MS-005。

---

### MS-007 TypeScript 基础类型、常量和错误

**目标**

建立与 Go 语义一致、符合 TypeScript 习惯的基础模型。

**工作内容**

- [ ] 定义常量和只读 Digest 抽象。
- [ ] 实现严格 hex 解析与规范输出。
- [ ] 定义 SeedInfo、VerifyInfo 和错误 code 联合类型。
- [ ] 块数量、文件大小和偏移采用 `bigint`。
- [ ] 实现安全的 `bigint` 到运行时索引转换。
- [ ] 定义异步字节源、异步 sink 和取消接口。

**测试**

- [ ] 与 MS-003 相同的 hex、长度、错误和溢出场景。
- [ ] 调用方无法通过公开引用修改已返回 Digest。
- [ ] 对超过安全整数范围的值不发生隐式精度丢失。

**验收**

- 公开核心类型不强制依赖 Node `Buffer`。
- 错误 code 与设计文档完全一致。

**依赖**：MS-001。

---

### MS-008 TypeScript 流式生成和种子检查

**目标**

完成 TypeScript 核心生成、hash 和 inspect 能力。

**工作内容**

- [ ] 将任意 `Uint8Array` chunk 累计成协议块。
- [ ] 实现 CreateSeed、HashSeed 和 InspectSeed。
- [ ] 使用流式 SHA-256 计算 seed hash。
- [ ] 输出支持异步背压并保证完整写入。
- [ ] 支持 `AbortSignal`。
- [ ] 不把 Node stream 的 chunk 边界当成块边界。

**测试**

- [ ] 共享合法向量。
- [ ] 同一源数据使用 1 字节、随机、跨边界和超大 chunk 输入。
- [ ] 包含空 chunk 的输入。
- [ ] sink 背压、写失败、读失败和取消。
- [ ] 输出长度始终为 `block_count × 32`。

**验收**

- 与 Go 对同一向量输出逐字节一致。
- 没有为 seed hash 保存整个种子文件。
- 没有把块摘要 hex 字符串编码进输出。

**依赖**：MS-002、MS-007。

---

### MS-009 TypeScript 验证能力

**目标**

完成与 Go 对等的所有验证能力。

**工作内容**

- [ ] 实现 VerifySeed、VerifySource、ReadBlockHash 和 VerifyBlock。
- [ ] 对流式 seed 输入正确处理不足 32 字节的尾部。
- [ ] 区分源过短、源过长、块不匹配和 seed hash 不匹配。
- [ ] 返回与 Go 一致的错误上下文。
- [ ] 支持取消。

**测试**

- [ ] 与 MS-005 相同的成功和失败矩阵。
- [ ] 各种 source/seed chunk 组合。
- [ ] `bigint` 块编号越界。
- [ ] Node 与纯 `Uint8Array` 适配输入得到一致结果。

**验收**

- 失败分类与 Go 一致。
- 任意输入 chunk 切分不改变验证结论。

**依赖**：MS-002、MS-007、MS-008。

---

### MS-010 TypeScript 文件路径封装

**目标**

提供 Node 文件路径便利接口和安全发布行为。

**工作内容**

- [ ] 实现 CreateSeedFile 和 VerifySourceFile。
- [ ] 同目录临时写入、关闭和原子发布。
- [ ] 默认禁止覆盖，提供显式覆盖选项。
- [ ] 检查源目标相同文件。
- [ ] 失败和取消后清理句柄及临时文件。
- [ ] 保持核心 package 与 Node 专属适配层边界清晰。

**测试**

- [ ] 与 MS-006 相同的路径场景。
- [ ] 不同 stream high-water mark 不影响结果。
- [ ] 文件句柄在所有失败路径关闭。

**验收**

- 路径接口不复制核心哈希实现。
- 失败时不暴露目标名称下的半成品。

**依赖**：MS-009。

---

### MS-011 跨语言一致性和互操作测试

**目标**

证明 Go 生成的种子可由 TypeScript 验证，反向亦然。

**工作内容**

- [ ] 两种实现分别消费 `testdata/v1` 全部向量。
- [ ] Go 生成二进制种子，TypeScript inspect 和 verify。
- [ ] TypeScript 生成二进制种子，Go inspect 和 verify。
- [ ] 比较实际文件字节、大小、块数量和 `seed_hash`。
- [ ] 加入检测 ASCII hex 误写的显式守卫。
- [ ] 加入随机但有固定 seed 的属性测试或模糊测试语料。

**验收**

- 每个互操作方向均通过。
- 任何实现把单块 hash 写成 64 个 ASCII 字节时，测试必然失败。
- 失败向量在两种 SDK 中得到同类错误 code。

**依赖**：MS-002、MS-004、MS-005、MS-008、MS-009。

---

### MS-012 文档、自动化检查和发布准备

**目标**

让 SDK 可被 Keymaster 集成并具备可重复发布条件。

**工作内容**

- [ ] 为两个 SDK 编写生成、验证种子和验证单块的最小示例。
- [ ] 在 README 中说明格式、安全边界和包入口。
- [ ] 生成或维护公开 API 文档。
- [ ] 配置格式化、静态检查、单元测试和跨语言测试自动化。
- [ ] 检查 Go module 和 TypeScript package 的许可证、版本和发布文件。
- [ ] 记录兼容性承诺和 V2 变更规则。
- [ ] 在发布包内容检查中确认测试 fixture 不因 `*.seed` ignore 规则被遗漏；必要时添加精确的反忽略规则。

**验收**

- 新使用者仅根据 README 和 API 文档即可完成生成与验证。
- 自动化环境从干净检出开始能执行全部检查。
- 发布包包含规范所需文件，不包含临时文件、构建缓存或测试生成物。
- 文档中的所有示例 hash 为连续值，不通过视觉换行造成多个 hash 的歧义。

**依赖**：MS-006、MS-010、MS-011。

## 6. 推荐实施批次

### 批次 A：冻结协议和测试基线

- MS-001
- MS-002

退出条件：无需 SDK 代码即可独立复核所有黄金向量。

### 批次 B：Go SDK

- MS-003
- MS-004
- MS-005
- MS-006

退出条件：Go 完成功能和共享向量测试，可作为参考实现。

### 批次 C：TypeScript SDK

- MS-007
- MS-008
- MS-009
- MS-010

退出条件：TypeScript 独立通过相同测试矩阵。

### 批次 D：互操作和发布

- MS-011
- MS-012

退出条件：双向互操作通过，文档和自动化检查齐全。

## 7. 每个任务的提交检查

每张施工单完成时执行：

- [ ] 变更范围只覆盖本任务。
- [ ] 新行为有测试，失败行为有错误断言。
- [ ] 格式化和静态检查通过。
- [ ] 没有把原始摘要和 hex 文本混用。
- [ ] 没有使用文件名、时间戳等非内容数据参与 hash。
- [ ] 没有因单次短读错误地产生额外块。
- [ ] 没有未检查的整数转换或偏移乘法。
- [ ] 取消和 I/O 失败不会继续写入。
- [ ] 公开行为与需求、设计文档一致。

## 8. 暂不施工项目

以下需求需要单独立项，不应阻塞 V1 SDK：

- CLI；
- 并行块哈希；
- 浏览器文件系统便利接口；
- 下载器或 P2P 传输；
- 数字签名；
- 带元数据的 V2 文件头；
- 其他块大小或哈希算法；
- 性能基准之外的硬件加速。

## 9. SDK v1.1 可信 Seed 成员验证施工单

> 本节只扩展 SDK 操作面，不改变 `keymaster-seed-v1` 的任何字节、常量或
> 兼容性规则。Go 与 TypeScript 必须在同一个版本中提供对等能力。建议发布
> 版本为 SDK `v1.1.0`。
>
> 实施状态：MS-013 至 MS-017 已完成代码、测试、文档和独立核查；MS-018 的
> 延期边界保持有效。版本号与发布制品更新留给正式发布步骤。

### MS-013 按源文件大小验证 Seed

**公开操作**

```go
func VerifySeedForSourceSize(
    ctx context.Context,
    seed io.Reader,
    expectedSeedHash Digest,
    sourceSize uint64,
) (SeedInfo, error)
```

TypeScript 对应 `verifySeedForSourceSize(seed, expectedSeedHash, sourceSize, signal)`，
所有大小继续使用 `bigint`。

**实现约束**

- 单次流式读取完成结构、SeedHash 和块数量验证，不缓存完整 Seed。
- 成功时 `SourceSizeKnown`/`sourceSizeKnown` 为 `true`，结果中的 source size
  等于调用方输入。
- 期望块数必须通过 `BlockCountForSourceSize`/`blockCountForSourceSize` 推导。
- 错误优先级固定为：读取或取消、`INVALID_SEED_LENGTH`、
  `SEED_HASH_MISMATCH`、`SEED_SIZE_MISMATCH`。
- `SEED_SIZE_MISMATCH` 表示 Seed 结构合法且 hash 正确，但摘要数量与声明的
  source size 不相符；错误上下文至少提供实际 seed size，并应提供期望 seed
  size或期望块数。

### MS-014 计算指定块的协议长度

**公开操作**

```go
func ExpectedBlockSize(sourceSize, blockIndex uint64) (uint64, error)
```

TypeScript 对应 `expectedBlockSize(sourceSize, blockIndex): bigint`。

**实现约束**

- 空文件没有合法块，越界统一返回 `BLOCK_INDEX_OUT_OF_RANGE`。
- 非尾块返回 `BlockSize`；非对齐尾块返回余数；对齐文件的尾块仍返回
  `BlockSize`。
- TypeScript 拒绝负数和超过 uint64 范围的输入。
- 优先使用块数和余数计算，避免不必要的 `blockIndex * BlockSize` 溢出路径。

### MS-015 在可信 Seed 中查找块摘要

**公开操作**

```go
type BlockMatches struct {
    SeedInfo
    MatchCount uint64
    FirstIndex uint64
    LastIndex  uint64
}

func FindBlockHash(
    ctx context.Context,
    seed io.Reader,
    expectedSeedHash Digest,
    sourceSize uint64,
    blockHash Digest,
) (BlockMatches, error)
```

TypeScript 返回同语义的 `BlockMatches`，索引与计数使用 `bigint`。

**实现约束**

- 单次、固定内存流式扫描；按 32 字节摘要边界比较，不能做任意字节子串搜索。
- 找到匹配后不得提前返回，必须继续至 EOF，完成 Seed 结构、SeedHash 和
  source size 关联验证。
- 重复摘要合法；返回总匹配数以及首、末匹配索引。
- `MatchCount == 0` 是成功查询结果，不返回 `BLOCK_NOT_IN_SEED`；此时首、末
  索引没有语义，调用方必须先检查匹配数。
- `expectedSeedHash` 与 `sourceSize` 仅提供完整性绑定，其可信来源仍由上层协议
  负责。

### MS-016 验证块属于可信 Seed

**公开操作**

```go
type VerifiedBlock struct {
    SeedInfo
    BlockHash  Digest
    BlockIndex uint64
    BlockSize  uint64
}

func VerifyBlockInSeed(
    ctx context.Context,
    seed io.Reader,
    expectedSeedHash Digest,
    sourceSize uint64,
    block []byte,
) (VerifiedBlock, error)
```

TypeScript 提供同语义的 `verifyBlockInSeed`。

**实现约束**

- 先计算调用方 block 的 SHA-256，但任何成员结论只能在完整扫描并验证 Seed 后
  返回。
- 同一摘要可出现多次；只要至少一个匹配位置的 `ExpectedBlockSize` 与实际 block
  长度相同即成功，并返回第一个满足摘要和长度条件的位置。
- 摘要完全不存在返回 `BLOCK_NOT_IN_SEED`；摘要存在但所有匹配位置长度均不符
  返回 `BLOCK_SIZE_MISMATCH`。
- 空 block、超大 block、空源文件、对齐尾块、非对齐尾块和重复摘要均必须有
  明确测试。

### MS-017 错误、测试和双 SDK 一致性

**新增稳定错误码**

- `SEED_SIZE_MISMATCH`
- `BLOCK_NOT_IN_SEED`
- `BLOCK_SIZE_MISMATCH`

**验收矩阵**

- [x] Go 与 TypeScript 的公开名称、结果字段、错误码和边界语义对等。
- [x] 合法空 Seed 与 `sourceSize == 0` 验证成功。
- [x] 结构非法优先于 hash 和大小不匹配。
- [x] hash 不匹配优先于 source size 不匹配。
- [x] `sourceSize` 分别覆盖 0、1、`BlockSize-1`、`BlockSize`、
  `BlockSize+1`、对齐多块和 uint64 上界附近。
- [x] 查找覆盖零次、一次、多次匹配，并证明不会提前返回而漏掉非法尾部或错误
  SeedHash。
- [x] 块验证覆盖摘要缺失、长度不符、普通块、尾块，以及同一摘要位于不同合法
  长度位置的情况。
- [x] Go 执行 `go test ./...` 与 `go vet ./...`；TypeScript 执行
  `npm run check`。
- [x] README、设计文档和 API 摘要完成同步。

### MS-018 明确延期范围

以下能力不属于本批次，不得顺带实现：

- `EncodeSeed` / `DecodeSeed` 内存便利函数；
- `cas` 子包、`ContentStore`、`FileStore` 和 `ImportSource`；
- BitFS 的 `SeedSource`、`BlockSource` 或 `ContentSource` 接口；
- 对 `keymaster-seed-v1` 文件布局的任何修改。

内容存储涉及并发发布、权限、持久性、容量、垃圾回收和跨 SDK 对等性，应由
独立立项处理；面向买卖方的内容源接口由消费这些接口的 BitFS 层定义。
