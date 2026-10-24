# env-parser-compare

Test how **the same env file** parses in native Node.js `util.parseEnv` and the
real `dotenv.parse` API before switching loaders. Report missing keys, different
string values and property order without printing the values.

[中文说明](README.zh-CN.md) · [MIT](LICENSE) · Node 22.13+ (22.x) or 24+

This is a parser migration check. It compares actual installed engines rather
than guessing a universal dotenv grammar. No env file is sourced, expanded,
executed or loaded into `process.env`. The runtime does not fetch anything.

## Try it from source

```sh
git clone https://github.com/KanadeK/env-parser-compare.git
cd env-parser-compare
npm ci --ignore-scripts
node bin/env-parser-compare.mjs examples/portable.env.example
node bin/env-parser-compare.mjs examples/different.env.example
node bin/env-parser-compare.mjs examples/value.env.example
```

The portable example exits **0**. The colon-assignment example exits **1** because
native Node ignores a key that dotenv parses. The escaped-quote example exits
**1** because the actual string values differ. All fixtures are synthetic; these
behaviors are tested with the CI Node versions. A future parser update may change
the result, so each receipt records actual Node and dotenv versions.

For a packaged command, download `env-parser-compare-0.1.0.tgz` from GitHub Releases:

```sh
npm install --global --ignore-scripts ./env-parser-compare-0.1.0.tgz
env-parser-compare path/to/config.env
```

Initial installation needs npm registry access for the pinned dotenv dependency
unless it is already cached. No npm registry publication of this project is
implied. Once installed, comparisons run offline. To use it as a library, install
the tarball in your own project with `npm install --ignore-scripts ./path/to/tarball.tgz`.

## Understand a report

```json
{
  "complete": true,
  "ok": false,
  "values_agree": false,
  "keys": [{
    "id": "key-0001",
    "candidate_lines": [2],
    "native_present": false,
    "dotenv_present": true,
    "values_equal": null,
    "issues": ["presence_difference"]
  }]
}
```

This excerpt omits version/order fields and additional candidate counts. Default
reports contain per-run ordinal key IDs, **no variable names**, values, value
lengths, value hashes, input paths, source snippets or raw engine errors. IDs map
the lexically sorted union of keys; they are not hashes or stable identifiers
across different files. Names and values still exist in process memory during
comparison; the tool does not promise secure memory erasure.

To inspect local key names explicitly:

```sh
node bin/env-parser-compare.mjs --show-keys examples/different.env.example
```

`--show-keys` can reveal private names or text a permissive parser interpreted as
a key. It never intentionally includes values. Review reports before sharing.
Line numbers are **lexical candidates**, limited to the first 32 per key with a
remaining count. They can include assignments inside multiline quoted values or
miss unusual key syntax. They are navigation hints, not parser source locations.
The equality decision always comes from the real APIs, independently of hints.

`values_agree` means both parsers produced the same own key set and exact string
values. No type coercion or Unicode/newline normalization is applied. Empty
strings are compared distinctly from absent keys. BOM and CRLF input are preserved
when decoding UTF-8. Key order is always reported with the same ordinal IDs.

## Add a migration gate

```sh
node bin/env-parser-compare.mjs --check-order examples/order.env.example
node bin/env-parser-compare.mjs --expect-keys examples/required.keys examples/portable.env.example
```

