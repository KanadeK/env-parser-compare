# Third-party components

Project source and synthetic fixtures were written for this project under MIT.
No competitor parser implementation or fixture is copied or vendored.

The sole runtime package is **dotenv 18.0.9**, separately installed by npm under
BSD-2-Clause: [source and license](https://github.com/motdotla/dotenv). Its copyright
is Copyright (c) 2015, Scott Motte; all rights reserved. Its notices
and full license remain in the installed upstream package. It is not bundled into
this project's tarball or reattributed. The native parser and worker facilities
come from the separately installed Node.js runtime (Node's license and bundled
component notices apply). Neither runtime is redistributed here.

Development packages: ESLint and @eslint/js (MIT), globals (MIT), plus the
transitive packages recorded with license and integrity metadata in package-lock.
They are not runtime dependencies or bundled in the release tarball. Preserve
upstream package notices. CI uses actions/checkout and actions/setup-node (MIT),
pinned to Git commit IDs. No Actions workflow creates code commits.

Related tools and issue links in documentation are references, not dependencies.
