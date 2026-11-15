# Contributing to bh-ai

Thanks for helping improve bh-ai. Bug reports, documentation fixes, English and
Hinglish command improvements, and focused code contributions are welcome.
Please follow the [community guidelines](CODE_OF_CONDUCT.md).

## Before starting

Read the [README](README.md) for the current implementation scope and setup.
For larger changes, open an issue first to discuss the problem and approach.
Report vulnerabilities using [SECURITY.md](SECURITY.md).

Use an Apple Silicon Mac with macOS 14+, Node.js 24 (see `.nvmrc`), npm, and Xcode
Command Line Tools. Fork the repository on GitHub, clone your fork, and create a
branch for your change.

```bash
npm ci
npm run build
npm test
```

The tests run against compiled files, so rebuild after source changes. To launch
the desktop app afterward:

```bash
npm run rebuild:electron
npm start
```

If Node-based tests report a `better-sqlite3` ABI mismatch, run
`npm rebuild better-sqlite3` before retrying. Restore the Electron native module
with `npm run rebuild:electron` before starting the app.

## Making a change

- Keep pull requests focused on one problem and follow the surrounding TypeScript style.
- Keep command resolution deterministic and preserve chat and project isolation.
- Validate data crossing process boundaries. Use fixed argument arrays for local
  commands and preserve existing permission checks.
- Keep database changes in forward migrations; do not edit previously applied migrations.
- Add meaningful regression coverage for behavior changes. Update documentation
  when setup, commands, or public MCP behavior changes.
- Use synthetic project data in fixtures and screenshots. Never commit personal
  databases, tokens, local agent configs, or logs containing private information.

## Opening a pull request

Describe the problem, the resulting behavior, and the checks you ran. Include
before/after screenshots for visual changes. State any platform limitations or
checks you could not run; do not report unexecuted tests as passing.

Run `npm run typecheck` and the relevant test suite before requesting review.
The default `npm test` covers the current P4 master suite; `npm run test:p1`
also includes Electron verification on macOS.

Contributions are distributed under the repository's [MIT license](LICENSE).
Third-party code and assets must retain their required notices and be compatible
with inclusion in this project.
