# Repository Guidelines

## Project Status & Structure

This workspace implements a local Chrome Manifest V3 extension in TypeScript with a native HTML/CSS control page, plus a Windows-only Node.js watcher script that moves qualifying files to a chosen output folder. The implementation and automated checks are complete; live Windows, Chrome, YouTube, and folder-move acceptance remain with the user. See docs/validation.md and the OpenSpec task checklist for status. Source is in src/, Vitest tests in tests/, build logic is in scripts/build.mjs, the source manifest is manifest.json, the control-page entry point is index.html, and watch-dramas.cmd is the Windows launcher. The generated dist/ directory is not committed.

For the first implementation, keep executable source in `src/`, automated tests in `tests/`, and supporting documentation in `docs/` when needed. Add `assets/` only if the project requires static resources. Document the actual layout and entry point in `README.md`; avoid creating empty directories merely to match this suggested structure.

## Build, Test, and Development Commands

Target runtime: Node.js 22.12+ within major version 22 (.nvmrc); Chrome 120+. Install from the committed package-lock.json with npm ci. Configured commands: npm run format, npm run format:check, npm run lint, npm run typecheck, npm test, npm run build, and npm run check (all checks plus build). The lockfile passes npm ci dry-run validation; the user performs the clean install and Chrome acceptance.

When introducing tooling, provide reproducible installation, local execution, and validation commands in `README.md`. Commit the relevant dependency manifest and lockfile, and specify the required runtime version.

## Coding Style & Naming Conventions

Follow the conventions of the selected language and use consistent indentation within each file. Prefer descriptive names for modules, functions, and configuration keys. Keep modules focused and avoid mixing unrelated responsibilities.

Add formatter and linter configuration alongside the first source files. Use Prettier with single quotes and ESLint. Keep pure parsing, browser adapters, orchestration, persistence, and UI rendering separate. Render untrusted page text using textContent.

## Testing Guidelines

Use Vitest with tests/*.test.ts, Domino for server-side page parsing, and fake-indexeddb for storage. Cover the twenty-name limit, punctuation-insensitive full-title matching, search-card display text, a failed search that keeps earlier results, clearing an old stored task, and storage failure. Folder watching additionally covers the Windows-only platform gate, file-name to drama name, view-count conversion, multiple source folders sharing one discovery order, hidden and system files, file-identity fallback, numbered names in the output folder, cross-volume moves, ledger and locks, the local port, and script-versus-manual exclusivity. Keep live Windows, Chrome, YouTube, and output-folder acceptance distinct from fixture tests. Never mark partially implemented or unverified OpenSpec tasks complete.

## Commit & Pull Request Guidelines

No Git history is available from which to infer commit conventions. Use short, imperative commit subjects, such as `Add script input validation`, and keep each commit focused.

Pull requests should explain the purpose, summarize behavior changes, and report validation commands and results. Link relevant issues when available. Include screenshots only for visible interface changes, and identify any setup steps reviewers need.

## Security & Configuration

Never commit credentials, access tokens, or private input data. If environment variables are introduced, provide an example configuration containing placeholders and ignore local secret files and generated outputs.
