# Onyx — progress log

_Last updated: 2026-11-21_

## Verified

| Check | Result |
|---|---|
| `npm run typecheck` | passes (0 errors) |
| `npm test` | 37 tests pass (path guard, symlink escape, ignores, CRLF preservation, command policy, redaction, tool validation, Ollama + OpenAI-compatible streaming incl. split tool-call chunks, HTTP error mapping, agent multi-step loop on both protocols, edit rejection, traversal from model calls, ASK-mode enforcement, denied commands, apply_patch, external-modification conflict, loop detection, iteration limit, cancellation, timeout, provider errors, PLAN approve flow, persistence across reopen, corrupted-DB recovery, project isolation, context trimming). Live Ollama test skipped (not installed here). |
| E2E (dev build) | passes: onboarding → Ollama detection → model select → open project → agent creates file (approved diff) → runs PowerShell (approved) → real output shown → Workspace layout with Monaco + live terminal → change review → light theme → settings → restart → history restored. |
| E2E (packaged `win-unpacked/Onyx.exe`) | same flow passes, confirming node-pty and SQLite-WASM work after packaging. |
| Installer | `release/Onyx Setup 1.0.0.exe` built with electron-builder (NSIS, x64). Not code-signed. Installation itself was not run on this machine. |

The e2e tests use a **mock model server** speaking the Ollama protocol. **No live model was tested** on this
machine: Ollama isn't installed and no OpenRouter key was available. The provider code follows the documented
Ollama `/api/chat`, `/api/tags`, `/api/show`, `/api/pull`, `/api/delete` and OpenAI Chat Completions streaming formats.

## v1.4.0 (2026-11-21) — MCP + OpenCode Go

- **OpenCode key bug**: OpenCode Go subscription keys only work on `https://opencode.ai/zen/go/v1`, and Zen rejected them with "Invalid credential". Added an **OpenCode Go** provider, the `x-opencode-session` header (one per conversation) and an `Onyx/<version>` User-Agent, as OpenCode requires for third-party clients. A 401 now explains which provider the key belongs in. Verified against the real server with a fake key: the request shape is accepted, only the key is refused. Not verified with a real Go key (none available).
- **MCP** (`src/main/services/mcp.ts`, official `@modelcontextprotocol/sdk`): stdio and Streamable HTTP servers; Settings → MCP (status, tools, enable, always ask, restart, edit, delete), Roblox Studio auto-detection (`%LOCALAPPDATA%\Roblox\mcp.bat` → StudioMCP), import from Claude Desktop / Claude Code configs, secret env vars / headers encrypted.
- Agent: MCP tools named `mcp__<server>__<tool>`. Build mode uses all of them; Ask/Plan only read-only ones; they work without a project. Permissions: read-only tools never ask; Auto asks for destructive tools; Approval asks for every non-read-only tool; "Always allow" per tool; per-server "Always ask".
- Verified: 55 unit/integration tests (including a real stdio MCP test server); e2e on the packaged app connects Roblox Studio (39 tools listed).

## v1.3.0 (2026-11-21) — macOS

- **macOS support in the code**: native traffic-light window (hiddenInset), ⌘ shortcuts (stored as "Ctrl", mapped to Cmd on Mac, shown as ⌘⇧…), agent commands in the login shell (zsh) with process-group kill, interactive terminal zsh/bash, platform-aware system prompt (python3, POSIX syntax), Run buttons with Mac commands (python3, clang, sh, swift), extra dangerous patterns (sudo, rm -rf /|~, killall, diskutil, defaults write, /System…), Dock re-open.
- **Updates on Mac**: unsigned builds can't auto-install (Squirrel.Mac requires a Developer ID), so Onyx detects the new version (`latest-mac.yml`) and offers the download page (`available` state).
- **Packaging**: `build.mac` (dmg + zip, ad-hoc signature `identity: "-"` so Apple Silicon can launch it, 1024 px icon), `npm run dist:mac`.
- **CI**: `.github/workflows/release-macos.yml` builds arm64 (macos-14) and x64 (macos-13) when a release is published, runs typecheck + tests, uploads dmg/zip/blockmap, and merges `latest-mac.yml` (merge script tested locally).
- **Site** moved to `docs/` (GitHub Pages /docs): OS detection (Windows / Mac Apple Silicon / Mac Intel via WebGL), per-platform primary button, other platforms listed, Mac first-launch help, `?os=` override.
- **NOT verified**: the macOS build itself (no Mac here). It will be verified the first time the workflow runs on GitHub. Windows 1.3.0 is built and its features e2e passes on the packaged app.
- **Known flaky test**: smoke e2e sometimes starts without the onboarding (the app looks already configured). Seen before 1.3.0, intermittent; not investigated yet.

## v1.2.2 (2026-11-21)

