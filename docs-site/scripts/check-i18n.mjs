import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const site = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (file) => fs.readFile(file, 'utf8').then(JSON.parse);
const metadata = await read(path.join(site, '.api-metadata/index.json'));
const catalog = await read(path.join(site, 'i18n/api.zh-CN.json'));
const manifest = await read(path.join(site, 'src/data/operations.json'));
const generated = await read(path.join(site, 'src/data/operations.generated.json'));
const fail = (message) => { throw new Error(message); };
const cjk = (value) => /[\u3400-\u9fff]/u.test(value ?? '');
// Generic English or machine-filled text is not a translation. Keep this list
// deliberately explicit so a source update cannot silently ship placeholders.
const placeholder = (value) => /Public (?:MasterSeed|Go|KeyHold) SDK|is an exported Go constant|公共(?:接口|方法|API)|调用方提供的接口输入|SDK 返回的数据字段|SDK 公共方法|MasterSeed 操作|Hash source blocks|Compute seed hash|Authenticate complete|Compare source blocks|Read one digest|Scan a trusted seed|Use path adapters|执行对应的数据种子流程/u.test(value ?? '');
const slug = (value) => String(value).replace(/([A-Z]+)([A-Z][a-z])/g, '$1-$2').replace(/([a-z0-9])([A-Z])/g, '$1-$2').replace(/[_\s]+/g, '-').replace(/[^A-Za-z0-9-]+/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '').toLowerCase();
const entryOf = (api) => api.entry ?? 'core';
const keyOf = (sdk, api) => `${sdk}.${entryOf(api)}.${api.kind}.${api.symbol}`;
const pathSlugOf = (api) => api.pathSlug ?? slug(api.symbol);
const expectedKeys = new Set();
const routeKeys = new Set();

for (const [sdk, data] of Object.entries(metadata)) for (const api of data.apis) {
  const key = keyOf(sdk, api);
  expectedKeys.add(key);
  const routeKey = `${sdk}/${api.kind}/${pathSlugOf(api)}`;
  if (routeKeys.has(routeKey)) fail(`Duplicate generated API route: ${routeKey}`);
  routeKeys.add(routeKey);
  const entry = catalog.api?.[key];
  if (!entry || typeof entry.source !== 'string' || typeof entry.translation !== 'string' || !entry.translation.trim() || !cjk(entry.translation) || placeholder(entry.translation)) fail(`Missing/non-Chinese/placeholder translation catalog entry: ${key}`);
  if (entry.source !== api.summary) fail(`Stale translation catalog source for ${key}`);
  for (const p of api.parameters ?? []) {
    const k = `${key}.parameters.${p.name}`; expectedKeys.add(k); const e = catalog.api?.[k];
    if (!e || e.source !== p.summary || !e.translation?.trim() || !cjk(e.translation) || placeholder(e.translation)) fail(`Missing/stale parameter translation: ${k}`);
  }
  for (const f of api.fields ?? []) {
    const k = `${key}.fields.${f.name}`; expectedKeys.add(k); const e = catalog.api?.[k];
    if (!e || e.source !== f.summary || !e.translation?.trim() || !cjk(e.translation) || placeholder(e.translation)) fail(`Missing/stale field translation: ${k}`);
  }
  for (const m of api.methods ?? []) {
    const k = `${key}.methods.${m.name}`; expectedKeys.add(k); const e = catalog.api?.[k];
    if (!e || e.source !== m.summary || !e.translation?.trim() || !cjk(e.translation) || placeholder(e.translation)) fail(`Missing/stale method translation: ${k}`);
  }
}
for (const key of Object.keys(catalog.api ?? {})) if (!expectedKeys.has(key)) fail(`Orphan translation catalog key: ${key}`);

