import { Worker } from 'node:worker_threads';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
export const VERSION = '0.1.0';
export const MAX_INPUT_BYTES = 1_048_576;
export const MAX_KEYS = 4096;
const DOTENV_VERSION = require('dotenv/package.json').version;

export class InputError extends Error {
  constructor(code) {
    super(code);
    this.name = 'InputError';
    this.code = code;
  }
}

export function validateExpectedKeys(keys) {
  if (!Array.isArray(keys) || keys.length > MAX_KEYS
      || keys.some(key => typeof key !== 'string' || !/^[A-Za-z0-9_.-]{1,256}$/.test(key))
      || new Set(keys).size !== keys.length) {
    throw new InputError('invalid_expected_keys');
  }
  return keys;
}

function runEngine(engine, text, timeoutMs) {
  return new Promise(resolve => {
    let settled = false;
    let worker;
    let timer;
    const finish = result => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      if (worker) {
        worker.terminate().then(() => resolve(result), () => resolve(result));
      } else {
        resolve(result);
      }
    };
    try {
      worker = new Worker(new URL('./parse-worker.mjs', import.meta.url), {
        workerData: { engine, text },
        env: {},
        execArgv: [],
        stdout: true,
        stderr: true,
        resourceLimits: { maxOldGenerationSizeMb: 64, maxYoungGenerationSizeMb: 16, stackSizeMb: 4 },
      });
      // A future dependency must not leak parsed input through worker logging.
      worker.stdout.on('data', () => {});
      worker.stderr.on('data', () => {});
      timer = setTimeout(() => finish({ status: 'failed', error: 'engine_timeout' }), timeoutMs);
      worker.once('message', message => {
        if (message?.status === 'complete' && Array.isArray(message.entries)
            && message.entries.length <= MAX_KEYS && message.entries.every(entry =>
              Array.isArray(entry) && entry.length === 2
              && entry.every(value => typeof value === 'string') && entry[0].length <= 256)) {
          finish(message);
        } else {
          finish({ status: 'failed', error: message?.error === 'engine_key_limit'
            ? 'engine_key_limit' : 'engine_error' });
        }
      });
      worker.once('error', () => finish({ status: 'failed', error: 'engine_error' }));
      worker.once('exit', () => finish({ status: 'failed', error: 'engine_exited_without_result' }));
    } catch {
      finish({ status: 'failed', error: 'engine_start_failed' });
    }
  });
}

function sourceCandidates(text, allKeys) {
  const locations = new Map();
  // These are lexical candidates only, not a reconstruction of either parser.
  const matcher = /^[\t ]*(?:export[\t ]+)?([A-Za-z0-9_.-]+)[\t ]*(?:=|:[\t ])/;
  text.split(/\r\n|\r|\n/).forEach((line, index) => {
    const key = matcher.exec(line)?.[1];
    if (!key || !allKeys.has(key)) return;
    const entry = locations.get(key) ?? { lines: [], count: 0 };
    entry.count += 1;
    if (entry.lines.length < 32) entry.lines.push(index + 1);
    locations.set(key, entry);
  });
  return locations;
}

export async function compare(text, options = {}) {
  if (typeof text !== 'string' || !text.isWellFormed()) throw new InputError('invalid_input_text');
  if (Buffer.byteLength(text, 'utf8') > MAX_INPUT_BYTES) throw new InputError('input_byte_limit');
  if (!options || typeof options !== 'object' || Array.isArray(options)
      || Object.keys(options).some(key => !['showKeys', 'checkOrder', 'expectedKeys', 'timeoutMs'].includes(key))) {
    throw new InputError('invalid_options');
  }
  const { showKeys = false, checkOrder = false, expectedKeys, timeoutMs = 5000 } = options;
  if (typeof showKeys !== 'boolean' || typeof checkOrder !== 'boolean'
      || !Number.isInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > 60_000) {
    throw new InputError('invalid_options');
  }
  if (expectedKeys !== undefined) validateExpectedKeys(expectedKeys);
  const engines = [
    { id: 'node-native', version: process.versions.node },
    { id: 'dotenv', version: DOTENV_VERSION },
  ];
  const outcomes = await Promise.all(engines.map(engine => runEngine(engine.id, text, timeoutMs)));
  const report = {
    report_version: 1,
    tool_version: VERSION,
    complete: outcomes.every(outcome => outcome.status === 'complete'),
    ok: false,
    values_agree: null,
    order_equal: null,
    check_order: checkOrder,
    key_names_included: showKeys,
    expected_key_contract: expectedKeys !== undefined,
    engines: engines.map((engine, index) => ({ ...engine, status: outcomes[index].status,
      ...(outcomes[index].error ? { error: outcomes[index].error } : {}),
      ...(outcomes[index].entries ? { key_count: outcomes[index].entries.length } : {}),
    })),
    keys: [],
    issues: [],
  };
  if (!report.complete) return report;
  const maps = outcomes.map(outcome => new Map(outcome.entries));
  const allKeys = new Set([...maps[0].keys(), ...maps[1].keys(), ...(expectedKeys ?? [])]);
  if (allKeys.size > MAX_KEYS) {
    report.complete = false;
    report.issues = ['union_key_limit'];
    return report;
  }
  const sorted = [...allKeys].sort();
  const ids = new Map(sorted.map((key, index) => [key, `key-${String(index + 1).padStart(4, '0')}`]));
  const expected = new Set(expectedKeys ?? []);
  const locations = sourceCandidates(text, allKeys);
  let valuesAgree = true;
  let contractPasses = true;
  report.keys = sorted.map(key => {
    const present = maps.map(map => map.has(key));
    const same = present.every(Boolean) ? maps[0].get(key) === maps[1].get(key) : null;
    const issues = [];
    if (present[0] !== present[1]) issues.push('presence_difference');
    if (same === false) issues.push('value_difference');
    if (issues.length) valuesAgree = false;
    if (expectedKeys !== undefined) {
      if (!expected.has(key)) issues.push('unexpected_key');
      else if (!present.every(Boolean)) issues.push('expected_key_missing');
      if (issues.includes('unexpected_key') || issues.includes('expected_key_missing')) contractPasses = false;
    }
    const candidates = locations.get(key);
    return {
      id: ids.get(key),
      ...(showKeys ? { key } : {}),
      candidate_lines: candidates?.lines ?? [],
      additional_candidates: (candidates?.count ?? 0) - (candidates?.lines.length ?? 0),
      native_present: present[0],
      dotenv_present: present[1],
      values_equal: same,
      issues,
    };
  });
  const order = maps.map(map => [...map.keys()].map(key => ids.get(key)));
  report.key_order = { native: order[0], dotenv: order[1] };
  report.order_equal = JSON.stringify(order[0]) === JSON.stringify(order[1]);
  report.values_agree = valuesAgree;
  report.ok = valuesAgree && contractPasses && (!checkOrder || report.order_equal);
  if (checkOrder && !report.order_equal) report.issues.push('key_order_difference');
  return report;
}