- Update feed fixed in code to `https://github.com/solarynteam/onyx/releases/latest/download` (`OFFICIAL_UPDATE_URL`); the setting and its UI field are gone, so the source cannot be changed from the app. Only a localhost feed can be injected, for tests (`ONYX_TEST_UPDATE_URL`).
- Version is read only from `package.json` (app, onboarding, installer name, site). Docs no longer hard-code version numbers.
- Download website in `../site/index.html`: EN/FR, live version, size and direct `.exe` link from the GitHub API, falling back to the releases page.
- Verified on the packaged 1.2.2: the real GitHub feed is read (1.2.1 is older, so the app reports up to date); the simulated 9.9.9 update downloads and is verified. Smoke e2e failed once in a 4-test run, then passed twice on rerun.
## v1.2.1 (2026-11-21)

- Native Windows `confirm()` popups replaced everywhere (11 places) by Onyx's own dialog (`ConfirmModal`, Enter/Escape, red action for destructive operations, translated).
- Onboarding shows the real app version instead of a hard-coded “1.0”.
- ASCII wordmark redrawn with Unicode half-blocks (█ ▀ ▄) instead of `*@#:`.
- Project now lives in `Documents\OnyxFolder\onyx` (dependencies reinstalled there). All 3 e2e tests pass on the packaged 1.2.1.

## v1.2.0 (2026-11-21)

- **Providers**: OpenCode Zen built in (OpenAI-compatible; per-model chat URL, $0 models detected from `cost`, tool support from `capabilities`). Presets for OpenAI, Gemini, Groq, Mistral, DeepSeek, LM Studio, Custom. OpenAI catalog filters non-chat models.
- **Bug fixed — "no models with my OpenAI key"**: “Only show free models” hid every model without published pricing. It now hides only known-paid models and shows “N paid models hidden · show”.
- **Stalls fixed**: Ollama now gets `num_ctx` (default window silently truncated the prompt); a model that announces a step without a tool call (or returns nothing) is nudged to continue, at most twice; idle timeout raised to 300 s; Continue button after stop/error/limit; no retry when the server asks to wait > 30 s (e.g. OpenCode free quota).
- **Permissions**: Auto (default: everything except dangerous commands and deletes) / All (everything, confirmation required to enable, paths still confined) / Approval (asks for everything).
- **UI**: approvals float in front, above the composer; mode menu uses click-outside (fixed Ask in Code layout); full French translation; Run button for code blocks (Python/JS/TS/PowerShell/cmd/Lua) and files (+ HTML preview in an isolated window); terminal works without a project.
- **Bug fixed — Apply to file**: `window.prompt()` isn't implemented in Electron, so it never worked; replaced by an in-app dialog. Without a project it now asks which project to use and moves the conversation there.
- Verified: 47 unit/integration tests; 3 e2e tests (smoke, features in French, auto-update) pass on the packaged 1.2.0.
- **Not verified with a live model**: no Ollama on this machine, no API keys available. A keyless OpenCode Zen call returned its free-usage limit error.

## v1.1.0 (2026-11-21)

- Logo: the IV monogram was replaced by a geometric **ONYX** wordmark (`src/shared/logo.json` drives the app, ASCII art and icons; 16–32 px icons use the O alone).
- OpenRouter: retry with backoff on 429/502/503, `models` fallback to other free tool-capable models, upstream reason shown, daily free-quota detected (not retried). 2 new tests (39 pass).
- Auto-update via electron-updater (generic feed URL set in Settings → About). Verified on the packaged app: a served feed announcing 9.9.9 was detected, downloaded, SHA-512-verified and the “Restart to update” banner appeared (`tests/e2e/update.e2e.ts`). The final install/relaunch step was not run, because it would install software on this machine.
- Packaged smoke e2e passes on 1.1.0.

## Not done / limitations (honest list)

- **OpenCode backend** (optional in the spec): not implemented. The provider layer (`src/main/providers`) is built to take another provider.
- **Linting**: no ESLint config; only TypeScript strict checks.
- **Git**: implemented, but not exercised here because Git isn't installed on this machine (the app shows an install hint when Git is missing).
- **Language servers**: Monaco gives syntax highlighting for all listed languages and its built-in TS/JS/JSON/CSS/HTML services. No LSP for Python, C#, Rust, Go, etc.
- **Long conversations**: rendered in pages of 80 messages with `content-visibility`, not true list virtualization.
- **RAM check**: Onyx shows Ollama's own “not enough memory” errors; it does not pre-check RAM before loading a model.
- **Window size/position** isn't persisted between launches (panel sizes and layout are, per project).
- **Code signing / auto-update**: none.
- **Context budget** uses a chars/4 estimate; older turns are trimmed with an extractive summary (no LLM summarization).

## Next steps

1. Install Ollama, `ollama pull qwen2.5-coder:7b`, run `npm test` (live test runs automatically), then try a real task in the app.
2. Install Git and exercise the Source control panel on a repository.
3. Add ESLint (typescript-eslint + react-hooks) and fix findings.
4. Optional: OpenCode provider, LSP integration, window-state persistence, code signing.