`--check-order` also fails if property enumeration order differs. Order can matter
to separate expansion tools ([Node issue 62736](https://github.com/nodejs/node/issues/62736));
this tool does **not** run an expansion tool or claim that ordering affects every
application. It records the actual order on the current runtime.

An expected-key file lists the exact required keys, one per line, with optional
blank lines and `#` comments. Keys use `[A-Za-z0-9_.-]{1,256}` and duplicates are
errors. Missing keys (even if both parsers omit them) and unexpected keys fail.
Never paste a real env assignment into this schema: only names belong there.
An empty list requires both parsers to produce zero keys.

Exit codes: **0** both engines finish, outputs agree and requested gates pass;
**1** presence/value/order/expected-key difference; **2** invalid input, resource
limit, worker failure or incomplete comparison. Checks write one JSON object to
stdout and no source-bearing diagnostic to stderr. `--help` and `--version` print
plain text. Redirect stdout using your shell if you want to save a receipt.

Two parsers can agree on silently ignored malformed input. A pass is **agreement,
not syntax validity, secret detection or proof that your app will boot**. Use an
expected-key list to protect required names, and a linter/schema validator for
additional checks.

## Scope and limits

- Fixed engines: current installed native Node parser and dotenv's default parse
  API, pinned to **18.0.9** in package metadata and lockfile. No custom parser code,
  plugins, shell evaluation, interpolation or command execution.
- No `.env` discovery, multi-file merge, environment override rules, dotenv-expand,
  dotenv fast mode, encryption, Docker Compose, Python, Bash or PowerShell model.
  Check those loaders separately. A report describes only the versions it names.
- Strict UTF-8, at most **1 MiB** per env input, **64 KiB** per expected-key file,
  **4,096 keys** per engine and union, and **256 UTF-16 code units** per actual
  key. Over-limit results are incomplete; nothing is silently skipped.
- Each engine runs in a fixed worker with an empty environment, captured/discarded
  worker stdout/stderr, a default **5-second** deadline (`--timeout-ms 1..60000`)
  and V8 old-generation limit of 64 MiB. This is not an OS sandbox or a bound on
  total Node RSS/native allocations. The input/keys caps also limit retained data.
- Read stable regular local files. Final symlinks are refused; parent directories
  can resolve through links. No atomic hostile-filesystem snapshot is promised.
  File IO can stall independently of the parser deadline. The CLI writes no file,
  changes no environment, and leaves the input untouched.

## JavaScript API

After installing the tarball as a dependency in your project:

```js
import { compare } from 'env-parser-compare';

const report = await compare('HOST=example.invalid\nPORT=8080\n', {
  expectedKeys: ['HOST', 'PORT'],
  checkOrder: false,
  showKeys: false,
  timeoutMs: 5000
});
if (!report.complete || !report.ok) throw new Error('Parser migration gate failed');
```

`InputError` rejects invalid API arguments. Worker failures resolve to an explicitly
incomplete report. No raw parsed value is returned through this public API.

## Verify and remove

```sh
npm ci --ignore-scripts
npm test
npm run lint
npm run check
npm audit
npm run smoke
```

Tests use the real native and dotenv APIs as independent oracles, cover complete
CLI outcomes, privacy, expected keys, timeouts, input limits, BOM/CRLF, duplicate
and prototype-like names. ESLint checks code quality; Node checks every JS file's
syntax. The smoke test packs the **real release tarball**, installs it in a new
directory offline using the dependency cache populated by `npm ci`, runs all
three examples through the installed CLI, then uninstalls. CI covers Linux and
Windows with Node 22 and 24; its token has read-only repository access.

Uninstall the global command with `npm uninstall --global env-parser-compare`, or
remove a project dependency with `npm uninstall env-parser-compare`. You can then
delete your clone's `node_modules` and `dist` if you created them. There is no
service, background agent or per-user application cache. npm's own cache is managed
by npm; this tool does not erase or modify other projects.

Alternatives: [dotenv-linter](https://github.com/dotenv-linter/dotenv-linter) for
syntax/style checks; [dotenv](https://github.com/motdotla/dotenv) for loading and
parsing; native [Node parseEnv](https://nodejs.org/api/util.html#utilparseenvcontent)
for dependency-free application parsing. This tool adds actual-engine comparison,
private reports, expected-key gates and incomplete-run handling to those APIs.
See [CONTRIBUTING](CONTRIBUTING.md), [SECURITY](SECURITY.md) and
[third-party notices](THIRD_PARTY.md).
