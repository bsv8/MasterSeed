import fs from 'node:fs/promises';
import path from 'node:path';

const site = path.resolve(new URL('..', import.meta.url).pathname);
const generated = JSON.parse(await fs.readFile(path.join(site, 'src/data/operations.generated.json')));
for (const localePath of ['build/operations.html', 'build/zh-CN/operations.html']) {
  const file = path.join(site, localePath);
  const html = await fs.readFile(file, 'utf8');
  if (html.includes('<details') || html.includes('<summary')) throw new Error(`${localePath}: compare section must be permanently visible`);
  if (!html.includes('Compare SDKs') && !html.includes('对照 SDK')) throw new Error(`${localePath}: compare heading missing`);
  const mainRows = [...html.matchAll(/<tr data-operation-row="([^"]+)" data-operation-sdk="([^"]+)" data-operation-symbol="([^"]+)"/g)];
  if (mainRows.length !== 8) throw new Error(`${localePath}: expected exactly 8 main operation rows, got ${mainRows.length}`);
  for (const operation of generated) {
    const row = mainRows.find((match) => match[1] === operation.id);
    if (!row || row[2] !== 'typescript' || row[3] !== operation.sdks.typescript.symbol) throw new Error(`${localePath}: main TypeScript operation row mismatch: ${operation.id}`);
  }
  const compareRows = [...html.matchAll(/<tr data-compare-row="([^"]+)"/g)];
  if (compareRows.length !== 8) throw new Error(`${localePath}: expected exactly 8 compare rows, got ${compareRows.length}`);
  for (const operation of generated) if (!compareRows.some((match) => match[1] === operation.id)) throw new Error(`${localePath}: missing compare row: ${operation.id}`);
}
console.log('static check passed: 8 TypeScript operation symbols and visible compare sections in en/zh-CN.');
