import fs from 'node:fs/promises';
import path from 'node:path';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {fileURLToPath} from 'node:url';

const run = promisify(execFile);
const site = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const root = path.resolve(site, '..');
const marker = '<!-- GENERATED FILE. Edit SDK comments or the translation catalog instead. -->';
const metadataDir = path.join(site, '.api-metadata');
const catalogPath = path.join(site, 'i18n/api.zh-CN.json');
const slug = (value) => String(value).replace(/([A-Z]+)([A-Z][a-z])/g, '$1-$2').replace(/([a-z0-9])([A-Z])/g, '$1-$2').replace(/[_\s]+/g, '-').replace(/[^A-Za-z0-9-]+/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '').toLowerCase();
const clean = (s) => String(s ?? '').replace(/\s+/g, ' ').trim();
const qualified = (sdk, api) => `${sdk}.${api.entry ?? 'core'}.${api.kind}.${api.symbol}`;
const summary = (comment, fallback = 'Public MasterSeed SDK declaration.') => (comment?.summary ?? []).map((x) => x.text ?? '').join('').trim() || fallback;
const typeText = (t) => {
  if (!t) return 'void';
  if (t.type === 'intrinsic') return t.name;
  if (t.type === 'reference') return t.name + (t.typeArguments ? `<${t.typeArguments.map(typeText).join(', ')}>` : '');
  if (t.type === 'array') return `${typeText(t.elementType)}[]`;
  if (t.type === 'union') return t.types.map(typeText).join(' | ');
  if (t.type === 'intersection') return t.types.map(typeText).join(' & ');
  if (t.type === 'literal') return JSON.stringify(t.value);
  if (t.type === 'reflection') return t.declaration?.signatures?.[0] ? typeText(t.declaration.signatures[0].type) : 'object';
  return t.name ?? t.type ?? 'unknown';
};
const mdSafe = (s) => String(s ?? '').replaceAll('|', '\\|').replaceAll('<', '&lt;').replaceAll('>', '&gt;');
const kindName = (r) => r.kindString ?? ({4: 'Enumeration', 32: 'Variable', 64: 'Function', 128: 'Class', 256: 'Interface', 4194304: 'Type alias'}[r.kind] ?? '');
const refComment = (r, fallback) => summary(r.comment, fallback);
const parameter = (p, symbol) => ({name: p.name, type: typeText(p.type), optional: Boolean(p.flags?.isOptional), summary: summary(p.comment, `Parameter ${p.name} of ${symbol}.`)});
function tsApi(r) {
  const reflectionKind = kindName(r);
  const kind = reflectionKind === 'Class' ? 'classes' : reflectionKind === 'Enumeration' ? 'constants' : ['Interface', 'Type alias'].includes(reflectionKind) ? 'types' : reflectionKind === 'Variable' ? 'constants' : 'functions';
  const sig = r.signatures?.[0] ?? r;
  const api = {kind, symbol: r.name, entry: r.sources?.[0]?.fileName?.endsWith('/node.ts') ? 'node' : 'core', signature: '', summary: refComment(r, `Public MasterSeed ${reflectionKind.toLowerCase()} ${r.name}.`), file: r.sources?.[0]?.fileName ?? '', parameters: [], returns: '', fields: [], methods: []};
  if (kind === 'functions') {
    api.summary = summary(sig.comment ?? r.comment);
    api.parameters = (sig.parameters ?? []).map((p) => parameter(p, r.name));
    api.returns = typeText(sig.type);
    api.signature = `${r.name}(${api.parameters.map((p) => `${p.name}${p.optional ? '?' : ''}: ${p.type}`).join(', ')}): ${api.returns}`;
  } else {
    api.signature = reflectionKind === 'Type alias' ? `type ${r.name} = ${typeText(r.type)}` : `${reflectionKind === 'Class' ? 'class' : 'interface'} ${r.name}`;
    api.fields = (r.children ?? []).filter((c) => [32, 1024].includes(c.kind) && c.sources?.[0]?.fileName?.includes('typescript/src/')).map((c) => ({name: c.name, type: typeText(c.type), optional: Boolean(c.flags?.isOptional), summary: refComment(c, `Property ${c.name} of ${r.name}.`)}));
    api.methods = (r.children ?? []).filter((c) => c.kind === 2048 && c.sources?.[0]?.fileName?.includes('typescript/src/')).map((c) => ({name: c.name, signature: c.signatures?.[0] ? `${c.name}(${(c.signatures[0].parameters ?? []).map((p) => `${p.name}: ${typeText(p.type)}`).join(', ')}): ${typeText(c.signatures[0].type)}` : c.name, summary: refComment(c, `Method ${c.name} of ${r.name}.`)}));
  }
  return api;
}
async function typedocMetadata() {
  const out = path.join(metadataDir, 'typescript.json');
  await fs.mkdir(metadataDir, {recursive: true});
  const typedoc = path.join(site, 'node_modules/typedoc/dist/cli.js');
  await run(process.execPath, [typedoc, '--entryPoints', path.join(root, 'typescript/src/index.ts'), path.join(root, 'typescript/src/node.ts'), '--entryPointStrategy', 'resolve', '--tsconfig', path.join(root, 'typescript/tsconfig.json'), '--skipErrorChecking', '--json', out, '--excludePrivate', '--excludeProtected', '--excludeInternal'], {cwd: site});
  const json = JSON.parse(await fs.readFile(out, 'utf8'));
  const wanted = new Set([4, 32, 64, 128, 256, 4194304]);
  const reflections = [];
  const visit = (r) => { if (wanted.has(r.kind)) reflections.push(r); for (const child of r.children ?? []) visit(child); };
  for (const child of json.children ?? []) visit(child);
  const apis = reflections.map(tsApi).filter((a, i, all) => all.findIndex((b) => b.symbol === a.symbol && b.kind === a.kind && b.entry === a.entry) === i);
  return {sdk: 'typescript', apis};
}
async function goMetadata() {
  const out = path.join(metadataDir, 'go.json');
  await run('go', ['run', path.join(site, 'scripts/go-api-metadata.go'), '-dir', root, '-out', out], {cwd: root});
  const apis = JSON.parse(await fs.readFile(out, 'utf8')).apis;
  for (const api of apis) { if (!api.summary) api.summary = `${api.symbol} is a public MasterSeed Go SDK ${api.kind}.`; for (const p of api.parameters ?? []) if (!p.summary) p.summary = `Parameter ${p.name} of ${api.symbol}.`; for (const f of api.fields ?? []) if (!f.summary) f.summary = `Field ${f.name} of ${api.symbol}.`; for (const m of api.methods ?? []) if (!m.summary) m.summary = `Method ${m.name} of ${api.symbol}.`; }
  await fs.writeFile(out, JSON.stringify({apis}, null, 2));
  return {sdk: 'go', apis};
}
const typeLink = (value, sdk, known) => clean(value).split(/(\b[A-Z][A-Za-z0-9_]*\b)/g).map((part, i) => i % 2 && known.has(part) ? `[${part}](/api/${sdk}/types/${known.get(part)})` : part).join('').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('|', '\\|');
const md = (api, sdk, locale, catalog, known) => {
  const key = qualified(sdk, api);
  const translated = catalog.api?.[key]?.translation ?? api.summary;
  const zh = locale === 'zh-CN';
  const title = api.symbol;
  const params = api.parameters?.length ? `\n## ${zh ? '参数' : 'Parameters'}\n\n| ${zh ? '名称' : 'Name'} | ${zh ? '类型' : 'Type'} | ${zh ? '说明' : 'Description'} |\n| --- | --- | --- |\n${api.parameters.map((p) => `| \`${p.name}\` | ${typeLink(p.type, sdk, known)} | ${zh ? (catalog.api?.[`${key}.parameters.${p.name}`]?.translation ?? p.summary) : p.summary} |`).join('\n')}\n` : '';
  const fields = api.fields?.length ? `\n## ${zh ? '属性' : 'Properties'}\n\n| ${zh ? '名称' : 'Name'} | ${zh ? '类型' : 'Type'} | ${zh ? '说明' : 'Description'} |\n| --- | --- | --- |\n${api.fields.map((f) => `| \`${f.name}\` | ${typeLink(f.type, sdk, known)} | ${zh ? (catalog.api?.[`${key}.fields.${f.name}`]?.translation ?? f.summary) : f.summary} |`).join('\n')}\n` : '';
  const methods = api.methods?.length ? `\n## ${zh ? '方法' : 'Methods'}\n\n| ${zh ? '名称' : 'Name'} | ${zh ? '签名' : 'Signature'} | ${zh ? '说明' : 'Description'} |\n| --- | --- | --- |\n${api.methods.map((m) => `| \`${m.name}\` | ${mdSafe(m.signature ?? m.type)} | ${zh ? (catalog.api?.[`${key}.methods.${m.name}`]?.translation ?? m.summary) : m.summary} |`).join('\n')}\n` : '';
  const returns = api.returns ? `\n## ${zh ? '返回值' : 'Returns'}\n\n${typeLink(api.returns, sdk, known)}\n` : '';
  return `---\ntitle: ${title}\nslug: /api/${sdk}/${api.kind}/${api.pathSlug}\nsidebar_label: ${title}\n---\n\n${marker}\n\n# ${title}\n\n\`${api.signature}\`\n\n${zh ? translated : api.summary}\n${params}${returns}${fields}${methods}\n## ${zh ? '来源' : 'Source'}\n\n${zh ? '此页面由 TypeDoc/Go AST 元数据和中文翻译目录生成。标识符、类型、错误码和代码示例保持不译。' : 'This page is generated from SDK source metadata and the translation catalog.'}\n`;
};
async function writeDocs(sdkData, locale) {
  const sdk = sdkData.sdk; const catalog = JSON.parse(await fs.readFile(catalogPath, 'utf8')); const known = new Map(sdkData.apis.filter((a) => a.kind === 'types').map((a) => [a.symbol, a.pathSlug]));
  const dir = path.join(site, locale === 'zh-CN' ? `i18n/zh-CN/docusaurus-plugin-content-docs/current/api/${sdk}` : `docs/api/${sdk}`);
  await fs.rm(dir, {recursive: true, force: true}); await fs.mkdir(dir, {recursive: true});
  const zh = locale === 'zh-CN';
  await fs.writeFile(path.join(dir, 'index.md'), `---\ntitle: ${zh ? 'API 参考' : 'API reference'}\nslug: /api/${sdk}\n---\n\n${marker}\n\n# ${zh ? 'API 参考' : 'API reference'}\n\n${zh ? '以下页面由 SDK 源码元数据和中文翻译目录生成。' : 'These pages are generated from the SDK source metadata and are the precise contract for each public declaration.'}\n\n${sdkData.apis.map((a) => `- [${a.symbol}](/api/${sdk}/${a.kind}/${a.pathSlug}) — ${zh ? (catalog.api?.[qualified(sdk, a)]?.translation ?? a.summary) : a.summary}`).join('\n')}\n`);
  const kindLabels = {functions: zh ? '函数' : 'Functions', types: zh ? '类型' : 'Types', classes: zh ? '类' : 'Classes', constants: zh ? '常量' : 'Constants'};
  for (const kind of ['functions', 'types', 'classes', 'constants']) { const kindDir = path.join(dir, kind); await fs.mkdir(kindDir, {recursive: true}); await fs.writeFile(path.join(kindDir, '_category_.json'), JSON.stringify({label: kindLabels[kind], key: `${sdk}-${kind}`})); }
  for (const api of sdkData.apis) { const dirName = path.join(dir, api.kind); await fs.mkdir(dirName, {recursive: true}); await fs.writeFile(path.join(dirName, `${api.pathSlug}.md`), md(api, sdk, locale, catalog, known)); }
}
const [ts, go] = await Promise.all([typedocMetadata(), goMetadata()]);
const metadata = {typescript: ts, go};
for (const data of Object.values(metadata)) {
  const used = new Map();
  for (const api of data.apis) {
    const base = slug(api.symbol); const key = `${api.kind}:${base}`; const count = used.get(key) ?? 0;
    api.pathSlug = count === 0 ? base : `${base}-${api.symbol === api.symbol.toUpperCase() ? 'uppercase' : `variant-${count + 1}`}`;
    used.set(key, count + 1);
  }
}
await fs.writeFile(path.join(metadataDir, 'index.json'), JSON.stringify(metadata, null, 2));
const operations = JSON.parse(await fs.readFile(path.join(site, 'src/data/operations.json'), 'utf8'));
const generatedOps = operations.map((op) => ({...op, sdks: Object.fromEntries(Object.entries(op.sdks).map(([sdk, target]) => { const api = metadata[sdk].apis.find((a) => a.kind === target.kind && a.symbol === target.symbol && (!target.entry || (a.entry ?? 'core') === target.entry)); if (!api) throw new Error(`Operation ${op.id} references missing ${sdk} ${target.kind}.${target.symbol}`); return [sdk, {...target, input: api.parameters?.map((p) => `${p.name}: ${p.type}`).join(', ') ?? 'input', output: api.returns ?? 'result', href: `/api/${sdk}/${api.kind}/${api.pathSlug}`, pathSlug: api.pathSlug}]; }))}));
await fs.writeFile(path.join(site, 'src/data/operations.generated.json'), JSON.stringify(generatedOps, null, 2));
await writeDocs(ts, 'en'); await writeDocs(go, 'en'); await writeDocs(ts, 'zh-CN'); await writeDocs(go, 'zh-CN');
console.log(`Generated TypeDoc ${ts.apis.length} and Go AST ${go.apis.length} declarations.`);
