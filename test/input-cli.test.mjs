import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, readFileSync, mkdirSync, rmSync, symlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve, dirname, basename } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { readText, readExpectedKeys } from '../src/input.mjs';

const cli = fileURLToPath(new URL('../bin/env-parser-compare.mjs', import.meta.url));
function fixture(t) {
  const directory = mkdtempSync(join(tmpdir(), 'env-parser-test-'));
  t.after(() => {
    const target = resolve(directory);
    assert.equal(dirname(target), resolve(tmpdir()));
    assert.ok(basename(target).startsWith('env-parser-test-'));
    rmSync(target, { recursive: true, force: true });
  });
  return directory;
}
function run(args, directory) {
  return spawnSync(process.execPath, [cli, ...args], { cwd: directory, encoding: 'utf8', timeout: 20_000 });
}

test('input reader preserves BOM, CRLF and exact text', t => {
  const path = join(fixture(t), 'fixture.env');
  const text = '\ufeffA=one\r\nB=two\n';
  writeFileSync(path, text);
  assert.equal(readText(path), text);
});

test('input reader bounds bytes and refuses binary UTF8 errors or directories', t => {
  const directory = fixture(t);
  const path = join(directory, 'fixture.env');
  writeFileSync(path, Buffer.from([0xff, 0xfe, 0x41]));
  assert.throws(() => readText(path), { code: 'input_not_utf8' });
  writeFileSync(path, 'X'.repeat(1_048_577));
  assert.throws(() => readText(path), { code: 'input_byte_limit' });
  assert.throws(() => readText(directory), { code: 'input_not_regular' });
  assert.throws(() => readText(join(directory, 'PRIVATE_MISSING_PATH')), { code: 'input_unreadable' });
});

test('input reader refuses final symlinks when the platform permits creating one', t => {
  const directory = fixture(t);
  const path = join(directory, 'fixture.env');
  const link = join(directory, 'link.env');
  writeFileSync(path, 'A=b\n');
  try { symlinkSync(path, link); } catch { t.skip('Symlink creation unavailable'); return; }
  assert.throws(() => readText(link), { code: 'input_not_regular' });
});

test('expected keys file supports comments, requires exact nonduplicate keys and bounds input', t => {
  const path = join(fixture(t), 'expected.keys');
  writeFileSync(path, '# public schema\n A\r\nB\n\n');
  assert.deepEqual(readExpectedKeys(path), ['A', 'B']);
  for (const text of ['A\nA\n', 'A=PRIVATE_VALUE\n', 'x'.repeat(65_537)]) {
    writeFileSync(path, text);
    assert.throws(() => readExpectedKeys(path));
  }
});

test('documented CLI agreement and difference exits with private valid JSON', t => {
  const directory = fixture(t);
  const path = join(directory, 'PRIVATE_INPUT_PATH.env');
  for (const [text, expected] of [['A=PRIVATE_VALUE\n', 0], ['COLON: PRIVATE_VALUE\n', 1],
    ['A="PRIVATE_LEFT\\"PRIVATE_RIGHT"\n', 1]]) {
    writeFileSync(path, text);
    const result = run([path], directory);
    assert.equal(result.status, expected, result.stderr);
    assert.equal(JSON.parse(result.stdout).ok, expected === 0);
    assert.equal(result.stderr, '');
    for (const marker of ['PRIVATE_VALUE', 'PRIVATE_INPUT_PATH', 'PRIVATE_LEFT', 'PRIVATE_RIGHT']) {
      assert.ok(!result.stdout.includes(marker));
    }
    assert.equal(readFileSync(path, 'utf8'), text);
  }
});

test('CLI expected keys and explicit key disclosure work', t => {
  const directory = fixture(t);
  const path = join(directory, 'fixture.env');
  const keys = join(directory, 'required.keys');
  writeFileSync(path, 'A=PRIVATE_VALUE\n');
  writeFileSync(keys, 'A\nB\n');
  const result = run(['--expect-keys', keys, '--show-keys', path], directory);
  assert.equal(result.status, 1);
  const report = JSON.parse(result.stdout);
  assert.equal(report.key_names_included, true);
  assert.deepEqual(report.keys.find(row => row.key === 'B').issues, ['expected_key_missing']);
  assert.ok(!result.stdout.includes('PRIVATE_VALUE'));
});

test('CLI bad arguments, missing files and timeout errors never print raw details', t => {
  const directory = fixture(t);
  const path = join(directory, 'fixture.env');
  writeFileSync(path, 'A=PRIVATE_VALUE\n');
  for (const args of [[], ['--PRIVATE_UNKNOWN_FLAG'], ['PRIVATE_MISSING_FILE'],
    ['--timeout-ms', '-1', path], ['--timeout-ms', 'NaN', path], ['--timeout-ms', '0', path],
    ['--timeout-ms', '1', path], [path, path]]) {
    const result = run(args, directory);
    assert.equal(result.status, 2, result.stderr);
    assert.equal(JSON.parse(result.stdout).complete, false);
    assert.equal(result.stderr, '');
    assert.ok(!result.stdout.includes('PRIVATE_'));
  }
});

test('CLI help and version are available without an input file', t => {
  const directory = fixture(t);
  assert.equal(run(['--version'], directory).stdout.trim(), '0.1.0');
  const result = run(['--help'], directory);
  assert.equal(result.status, 0);
  assert.ok(result.stdout.includes('--check-order'));
});

test('directory inputs are rejected with structured errors', t => {
  const directory = fixture(t);
  mkdirSync(join(directory, 'directory.env'));
  const result = run([join(directory, 'directory.env')], directory);
  assert.equal(result.status, 2);
  assert.equal(JSON.parse(result.stdout).error, 'input_not_regular');
});
