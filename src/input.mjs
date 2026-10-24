import { constants, openSync, closeSync, fstatSync, lstatSync, readSync } from 'node:fs';
import { InputError, MAX_INPUT_BYTES, validateExpectedKeys } from './compare.mjs';

export function readText(path, maximum = MAX_INPUT_BYTES) {
  let descriptor;
  try {
    const before = lstatSync(path);
    if (!before.isFile() || before.isSymbolicLink()) throw new InputError('input_not_regular');
    descriptor = openSync(path, constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0));
    const info = fstatSync(descriptor);
    if (!info.isFile() || info.dev !== before.dev || info.ino !== before.ino) {
      throw new InputError('input_changed');
    }
    if (info.size > maximum) throw new InputError('input_byte_limit');
    const buffer = Buffer.alloc(maximum + 1);
    let length = 0;
    while (length < buffer.length) {
      const count = readSync(descriptor, buffer, length, buffer.length - length, null);
      if (!count) break;
      length += count;
    }
    if (length > maximum) throw new InputError('input_byte_limit');
    const after = fstatSync(descriptor);
    if (after.size !== info.size || after.mtimeMs !== info.mtimeMs) throw new InputError('input_changed');
    // Preserve an actual BOM code point; do not normalize the bytes for either engine.
    return new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(buffer.subarray(0, length));
  } catch (error) {
    if (error instanceof InputError) throw error;
    throw new InputError(error instanceof TypeError ? 'input_not_utf8' : 'input_unreadable');
  } finally {
    if (descriptor !== undefined) closeSync(descriptor);
  }
}

export function readExpectedKeys(path) {
  const keys = readText(path, 65_536).split(/\r\n|\r|\n/)
    .map(line => line.trim()).filter(line => line && !line.startsWith('#'));
  return validateExpectedKeys(keys);
}
