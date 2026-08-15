import {mkdir, readFile, writeFile} from 'node:fs/promises';
import {spawn} from 'node:child_process';

await mkdir('site/api/go', {recursive: true});
await new Promise((resolve, reject) => {
  const child = spawn('go', ['run', '-mod=mod', 'github.com/princjef/gomarkdoc/cmd/gomarkdoc@v1.1.0', '-o', 'site/api/go/index.md', 'github.com/bsv8/MasterSeed'], {stdio: 'inherit', env: {...process.env, GOWORK: 'off', GOFLAGS: ''}});
  child.on('error', reject); child.on('exit', code => code === 0 ? resolve() : reject(new Error(`gomarkdoc failed (${code})`)));
});
const path = 'site/api/go/index.md';
const source = await readFile(path, 'utf8');
const fixed = source.replace(/<a name="([^"]+)"><\/a>\r?\n(#{2,6} [^\n]+)/g, '$2 {#$1}').replace(/<a name="[^"]+"><\/a>/g, '').replace(/^## (Index|Constants|Variables)$/gm, (_, title) => `## ${title} {#${title.toLowerCase()}}`);
await writeFile(path, `---\ntitle: Go API reference\n---\n\nGenerated from the root package comments before every build.\n\n${fixed}`);
