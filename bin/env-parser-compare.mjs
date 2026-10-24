#!/usr/bin/env node
import { parseArgs } from 'node:util';
import { compare, VERSION, InputError } from '../src/compare.mjs';
import { readText, readExpectedKeys } from '../src/input.mjs';

const help = `env-parser-compare 0.1.0 — compare real parse-only APIs
Usage: env-parser-compare [options] FILE
  --show-keys           Include variable names (values are never printed)
  --check-order         Fail if actual property order differs, too
  --expect-keys FILE    Exact expected keys, one per line; # comments allowed
  --timeout-ms N        Worker deadline, 1–60000 ms (default 5000)
  --version            Print version
  --help               Print help
Exit: 0 agreement and requested checks pass; 1 difference; 2 incomplete/error.
JSON goes to stdout. Input paths, raw errors, values and value hashes are omitted.`;

try {
  let parsed;
  try {
    parsed = parseArgs({ allowPositionals: true, strict: true, options: {
      'show-keys': { type: 'boolean' }, 'check-order': { type: 'boolean' },
      'expect-keys': { type: 'string' }, 'timeout-ms': { type: 'string' },
      version: { type: 'boolean' }, help: { type: 'boolean' },
    } });
  } catch { throw new InputError('invalid_arguments'); }
  const { values, positionals } = parsed;
  if (values.help) console.log(help);
  else if (values.version) console.log(VERSION);
  else {
    if (positionals.length !== 1) throw new InputError('one_input_required');
    const timeout = values['timeout-ms'];
    if (timeout !== undefined && !/^[0-9]+$/.test(timeout)) throw new InputError('invalid_timeout');
    const report = await compare(readText(positionals[0]), {
      showKeys: values['show-keys'] ?? false,
      checkOrder: values['check-order'] ?? false,
      ...(timeout !== undefined ? { timeoutMs: Number(timeout) } : {}),
      ...(values['expect-keys'] !== undefined ? { expectedKeys: readExpectedKeys(values['expect-keys']) } : {}),
    });
    console.log(JSON.stringify(report, null, 2));
    process.exitCode = !report.complete ? 2 : report.ok ? 0 : 1;
  }
} catch (error) {
  console.log(JSON.stringify({ report_version: 1, complete: false, ok: false,
    error: error instanceof InputError ? error.code : 'internal_error' }));
  process.exitCode = 2;
}
