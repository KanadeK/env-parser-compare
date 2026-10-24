# Contributing

Describe a real migration failure and provide a tiny synthetic env fixture with
the Node and dotenv versions. Do not include production configuration or values.
This project compares fixed, real parse-only APIs; it does not implement a new
dotenv grammar or populate process.env.

Use Node 22.13+ (22.x) or Node 24+. Run `npm ci --ignore-scripts`, `npm test`,
`npm run lint`, `npm run check`, `npm audit`, and `npm run smoke`. The smoke test
packs the real tarball, explicitly prepares an initially empty private npm cache
with the exact dependency (network required), installs offline, runs examples and
uninstalls offline. Keep the one runtime dependency pinned; update its lockfile deliberately
and rerun actual engine conformance fixtures.

Changes must preserve default value/key non-disclosure and incomplete-run errors.
Use real engine outputs as an oracle; never replace a parser with test fixtures.
Consider BOM/CRLF, duplicate/prototype keys, multiline strings, worker failures,
CLI exit codes and clean package installation when changing behavior.

The maintainer reviews suggestions before integration. CI only checks and tests;
it never commits, merges, or updates dependencies. Preserve third-party licenses
and actual authorship. Do not add copied implementations without provenance or
coauthor trailers for work not actually authored by those people.
