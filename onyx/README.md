# PTR AI

**Your code. Your intelligence.** — a local-first AI coding agent for Windows 10/11 (x64).

PTR AI reads your project, edits files (with a diff you approve), runs commands (with your approval), reads the
output, fixes errors, and reports what changed. It works with free local models through **Ollama**, with
**OpenRouter**, and with any **OpenAI-compatible** endpoint (LM Studio, llama.cpp server, vLLM…). No account needed.

## Costs — staying at €0

PTR AI itself is free. Model costs depend on the provider you pick:

| Provider | Cost |
|---|---|
| Ollama (local) | Free. Runs on your own CPU/GPU. |
| LM Studio / llama.cpp / vLLM (local, OpenAI-compatible) | Free. |
| OpenRouter | Some models are $0 (ids ending in `:free`, rate-limited). Most are paid. |

The model picker has **“Only show free models”** on by default: it lists local models and cloud models whose
published price is $0. PTR AI never promises that a cloud provider won't change its pricing.

## Install

1. Download the latest installer from <https://github.com/solarynteam/onyx/releases/latest> (or run `release/PTR AI-Setup-<version>.exe` after `npm run dist`). The installer is not code-signed, so Windows SmartScreen may ask you to
   confirm (“More info → Run anyway”).
2. Install [Ollama for Windows](https://ollama.com/download/windows) for free local models, start it, then in PTR AI's
   onboarding pick **Ollama** and download a model (e.g. `qwen2.5-coder:7b`, which supports tool calling).
   7–8B models want roughly 8 GB of free RAM/VRAM; `qwen2.5-coder:1.5b` works on smaller machines.
3. Open a project folder (Ctrl+O) and ask.

A portable unpacked build is in `release/win-unpacked/PTR AI.exe`.

### About OpenRouter free models and “rate limit reached”

Free (`:free`) models on OpenRouter share limited capacity, and an agent task sends several requests in a row.
PTR AI retries rate-limited requests 3 times (2 s, 5 s, 10 s) and asks OpenRouter to fall back to up to two other
free tool-capable models. If it still fails, the error shows the upstream provider's reason. OpenRouter also caps
free usage per day (much higher once an account has bought $10 of credits). The daily cap is not retried, and PTR AI
tells you when it's the cause. For unlimited free use, use a local Ollama model.

## Auto-updates

PTR AI checks <https://github.com/solarynteam/onyx/releases> at launch and every 6 hours, downloads new versions in the background (verified against the SHA-512 in `latest.yml`) and installs them when you click **Restart to update**. The source is fixed in the code (`OFFICIAL_UPDATE_URL` in `src/main/services/updater.ts`) and cannot be changed from the app. To publish a version, see `PUBLIER-SUR-GITHUB.md`.

## Features

- **Agent modes** — *Ask* (read-only), *Build* (edits + approved commands), *Plan* (inspects, proposes a plan you approve, then implements with live step progress).
- **Tools** — `list_directory`, `read_file`, `search_files`, `search_content`, `create_file`, `write_file`, `apply_patch`, `delete_file`, `move_file`, `create_directory`, `run_command`. Arguments are validated with zod; unknown or out-of-mode calls are rejected, never executed.
- **Safety** — every path is resolved inside the project root (traversal and symlink/junction escapes blocked); every edit shows a diff for approval (or is auto-applied and still revertible, if you choose); deletes always ask; commands always ask, dangerous ones (recursive delete, push, `reset --hard`, registry, shutdown, `iex` of downloads…) are flagged and can never be allow-listed; secrets are redacted from tool output; external changes since the agent's last read are detected.
- **Change review** — per-task list of modified files with +/− counts, inline diffs, revert / re-apply, open in editor.
- **Workspace** — Monaco editor (tabs, breadcrumbs, minimap/wrap toggles, find & replace, diff view, Ctrl+S, conflict detection), file explorer, content search, xterm.js + node-pty PowerShell terminals (multiple tabs), basic Git (status, diff, stage/unstage, commit with confirmation, log — never pushes).
- **Chat** — streaming Markdown with highlighted code, copy, apply-to-file, stop, regenerate, edit & resend, retry on errors, reasoning display, token usage when the provider reports it, @-file mentions, file/folder attachments, slash commands.
- **Models** — Ollama detection, model list with size/context/tool-capability, pull with progress & cancel, delete with confirmation. Remote providers with encrypted keys (Windows DPAPI via Electron `safeStorage`). Models without tool calling run in a clearly labeled restricted chat mode.
- **Persistence** — SQLite (sql.js/WASM) for projects, conversations, messages and changes; per-project history, model preference and panel sizes; interrupted runs are flagged after restart with a *Continue* action.
- **UI** — custom title bar with session tabs, Chat / Code / Workspace layouts with resizable, collapsible panes, command palette (Ctrl+Shift+P), quick open (Ctrl+P), configurable shortcuts, dark & light themes, English & French, onboarding.

## Development

```powershell
npm install
npm run dev          # Electron + Vite with hot reload
npm run typecheck
npm test             # unit + integration tests (mock model server); live Ollama test auto-skips if Ollama is down
npm run test:e2e     # builds, then drives the real Electron app end-to-end (Playwright)
npm run dist         # icons + build + Windows NSIS installer into release/
```

**Packaging note:** NSIS cannot open files whose full path exceeds 260 characters. If `npm run dist` fails with
`!include: could not open file`, build from a short folder such as `C:\dev\onyx`.

## Architecture

```
src/
  main/                 Electron main process (all privileged work)
    index.ts            window, IPC allowlist + zod validation, service wiring
    agent/              engine.ts (loop, approvals, context budget), tools.ts (typed tools), prompt.ts
    providers/          ollama.ts, openai.ts (OpenAI-compatible + OpenRouter), types.ts (errors, streaming)
    services/           db.ts (SQLite), workspace.ts (path guard, fs), commands.ts (policy, runner, redaction),
                        terminal.ts (node-pty), git.ts (controlled git CLI), config.ts (settings + encrypted keys)
  preload/index.ts      contextBridge exposing only allowlisted invoke/on channels
  renderer/             React + Tailwind + Zustand UI (no Node access; contextIsolation, sandbox, CSP)
  shared/               types, IPC channel list, logo geometry
scripts/make-icons.mjs  generates SVG/PNG/ICO logo assets (no external tools)
tests/                  vitest unit/integration tests, mock model server, e2e smoke test
```

## License

Proprietary, all rights reserved. See [LICENSE](../LICENSE): free to download and use; copying, modifying, redistributing or building an app based on PTR AI is forbidden.

## Terms of Service & mandatory updates

- **Terms of Service**: shown at first launch and blocking until accepted (declining quits the app). The text is in
  `src/renderer/src/lib/terms.ts`; bump `TOS_VERSION` in `src/shared/app.ts` to make every user accept a new version.
  The main process also refuses to run the agent until the current version is accepted.
- **Mandatory updates**: there is no opt-out. When a newer release is found, a blocking "Update required" screen is shown
  until it is installed (Windows: downloaded in the background, then "Restart to update"; macOS: download page).
  If the update server is unreachable, the app keeps working until the next successful check.
- The release repository is set in one place: `GITHUB_REPO` in `src/shared/app.ts` (and `publish` in `package.json`).
