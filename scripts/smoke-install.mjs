import assert from 'node:assert/strict';
import { existsSync, mkdtempSync, mkdirSync, rmSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const root = fileURLToPath(new URL('../', import.meta.url));
// npm_execpath comes from npm itself; use the existing CLI without a shell.
const npmPath = process.env.npm_execpath;
if (!npmPath) throw new Error('Run this script with npm run smoke');
function npm(args, cwd) {
  const result = spawnSync(process.execPath, [npmPath, ...args], {
    cwd, encoding: 'utf8', timeout: 120_000,
  });
  if (result.status !== 0) throw new Error(result.stderr || result.stdout || 'npm failed');
  return result.stdout;
}
mkdirSync(join(root, 'dist'), { recursive: true });
const packed = JSON.parse(npm(['pack', '--ignore-scripts', '--json', '--pack-destination', 'dist'], root))[0];
const tarball = join(root, 'dist', packed.filename);
const scratch = mkdtempSync(join(tmpdir(), 'env-parser-install-'));
try {
  // npm ci can cache tarballs without the registry metadata an offline install
  // needs. Prepare a dedicated empty cache explicitly; never rely on ambient state.
  const cache = join(scratch, 'cache');
  const consumer = join(scratch, 'consumer');
  assert.equal(existsSync(cache), false);
  mkdirSync(consumer);
  npm(['cache', 'add', 'dotenv@18.0.9', '--ignore-scripts', '--cache', cache], scratch);
  npm(['install', '--offline', '--ignore-scripts', '--no-audit', '--no-fund', '--no-package-lock',
    '--cache', cache, '--prefix', consumer, tarball], consumer);
  const installed = join(consumer, 'node_modules', 'env-parser-compare');
  const cli = join(installed, 'bin', 'env-parser-compare.mjs');
  assert.ok(existsSync(cli));
  assert.ok(existsSync(join(consumer, 'node_modules', '.bin',
    process.platform === 'win32' ? 'env-parser-compare.cmd' : 'env-parser-compare')));
  for (const [file, exit] of [['portable.env.example', 0], ['different.env.example', 1],
    ['value.env.example', 1]]) {
    const result = spawnSync(process.execPath, [cli, join(installed, 'examples', file)], {
      cwd: consumer, encoding: 'utf8', timeout: 20_000,
    });
    assert.equal(result.status, exit, result.stderr);
    assert.equal(JSON.parse(result.stdout).ok, exit === 0);
    assert.equal(result.stderr, '');
  }
  const original = readFileSync(join(installed, 'examples', 'portable.env.example'));
  assert.ok(original.includes(Buffer.from('example.invalid')));
  npm(['uninstall', '--offline', '--ignore-scripts', '--no-audit', '--no-fund', '--cache', cache,
    '--prefix', consumer, 'env-parser-compare'], consumer);
  assert.equal(existsSync(installed), false);
} finally {
  const target = resolve(scratch);
  assert.equal(dirname(target), resolve(tmpdir()));
  assert.ok(basename(target).startsWith('env-parser-install-'));
  rmSync(target, { recursive: true, force: true });
}
console.log('Real tarball, explicitly prepared empty cache, offline install, three CLI flows and uninstall passed');