const categories = new Set(manifest.map((operation) => operation.category));
for (const category of categories) if (!catalog.categories?.[category]?.trim() || !cjk(catalog.categories[category]) || placeholder(catalog.categories[category])) fail(`Missing/non-Chinese category translation: ${category}`);
if (generated.length !== manifest.length || generated.length !== 8) fail(`Expected exactly 8 generated operations, got ${generated.length}`);
for (const operation of manifest) {
  const output = generated.find((item) => item.id === operation.id);
  if (!output) fail(`Missing generated operation: ${operation.id}`);
  const labels = catalog.operations?.[operation.id];
  if (!labels?.source || !labels.translation?.title?.trim() || !labels.translation?.purpose?.trim() || !cjk(labels.translation.title) || !cjk(labels.translation.purpose) || placeholder(labels.translation.title) || placeholder(labels.translation.purpose)) fail(`Missing/non-Chinese/placeholder operation translation: ${operation.id}`);
  if (JSON.stringify(labels.source) !== JSON.stringify({title: operation.title, purpose: operation.purpose})) fail(`Stale operation source: ${operation.id}`);
  for (const [sdk, target] of Object.entries(operation.sdks)) {
    const api = metadata[sdk].apis.find((item) => item.kind === target.kind && item.symbol === target.symbol && (!target.entry || entryOf(item) === target.entry));
    if (!api) fail(`Manifest target missing from metadata: ${sdk}.${target.entry ?? 'core'}.${target.kind}.${target.symbol}`);
    const contract = output.sdks[sdk];
    if (!contract?.symbol || !contract.input || !contract.output || !contract.href) fail(`Empty generated contract: ${operation.id}/${sdk}`);
    if (target.entry && contract.entry !== target.entry) fail(`Generated entry mismatch: ${operation.id}/${sdk}`);
    const href = `/api/${sdk}/${api.kind}/${pathSlugOf(api)}`;
    if (contract.href !== href) fail(`Generated href mismatch: ${operation.id}/${sdk}`);
    const expectedInput = (api.parameters ?? []).map((p) => `${p.name}: ${p.type}`).join(', ');
    if (contract.input !== expectedInput) fail(`Generated input drift: ${operation.id}/${sdk}`);
    const expectedOutput = api.returns ?? (api.kind === 'types' ? (api.fields ?? []).map((f) => `${f.name}: ${f.type}`).join(', ') : '');
    if (contract.output !== expectedOutput) fail(`Generated output drift: ${operation.id}/${sdk}`);
    const file = path.join(site, 'docs', 'api', sdk, api.kind, `${pathSlugOf(api)}.md`);
    try { await fs.access(file); } catch { fail(`Operation href has no generated route: ${contract.href}`); }
  }
}

for (const [sdk, data] of Object.entries(metadata)) for (const api of data.apis) {
  const file = path.join(site, 'docs', 'api', sdk, api.kind, `${pathSlugOf(api)}.md`);
  const content = await fs.readFile(file, 'utf8');
  if (!content.startsWith('---\n')) fail(`Generated API frontmatter is not first: ${keyOf(sdk, api)}`);
  if (!content.includes(`title: ${api.symbol}\n`)) fail(`Generated API title mismatch: ${keyOf(sdk, api)}`);
  if (!content.includes(`slug: /api/${sdk}/${api.kind}/${pathSlugOf(api)}\n`)) fail(`Generated API slug mismatch: ${keyOf(sdk, api)}`);
  if (content.indexOf('title:') > content.indexOf('\n\n')) fail(`Generated API frontmatter leaked into body: ${keyOf(sdk, api)}`);
}

const translatedDocs = [
  'guide/getting-started.md', 'guide/create-verify.md', 'guide/block-operations.md', 'guide/errors.md',
  'concepts/seed-v1.md', 'concepts/interoperability.md', 'concepts/security.md', 'operations.mdx', 'release-notes.md',
];
for (const file of translatedDocs) {
  try { await fs.access(path.join(site, 'i18n/zh-CN/docusaurus-plugin-content-docs/current', file)); }
  catch { fail(`Missing zh-CN document translation: ${file}`); }
}
for (const file of ['navbar.json', 'footer.json']) {
  const value = await read(path.join(site, 'i18n/zh-CN/docusaurus-theme-classic', file));
  if (!Object.keys(value).length) fail(`Missing zh-CN UI translations: ${file}`);
}
console.log(`i18n check passed: ${expectedKeys.size} qualified API entries, ${generated.length} operations, and ${translatedDocs.length} translated docs.`);
