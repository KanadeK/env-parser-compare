import { readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';

const root = fileURLToPath(new URL('../', import.meta.url));
const files = [join(root, 'eslint.config.mjs')];
function walk(path) {
  for (const entry of readdirSync(path, { withFileTypes: true })) {
    const file = join(path, entry.name);
    if (entry.isDirectory()) walk(file);
    else if (entry.isFile() && file.endsWith('.mjs')) files.push(file);
  }
}
for (const directory of ['bin', 'src', 'test', 'scripts']) walk(join(root, directory));
for (const file of files) {
  const result = spawnSync(process.execPath, ['--check', file], { encoding: 'utf8' });
  if (result.status !== 0) throw new Error(result.stderr || 'Node syntax validation failed');
}
console.log(`Node syntax checks passed for ${files.length} source/test/script files`);
