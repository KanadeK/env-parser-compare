# v0.1.0

Initial real-engine env parser migration check.

- Compare native Node util.parseEnv and actual dotenv 18.0.9 parse results.
- Presence/value equality, optional order gating and exact expected-key lists.
- Default key/value non-disclosure, candidate line hints and explicit versions.
- Bounded worker lifetimes/input/key sets; incomplete runs cannot pass.
- Real API oracle tests, complete CLI regressions, fresh tarball installation and
  uninstall, ESLint, Node syntax checks and read-only Linux/Windows CI.

Limitations: parsing only. No environment loading, variable expansion, overrides,
multi-file merging, fast mode or other-language engines. Agreement does not imply
syntax validity or an application boot guarantee. Initial dependency installation
needs registry access or a prepared npm cache. See README for full boundaries.
