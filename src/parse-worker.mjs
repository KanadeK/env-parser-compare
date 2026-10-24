// Fixed parse-only engines. Input is always data, never JavaScript or shell code.
import { parentPort, workerData } from 'node:worker_threads';
import { parseEnv } from 'node:util';
import dotenv from 'dotenv';

try {
  const result = workerData.engine === 'node-native'
    ? parseEnv(workerData.text)
    : dotenv.parse(workerData.text);
  const entries = Object.entries(result);
  if (entries.length > 4096 || entries.some(([key]) => key.length > 256)) {
    parentPort.postMessage({ status: 'failed', error: 'engine_key_limit' });
  } else {
    parentPort.postMessage({ status: 'complete', entries });
  }
} catch {
  // Error messages can contain the source or parsed values. Do not forward them.
  parentPort.postMessage({ status: 'failed', error: 'engine_error' });
}
parentPort.close();
