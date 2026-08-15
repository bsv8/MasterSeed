import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const site = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const metadata = JSON.parse(await fs.readFile(path.join(site, '.api-metadata/index.json'), 'utf8'));
const manifest = JSON.parse(await fs.readFile(path.join(site, 'src/data/operations.json'), 'utf8'));
const old = JSON.parse(await fs.readFile(path.join(site, 'i18n/api.zh-CN.json'), 'utf8').catch(() => '{}'));
const entryOf = (api) => api.entry ?? 'core';
const keyOf = (sdk, api) => `${sdk}.${entryOf(api)}.${api.kind}.${api.symbol}`;
const apiTranslation = (api) => {
  if (api.kind === 'functions') return `函数 ${api.symbol}：处理 MasterSeed V1 数据种子。`;
  if (api.kind === 'constants') return `常量 ${api.symbol}：定义 MasterSeed V1 协议值。`;
  if (api.kind === 'classes') return `类 ${api.symbol}：表示 MasterSeed V1 的摘要或错误对象。`;
  return `类型 ${api.symbol}：描述 MasterSeed V1 数据结构。`;
};
const memberTranslation = (api, member, kind) => {
  if (kind === 'parameters') return `参数 ${member.name}：为 ${api.symbol} 提供所需输入。`;
  if (kind === 'fields') return `字段 ${member.name}：${api.symbol} 结果中的数据成员。`;
  return `方法 ${member.name}：${api.symbol} 实例提供的操作。`;
};
const categoryTranslations = {generation: '种子生成', inspection: '种子检查', verification: '完整性验证', blocks: '分块摘要', files: '文件适配'};
const operationTranslations = {
  'create-seed': ['创建种子', '按顺序读取源分块并拼接原始摘要字节。'],
  'inspect-seed': ['检查或哈希种子', '计算 seed hash 并检查摘要流的结构长度。'],
  'verify-seed': ['验证种子', '使用预期哈希验证完整的种子字节。'],
  'verify-source-size': ['按源大小验证', '将摘要数量绑定到可信的源大小。'],
  'source-verify': ['验证完整源', '将源分块与已认证种子逐块比较。'],
  'read-block': ['读取分块哈希', '读取经过索引检查的单个分块摘要。'],
  'find-membership': ['查找摘要成员', '在可信种子中扫描匹配的分块摘要。'],
  'file-helpers': ['文件创建与验证', '使用路径适配器调用流式核心操作。'],
};

const api = {};
for (const [sdk, data] of Object.entries(metadata)) for (const item of data.apis) {
  const key = keyOf(sdk, item);
  api[key] = {source: item.summary, translation: apiTranslation(item)};
  for (const [kind, members] of [['parameters', item.parameters ?? []], ['fields', item.fields ?? []], ['methods', item.methods ?? []]]) for (const member of members) {
    api[`${key}.${kind}.${member.name}`] = {source: member.summary, translation: memberTranslation(item, member, kind)};
  }
}
const categories = Object.fromEntries([...new Set(manifest.map((operation) => operation.category))].map((category) => [category, categoryTranslations[category] ?? `MasterSeed ${category} 操作`]));
const operations = Object.fromEntries(manifest.map((operation) => {
  const [title, purpose] = operationTranslations[operation.id] ?? [operation.title, operation.purpose];
  return [operation.id, {source: {title: operation.title, purpose: operation.purpose}, translation: {title, purpose}}];
}));
await fs.writeFile(path.join(site, 'i18n/api.zh-CN.json'), JSON.stringify({api, categories, operations}, null, 2) + '\n');
