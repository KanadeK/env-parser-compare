import test from 'node:test';
import assert from 'node:assert/strict';
import { parseEnv } from 'node:util';
import dotenv from 'dotenv';
import { compare, InputError, MAX_INPUT_BYTES, validateExpectedKeys } from '../src/compare.mjs';

test('simple agreement returns versions, key counts and no input fragments', async () => {
  const report = await compare('HOST=PRIVATE_HOST_VALUE\nPORT=1234\n');
  assert.equal(report.complete, true);
  assert.equal(report.ok, true);
  assert.equal(report.values_agree, true);
  assert.equal(report.engines[0].version, process.versions.node);
  assert.equal(report.engines[1].id, 'dotenv');
  assert.equal(report.keys.length, 2);
  const encoded = JSON.stringify(report);
  for (const marker of ['HOST', 'PORT', 'PRIVATE_HOST_VALUE', '1234']) assert.ok(!encoded.includes(marker));
});

test('real parse APIs independently determine every presence and equality result', async () => {
  const fixtures = [
    'A=one\nB=two\n', 'COLON: one\nOK=two\n', 'A="one\\"two"\n',
    'A="one"two\n', 'A="one\rtwo"\n', 'A="one\\ntwo"\n',
    "A='one\\ntwo'\n", 'A=one#two\nB="three#four"\n',
    'A=one\nA=two\n', 'DOT.KEY=one\nDASH-KEY=two\n',
    'export A=one\nB=\n', '\ufeffA=one\r\nB=two\r\n',
    '__proto__=one\nconstructor=two\n', 'A="unterminated\nB=two\n',
  ];
  for (const text of fixtures) {
    const expected = [new Map(Object.entries(parseEnv(text))), new Map(Object.entries(dotenv.parse(text)))];
    const report = await compare(text, { showKeys: true });
    assert.equal(report.complete, true);
    const all = [...new Set([...expected[0].keys(), ...expected[1].keys()])].sort();
    assert.deepEqual(report.keys.map(row => row.key), all);
    let agrees = true;
    for (const row of report.keys) {
      const presence = expected.map(map => map.has(row.key));
      const same = presence.every(Boolean) ? expected[0].get(row.key) === expected[1].get(row.key) : null;
      assert.equal(row.native_present, presence[0]);
      assert.equal(row.dotenv_present, presence[1]);
      assert.equal(row.values_equal, same);
      if (presence[0] !== presence[1] || same === false) agrees = false;
    }
    assert.equal(report.values_agree, agrees);
    assert.equal(report.ok, agrees);
  }
});

test('colon assignment produces a presence difference with a useful candidate line', async () => {
  const report = await compare('# comment\nCOLON: harmless\n', { showKeys: true });
  const row = report.keys.find(item => item.key === 'COLON');
  assert.equal(report.ok, false);
  assert.deepEqual(row.issues, ['presence_difference']);
  assert.deepEqual(row.candidate_lines, [2]);
});

test('escaped quote produces a value difference without revealing the value', async () => {
  const report = await compare('PRIVATE_KEY="PRIVATE_LEFT\\"PRIVATE_RIGHT"\n');
  assert.equal(report.ok, false);
  assert.deepEqual(report.keys[0].issues, ['value_difference']);
  for (const marker of ['PRIVATE_KEY', 'PRIVATE_LEFT', 'PRIVATE_RIGHT']) {
    assert.ok(!JSON.stringify(report).includes(marker));
  }
});

test('key order is observed directly and optional as a gate', async () => {
  const input = 'Z=first\nA=second\n';
  const defaultReport = await compare(input);
  const checked = await compare(input, { checkOrder: true });
  const actualEqual = JSON.stringify(Object.keys(parseEnv(input))) === JSON.stringify(Object.keys(dotenv.parse(input)));
  assert.equal(defaultReport.ok, true);
  assert.equal(checked.order_equal, actualEqual);
  assert.equal(checked.ok, actualEqual);
  assert.deepEqual(checked.issues, actualEqual ? [] : ['key_order_difference']);
});

test('expected key contract catches omissions shared by both engines', async () => {
  const report = await compare('OK=one\n', { expectedKeys: ['OK', 'MISSING'], showKeys: true });
  assert.equal(report.values_agree, true);
  assert.equal(report.ok, false);
  assert.deepEqual(report.keys.find(row => row.key === 'MISSING').issues, ['expected_key_missing']);
});

test('expected key contract catches extra keys and exact matches', async () => {
  assert.equal((await compare('A=one\n', { expectedKeys: ['A'] })).ok, true);
  const report = await compare('A=one\nB=two\n', { expectedKeys: ['A'], showKeys: true });
  assert.equal(report.ok, false);
  assert.deepEqual(report.keys.find(row => row.key === 'B').issues, ['unexpected_key']);
});

test('prototype-like names use actual own entries, with no prototype pollution', async () => {
  const report = await compare('__proto__=PRIVATE\nconstructor=PRIVATE2\n',
    { expectedKeys: ['__proto__', 'constructor'], showKeys: true });
  assert.equal(report.ok, false);
  assert.deepEqual(report.keys.find(row => row.key === '__proto__').issues, ['expected_key_missing']);
  assert.equal({}.PRIVATE, undefined);
});

test('comments and empty files can agree, which is explicitly not syntax validation', async () => {
  for (const text of ['', '# empty\n', 'this line has no assignment\n']) {
    const report = await compare(text);
    assert.equal(report.ok, true);
    assert.equal(report.keys.length, 0);
  }
});

test('timeouts produce incomplete reports rather than false agreement', async () => {
  const report = await compare('A=PRIVATE_VALUE\n', { timeoutMs: 1 });
  assert.equal(report.complete, false);
  assert.equal(report.ok, false);
  assert.equal(report.values_agree, null);
  assert.ok(report.engines.some(engine => engine.error === 'engine_timeout'));
  assert.deepEqual(report.keys, []);
  assert.ok(!JSON.stringify(report).includes('PRIVATE_VALUE'));
});

test('per-engine key count and long key limits cannot turn into passes', async () => {
  for (const text of [Array.from({ length: 4097 }, (_, n) => `K${n}=v`).join('\n'), `${'K'.repeat(257)}=value`]) {
    const report = await compare(text);
    assert.equal(report.complete, false);
    assert.equal(report.ok, false);
    assert.ok(report.engines.some(engine => engine.error === 'engine_key_limit'));
  }
});

test('large union of expected keys and observed keys fails incomplete', async () => {
  const report = await compare('A=value\n', { expectedKeys: Array.from({ length: 4096 }, (_, n) => `K${n}`) });
  assert.equal(report.complete, false);
  assert.deepEqual(report.issues, ['union_key_limit']);
});

test('candidate line lists are explicitly bounded without losing count', async () => {
  const report = await compare('A=one\n'.repeat(50));
  assert.equal(report.keys[0].candidate_lines.length, 32);
  assert.equal(report.keys[0].additional_candidates, 18);
});

test('invalid input, resource settings and unknown options are rejected before workers', async () => {
  for (const text of [null, Buffer.from('A=b'), '\ud800']) {
    await assert.rejects(compare(text), error => error instanceof InputError && error.code === 'invalid_input_text');
  }
  await assert.rejects(compare('x'.repeat(MAX_INPUT_BYTES + 1)), { code: 'input_byte_limit' });
  await assert.rejects(compare('é'.repeat(MAX_INPUT_BYTES)), { code: 'input_byte_limit' });
  for (const options of [null, [], { unknown: true }, { showKeys: 1 }, { checkOrder: 'yes' },
    { timeoutMs: 0 }, { timeoutMs: 60_001 }, { timeoutMs: 1.5 }, { timeoutMs: NaN }]) {
    await assert.rejects(compare('A=b', options), { code: 'invalid_options' });
  }
});

test('expected-key validation rejects duplicates and accidentally pasted assignments', () => {
  for (const keys of [null, ['A', 'A'], ['A=PRIVATE_VALUE'], [true], [''], ['K'.repeat(257)]]) {
    assert.throws(() => validateExpectedKeys(keys), { code: 'invalid_expected_keys' });
  }
});

test('parse-only APIs leave the calling process variable untouched', async () => {
  const name = 'ENV_PARSER_COMPARE_SYNTHETIC_PARENT_FIXTURE';
  const original = process.env[name];
  process.env[name] = 'PARENT';
  try {
    const report = await compare(`${name}=CHILD\nLITERAL=$(NOT_A_COMMAND)\n`);
    assert.equal(report.complete, true);
    assert.equal(process.env[name], 'PARENT');
    assert.ok(!JSON.stringify(report).includes('NOT_A_COMMAND'));
  } finally {
    if (original === undefined) delete process.env[name];
    else process.env[name] = original;
  }
});
