// Agent orchestration: context → inference → tool call → permission → execution → repeat.
import { randomUUID } from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import type { McpToolInfo } from '../../shared/types'
import type { AgentEvent, AgentMode, ApprovalDecision, ApprovalRequest, ChatMessage, Conversation, FileChange, PlanState, Settings, ToolCall, ToolSupport } from '../../shared/types'
import type { Database } from '../services/db'
import { Workspace, PathError } from '../services/workspace'
import { classifyCommand, isAllowlisted, redact, runCommand, truncateMiddle } from '../services/commands'
import { ProviderError, type Provider, type ProviderMessage, type StreamChunk } from '../providers/types'
import { parseToolCall, toolSpecs, toolsForMode, type ToolName } from './tools'
import { buildSystemPrompt } from './prompt'

export interface AgentDeps {
  db: Database
  getWorkspace(projectId: string | null): Workspace | null
  getProvider(providerId: string): Provider
  getToolSupport(providerId: string, model: string): ToolSupport
  settings(): Settings
  emit(ev: AgentEvent): void
  getAllowlist(projectId: string): string[]
  addToAllowlist(projectId: string, key: string): void
  /** Context window reported by the provider for a model, when known. */
  getContextLength?(providerId: string, model: string): number | undefined
  /** Tools of connected MCP servers (Roblox Studio, …). */
  mcp?: {
    tools(): McpTool[]
    call(serverId: string, tool: string, args: Record<string, unknown>, signal: AbortSignal): Promise<{ ok: boolean; text: string }>
    alwaysAsk(serverId: string): boolean
  }
  /** Override for tests. */
  inferenceIdleTimeoutMs?: number
}

export interface McpTool { serverId: string; serverName: string; publicName: string; tool: McpToolInfo }

export interface SendOptions {
  convId: string
  text: string
  attachments?: string[]
  mode: AgentMode
  providerId: string
  model: string
}

interface RunCtx {
  runId: string
  conv: Conversation
  ws: Workspace | null
  mode: AgentMode
  abort: AbortController
  isRemote: boolean
  /** One-shot instruction appended to the next inference (not stored in history). */
  nudge?: string
}

/** Text that announces more work but contains no tool call ("I'll now create…"). */
export function looksUnfinished(text: string): boolean {
  const t = text.trim()
  if (!t) return true
  const tail = t.slice(-300)
  if (/[:：]\s*$/.test(t)) return true
  if (/"name"\s*:\s*"(write_file|create_file|apply_patch|run_command|read_file)"|<tool_call>|```tool/i.test(t)) return true
  return /\b(let me(?! know)|i'll|i will|i am going to|i'm going to|now i|next,? i|let's|je vais|maintenant,? je|ensuite,? je|commençons)\b/i.test(tail) && !/\b(summary|résumé|done|terminé|completed|finished)\b/i.test(tail)
}

const TOOL_OUTPUT_LIMIT = 12000

export class AgentEngine {
  private runs = new Map<string, RunCtx>() // by convId
  private approvals = new Map<string, { resolve: (d: ApprovalDecision) => void; req: ApprovalRequest }>()

  constructor(private deps: AgentDeps) {}

  isRunning(convId: string) { return this.runs.has(convId) }

  cancel(convId: string) {
    const r = this.runs.get(convId)
    if (!r) return
    r.abort.abort()
    for (const [id, a] of this.approvals) if (a.req.convId === convId) { a.resolve('deny'); this.approvals.delete(id) }
  }

  resolveApproval(requestId: string, decision: ApprovalDecision) {
    const a = this.approvals.get(requestId)
    if (!a) return false
    this.approvals.delete(requestId)
    a.resolve(decision)
    this.deps.emit({ type: 'approval_resolved', runId: a.req.runId, convId: a.req.convId, requestId })
    return true
  }

  private perm(): Settings['permissionMode'] { return this.deps.settings().permissionMode ?? 'auto' }

  pendingApprovals(): ApprovalRequest[] { return [...this.approvals.values()].map((a) => a.req) }

  private requestApproval(ctx: RunCtx, req: Omit<ApprovalRequest, 'id' | 'runId' | 'convId'>): Promise<ApprovalDecision> {
    if (ctx.abort.signal.aborted) return Promise.resolve('deny')
    const full: ApprovalRequest = { ...req, id: randomUUID(), runId: ctx.runId, convId: ctx.conv.id }
    return new Promise((resolve) => {
      this.approvals.set(full.id, { resolve, req: full })
      this.deps.emit({ type: 'approval', runId: ctx.runId, convId: ctx.conv.id, request: full })
    })
  }

  async approvePlan(convId: string, providerId: string, model: string) {
    const conv = this.deps.db.getConversation(convId)
    if (!conv?.plan) throw new Error('No plan to approve')
    this.deps.db.saveConversation({ ...conv, plan: { ...conv.plan, approved: true }, mode: 'build' })
    return this.send({ convId, mode: 'build', providerId, model, text: 'The plan is approved. Implement it now, step by step. Call update_plan_step as you start and finish each step, verify your work, then summarize.' })
  }

  async send(opts: SendOptions): Promise<void> {
    const { db } = this.deps
    let conv = db.getConversation(opts.convId)
    if (!conv) throw new Error('Conversation not found')
    if (this.runs.has(conv.id)) throw new Error('A task is already running in this session')

    const runId = randomUUID()
    const isFirst = db.listMessages(conv.id).length === 0
    conv = {
      ...conv, mode: opts.mode, providerId: opts.providerId, model: opts.model, runState: 'running', updatedAt: Date.now(),
      title: isFirst ? opts.text.replace(/\s+/g, ' ').slice(0, 60) || conv.title : conv.title
    }
    db.saveConversation(conv)

    const userMsg: ChatMessage = { id: randomUUID(), convId: conv.id, role: 'user', content: opts.text, createdAt: Date.now(), attachments: opts.attachments, runId }
    db.addMessage(userMsg)

    const ws = this.deps.getWorkspace(conv.projectId)
    const provider = this.deps.getProvider(opts.providerId)
    const ctx: RunCtx = { runId, conv, ws, mode: opts.mode, abort: new AbortController(), isRemote: provider.config.kind !== 'ollama' }
    this.runs.set(conv.id, ctx)
    this.deps.emit({ type: 'run_start', runId, convId: conv.id })
    this.deps.emit({ type: 'message', runId, convId: conv.id, message: userMsg })

    let status: 'done' | 'cancelled' | 'error' | 'limit' | 'awaiting_plan' = 'done'
    let error: string | undefined
    try {
      status = await this.loop(ctx, provider, opts.model)
    } catch (e) {
      if (ctx.abort.signal.aborted) status = 'cancelled'
      else { status = 'error'; error = (e as Error).message }
    } finally {
      this.runs.delete(conv.id)
      const latest = db.getConversation(conv.id)
      if (latest) db.saveConversation({ ...latest, runState: 'idle', updatedAt: Date.now() })
      if (error) {
        const m: ChatMessage = { id: randomUUID(), convId: conv.id, role: 'assistant', content: '', error, createdAt: Date.now(), runId, model: opts.model }
        db.addMessage(m)
        this.deps.emit({ type: 'message', runId, convId: conv.id, message: m })
      }
      db.flush()
      this.deps.emit({ type: 'run_end', runId, convId: conv.id, status, error })
    }
  }

  private async loop(ctx: RunCtx, provider: Provider, model: string) {
    const { db, settings } = this.deps
    const s = settings()
    let toolSupport = this.deps.getToolSupport(provider.config.id, model)
    const lastCalls: string[] = []
    let nudges = 0
    const modelCtx = this.deps.getContextLength?.(provider.config.id, model)
    const numCtx = provider.config.kind === 'ollama' ? Math.min(modelCtx ?? 32768, Math.max(8192, s.contextBudgetTokens + 4096)) : undefined

    for (let iter = 0; iter < s.maxIterations; iter++) {
      if (ctx.abort.signal.aborted) return 'cancelled'
      const conv = db.getConversation(ctx.conv.id)!
      const allowed = ctx.ws ? toolsForMode(ctx.mode, !!conv.plan?.approved) : []
      // MCP tools: everything in Build mode; only tools marked read-only in Ask / Plan.
      const mcpTools = (this.deps.mcp?.tools() ?? []).filter((t) => ctx.mode === 'build' || t.tool.readOnly)
      const useTools = toolSupport !== 'no' && (allowed.length > 0 || mcpTools.length > 0)
      const messages = this.buildMessages(ctx, conv, useTools, s)
      if (ctx.nudge) { messages.push({ role: 'user', content: ctx.nudge }); ctx.nudge = undefined }

      let text = ''
      let reasoning = ''
      const calls: (StreamChunk & { type: 'tool_call' })[] = []
      let usage: ChatMessage['usage']
      const infer = new AbortController()
      const onAbort = () => infer.abort()
      ctx.abort.signal.addEventListener('abort', onAbort, { once: true })
      try {
        for await (const ch of this.withIdleTimeout(provider.chat({ model, messages, tools: useTools ? [...toolSpecs(allowed), ...mcpTools.map(mcpSpec)] : undefined, signal: infer.signal, numCtx, sessionId: `ptrai-${ctx.conv.id}` }), infer)) {
          if (ch.type === 'text') { text += ch.text; this.deps.emit({ type: 'delta', runId: ctx.runId, convId: ctx.conv.id, text: ch.text }) }
          else if (ch.type === 'reasoning') { reasoning += ch.text; this.deps.emit({ type: 'reasoning', runId: ctx.runId, convId: ctx.conv.id, text: ch.text }) }
          else if (ch.type === 'tool_call') calls.push(ch)
          else if (ch.type === 'usage') usage = { promptTokens: ch.promptTokens, completionTokens: ch.completionTokens }
        }
      } catch (e) {
        if (ctx.abort.signal.aborted) {
          if (text) this.saveAssistant(ctx, model, text + '\n\n_[stopped]_', reasoning, [], usage)
          return 'cancelled'
        }
        // Model rejected tools: fall back to restricted chat mode instead of faking tool calls.
        if (useTools && toolSupport === 'unknown' && e instanceof ProviderError && /tool/i.test(e.message) && e.code !== 'auth') {
          toolSupport = 'no'
          this.deps.emit({ type: 'status', runId: ctx.runId, convId: ctx.conv.id, text: 'This model does not support tool calling — continuing in restricted chat mode (no file or command access).' })
          iter--
          continue
        }
        throw e
      } finally {
        ctx.abort.signal.removeEventListener('abort', onAbort)
      }

      const toolCalls: ToolCall[] = calls.map((c) => ({ id: c.id, name: c.name, args: c.args }))
      if (text || reasoning || toolCalls.length) this.saveAssistant(ctx, model, text, reasoning, toolCalls, usage)
      if (!toolCalls.length) {
        // Small models often announce the next step without calling a tool, or return nothing. Nudge them (max 2×).
        if (useTools && ctx.mode !== 'ask' && nudges < 2 && looksUnfinished(text)) {
          nudges++
          ctx.nudge = text.trim()
            ? 'You described the next step but did not call a tool. Continue now by calling the appropriate tool with real tool calls (not text). If the task is fully finished and verified, reply with the final summary instead.'
            : 'Your last reply was empty. Continue the task by calling the appropriate tool, or give the final summary if everything is done.'
          this.deps.emit({ type: 'status', runId: ctx.runId, convId: ctx.conv.id, text: 'The model paused without acting — asking it to continue…' })
          continue
        }
        if (!text.trim() && !toolCalls.length) throw new Error('The model returned an empty response. Try again, or pick a model that supports tool calling.')
        return 'done'
      }

      for (const c of calls) {
        if (ctx.abort.signal.aborted) return 'cancelled'
        const sig = `${c.name}:${JSON.stringify(c.args)}`
        lastCalls.push(sig)
        if (lastCalls.length >= 3 && lastCalls.slice(-3).every((x) => x === sig)) {
          this.saveToolResult(ctx, c.id, c.name, 'Stopped: the same tool call was repeated 3 times in a row. Try a different approach.', { ok: false })
          throw new Error('Loop detected: the model repeated the same tool call 3 times. Stopped.')
        }
        const t0 = Date.now()
        let result: { content: string; ok: boolean; denied?: boolean; changeIds?: string[]; stop?: 'awaiting_plan' }
        if (c.parseError) result = { ok: false, content: `Your tool arguments were not valid JSON (${c.parseError}). Re-issue the call with valid JSON.` }
        else if (c.name.startsWith('mcp__')) {
          const t = mcpTools.find((x) => x.publicName === c.name)
          if (!t) result = { ok: false, content: `MCP tool "${c.name}" is not available (server disconnected, or not allowed in ${ctx.mode} mode).` }
          else {
            try { result = await this.executeMcp(ctx, t, c.args) }
            catch (e) {
              if (ctx.abort.signal.aborted) return 'cancelled'
              result = { ok: false, content: `MCP error (${t.serverName} · ${t.tool.name}): ${(e as Error).message}` }
            }
          }
        }
        else {
          const parsed = parseToolCall(c.name, c.args, allowed)
          if (!parsed.ok) result = { ok: false, content: parsed.error }
          else {
            try { result = await this.execute(ctx, c.id, parsed.name, parsed.args) }
            catch (e) {
              if (ctx.abort.signal.aborted) return 'cancelled'
              result = { ok: false, content: e instanceof PathError ? `Permission error: ${e.message}` : `Error: ${(e as Error).message}` }
            }
          }
        }
        const content = truncateMiddle(redact(result.content), TOOL_OUTPUT_LIMIT)
        this.saveToolResult(ctx, c.id, c.name, content, { ok: result.ok, denied: result.denied, durationMs: Date.now() - t0, changeIds: result.changeIds })
        if (result.stop === 'awaiting_plan') return 'awaiting_plan'
      }
    }
    this.deps.emit({ type: 'status', runId: ctx.runId, convId: ctx.conv.id, text: `Stopped after reaching the maximum of ${s.maxIterations} steps. Send "continue" to keep going.` })
    return 'limit'
  }

  private async *withIdleTimeout(gen: AsyncGenerator<StreamChunk>, infer: AbortController): AsyncGenerator<StreamChunk> {
    // Generous: a local model can take minutes to load into memory before the first token.
    const ms = this.deps.inferenceIdleTimeoutMs ?? 300_000
    const it = gen[Symbol.asyncIterator]()
    for (;;) {
      let timer: NodeJS.Timeout | undefined
      const timeout = new Promise<never>((_, rej) => { timer = setTimeout(() => rej(new ProviderError(`The model did not respond for ${Math.round(ms / 1000)} s (timeout).`, 'timeout')), ms) })
      try {
        const r = await Promise.race([it.next(), timeout])
        if (r.done) return
        yield r.value
      } catch (e) {
        if (e instanceof ProviderError && e.code === 'timeout') { infer.abort(); it.return?.(undefined).catch(() => {}) }
        throw e
      } finally { clearTimeout(timer) }
    }
  }

  private saveAssistant(ctx: RunCtx, model: string, text: string, reasoning: string, toolCalls: ToolCall[], usage?: ChatMessage['usage']) {
    const m: ChatMessage = { id: randomUUID(), convId: ctx.conv.id, role: 'assistant', content: text, reasoning: reasoning || undefined, toolCalls: toolCalls.length ? toolCalls : undefined, createdAt: Date.now(), model, usage, runId: ctx.runId }
    this.deps.db.addMessage(m)
    this.deps.emit({ type: 'message', runId: ctx.runId, convId: ctx.conv.id, message: m })
  }

  private saveToolResult(ctx: RunCtx, callId: string, name: string, content: string, meta: ChatMessage['toolMeta']) {
    const m: ChatMessage = { id: randomUUID(), convId: ctx.conv.id, role: 'tool', content, toolCallId: callId, toolName: name, toolMeta: meta, createdAt: Date.now(), runId: ctx.runId }
    this.deps.db.addMessage(m)
    this.deps.emit({ type: 'message', runId: ctx.runId, convId: ctx.conv.id, message: m })
  }

  // ---------- context ----------
  buildMessages(ctx: RunCtx, conv: Conversation, useTools: boolean, s: Settings): ProviderMessage[] {
    const history = this.deps.db.listMessages(conv.id).filter((m) => !m.error)
    const out: ProviderMessage[] = []
    for (const m of history) {
      if (m.role === 'user') out.push({ role: 'user', content: this.expandAttachments(ctx, m) })
      else if (m.role === 'assistant') out.push({ role: 'assistant', content: m.content, toolCalls: useTools ? m.toolCalls?.map((t) => ({ id: t.id, name: t.name, args: t.args })) : undefined })
      else if (m.role === 'tool' && useTools) out.push({ role: 'tool', content: m.content, toolCallId: m.toolCallId!, toolName: m.toolName! })
    }
    const { messages, summary } = fitToBudget(out, s.contextBudgetTokens)
    const system = buildSystemPrompt({ ws: ctx.ws, mode: ctx.mode, useTools, plan: conv.plan, earlierSummary: summary, remote: ctx.isRemote, mcpServers: [...new Set((this.deps.mcp?.tools() ?? []).map((t) => t.serverName))] })
    return [{ role: 'system', content: system }, ...messages]
  }

  private expandAttachments(ctx: RunCtx, m: ChatMessage): string {
    if (!m.attachments?.length || !ctx.ws) return m.content
    const parts = [m.content]
    for (const a of m.attachments) {
      try {
        const abs = ctx.ws.resolveInside(a)
        if (fs.statSync(abs).isDirectory()) parts.push(`\n<attached_folder path="${a}">\n${ctx.ws.list(a).map((e) => (e.isDir ? e.path + '/' : e.path)).join('\n')}\n</attached_folder>`)
        else {
          const r = ctx.ws.readText(a)
          parts.push(r.binary ? `\n<attached_file path="${a}">[binary file]</attached_file>` : `\n<attached_file path="${a}">\n${truncateMiddle(redact(r.content), 20000)}\n</attached_file>`)
        }
      } catch (e) { parts.push(`\n[attachment ${a} unavailable: ${(e as Error).message}]`) }
    }
    return parts.join('\n')
  }

  // ---------- tool execution ----------
  private async execute(ctx: RunCtx, callId: string, name: ToolName, args: Record<string, unknown>): Promise<{ content: string; ok: boolean; denied?: boolean; changeIds?: string[]; stop?: 'awaiting_plan' }> {
    const ws = ctx.ws
    if (!ws) return { ok: false, content: 'No project folder is open, so file and command tools are unavailable.' }
    const a = args as Record<string, never>
    switch (name) {
      case 'list_directory': {
        const entries = ws.list((a.path as string) || '.')
        return { ok: true, content: entries.length ? entries.map((e) => (e.isDir ? `${e.path}/` : `${e.path} (${e.size ?? 0} B)`)).join('\n') : '(empty directory)' }
      }
      case 'read_file': {
        const r = ws.readText(a.path)
        if (r.binary) return { ok: true, content: `${a.path} is a binary file (${r.size} bytes); not shown.` }
        ws.readHashes.set(ws.rel(ws.resolveInside(a.path)), ws.hash(ws.readFull(a.path) ?? ''))
        const lines = r.content.split(/\r?\n/)
        const start = (a.start_line as number | undefined) ?? 1
        const end = Math.min((a.end_line as number | undefined) ?? lines.length, lines.length)
        const body = lines.slice(start - 1, end).map((l, i) => `${String(start + i).padStart(5)}  ${l}`).join('\n')
        return { ok: true, content: `${a.path} (lines ${start}-${end} of ${lines.length}${r.truncated ? ', file truncated at 512 KB' : ''})\n${body}` }
      }
      case 'search_files': {
        const res = ws.searchFiles(a.pattern)
        return { ok: true, content: res.length ? res.join('\n') : 'No matching files.' }
      }
      case 'search_content': {
        const res = ws.searchContent(a.query, { regex: a.regex as boolean | undefined, glob: a.glob as string | undefined })
        return { ok: true, content: res.length ? res.join('\n') : 'No matches.' }
      }
      case 'create_directory': {
        fs.mkdirSync(ws.resolveInside(a.path), { recursive: true })
        return { ok: true, content: `Created directory ${a.path}` }
      }
      case 'create_file': {
        if (fs.existsSync(ws.resolveInside(a.path))) return { ok: false, content: `${a.path} already exists. Use write_file or apply_patch to modify it.` }
        return this.proposeEdit(ctx, a.path, a.content)
      }
      case 'write_file':
        return this.proposeEdit(ctx, a.path, a.content)
      case 'apply_patch': {
        const cur = ws.readFull(a.path)
        if (cur === null) return { ok: false, content: `${a.path} does not exist.` }
        let next = cur.replace(/\r\n/g, '\n')
        for (const [i, e] of (a.edits as { old_text: string; new_text: string }[]).entries()) {
          const old = e.old_text.replace(/\r\n/g, '\n')
          const count = next.split(old).length - 1
          if (count === 0) return { ok: false, content: `Edit ${i + 1}: old_text was not found in ${a.path}. Read the file again and use the exact current text.` }
          if (count > 1) return { ok: false, content: `Edit ${i + 1}: old_text matches ${count} places in ${a.path}. Include more surrounding lines so it is unique.` }
          next = next.replace(old, () => e.new_text.replace(/\r\n/g, '\n'))
        }
        return this.proposeEdit(ctx, a.path, next)
      }
      case 'delete_file': {
        const abs = ws.resolveInside(a.path)
        if (!fs.existsSync(abs)) return { ok: false, content: `${a.path} does not exist.` }
        if (fs.statSync(abs).isDirectory()) return { ok: false, content: 'delete_file only deletes files, not directories.' }
        const before = fs.readFileSync(abs, 'utf8')
        // Deleting is treated as dangerous: it asks in Auto and Approval, and only runs freely in All.
        if (this.perm() !== 'all') {
          const d = await this.requestApproval(ctx, { kind: 'delete', title: `Delete ${a.path}`, path: a.path, before, after: null, danger: 'The file will be removed. You can restore it from the change review.' })
          if (d === 'deny') return { ok: false, denied: true, content: 'The user denied deleting this file.' }
        }
        ws.remove(a.path)
        const ch = this.recordChange(ctx, ws.rel(abs), before, null)
        return { ok: true, content: `Deleted ${a.path}`, changeIds: [ch.id] }
      }
      case 'move_file': {
        const from = ws.resolveInside(a.from), to = ws.resolveInside(a.to)
        if (!fs.existsSync(from)) return { ok: false, content: `${a.from} does not exist.` }
        if (fs.existsSync(to)) return { ok: false, content: `${a.to} already exists.` }
        if (this.perm() === 'approval') {
          const d = await this.requestApproval(ctx, { kind: 'move', title: `Move ${a.from} → ${a.to}`, path: a.from })
          if (d === 'deny') return { ok: false, denied: true, content: 'The user denied this move.' }
        }
        const content = fs.statSync(from).isFile() ? fs.readFileSync(from, 'utf8') : null
        fs.mkdirSync(path.dirname(to), { recursive: true })
        fs.renameSync(from, to)
        const ids = content !== null ? [this.recordChange(ctx, ws.rel(from), content, null).id, this.recordChange(ctx, ws.rel(to), null, content).id] : []
        return { ok: true, content: `Moved ${a.from} to ${a.to}`, changeIds: ids }
      }
      case 'run_command': {
        const cwd = ws.resolveInside((a.cwd as string) || '.')
        const cls = classifyCommand(a.command)
        const s = this.deps.settings()
        const perm = this.perm()
        // All: run everything. Auto: run unless flagged dangerous. Approval: ask unless the user allow-listed it.
        const autoRun = perm === 'all' || (perm === 'auto' && !cls.dangerous) || isAllowlisted(a.command, this.deps.getAllowlist(ctx.conv.projectId!))
        if (!autoRun) {
          const d = await this.requestApproval(ctx, {
            kind: 'command', title: cls.dangerous ? 'Potentially destructive command' : 'Run command', command: a.command, cwd: ws.rel(cwd),
            danger: cls.reason, allowKey: cls.dangerous ? undefined : cls.allowKey || undefined
          })
          if (d === 'deny') return { ok: false, denied: true, content: 'The user denied running this command.' }
          if (d === 'always' && cls.allowKey && !cls.dangerous) this.deps.addToAllowlist(ctx.conv.projectId!, cls.allowKey)
        }
        const timeoutMs = ((a.timeout_sec as number | undefined) ?? s.commandTimeoutSec) * 1000
        const r = await runCommand(a.command, cwd, {
          timeoutMs, signal: ctx.abort.signal,
          onData: (chunk) => this.deps.emit({ type: 'tool_output', runId: ctx.runId, convId: ctx.conv.id, callId, chunk: redact(chunk) })
        })
        if (r.cancelled) throw new Error('cancelled')
        const head = r.timedOut ? `Command timed out after ${timeoutMs / 1000}s and was stopped.` : `Exit code: ${r.exitCode}`
        return { ok: !r.timedOut && r.exitCode === 0, content: `${head}\n${stripAnsi(r.output).trim() || '(no output)'}` }
      }
      case 'submit_plan': {
        const plan: PlanState = { summary: a.summary, steps: (a.steps as { title: string; detail?: string }[]).map((st) => ({ ...st, status: 'pending' })), approved: false }
        const conv = this.deps.db.getConversation(ctx.conv.id)!
        this.deps.db.saveConversation({ ...conv, plan })
        this.deps.emit({ type: 'plan', runId: ctx.runId, convId: ctx.conv.id, plan })
        return { ok: true, content: 'Plan submitted. Waiting for the user to approve it.', stop: 'awaiting_plan' }
      }
      case 'update_plan_step': {
        const conv = this.deps.db.getConversation(ctx.conv.id)!
        if (!conv.plan || !conv.plan.steps[a.index]) return { ok: false, content: 'No such plan step.' }
        const plan = { ...conv.plan, steps: conv.plan.steps.map((st, i) => (i === a.index ? { ...st, status: a.status } : st)) }
        this.deps.db.saveConversation({ ...conv, plan })
        this.deps.emit({ type: 'plan', runId: ctx.runId, convId: ctx.conv.id, plan })
        return { ok: true, content: `Step ${a.index} marked ${a.status}.` }
      }
    }
  }

  /** Runs an MCP tool after the same permission rules as built-in tools. */
  private async executeMcp(ctx: RunCtx, t: McpTool, args: Record<string, unknown>) {
    const perm = this.perm()
    const scope = ctx.conv.projectId ?? '__global__'
    const allowKey = `mcp:${t.serverId}:${t.tool.name}`
    const risky = t.tool.destructive && !t.tool.readOnly
    const allowlisted = this.deps.getAllowlist(scope).includes(allowKey)
    // All: never ask (unless the server is set to always ask). Auto: ask for destructive tools. Approval: ask for anything not read-only.
    const ask = this.deps.mcp!.alwaysAsk(t.serverId)
      || (!allowlisted && ((perm === 'auto' && risky) || (perm === 'approval' && !t.tool.readOnly)))
    if (ask) {
      const d = await this.requestApproval(ctx, {
        kind: 'mcp', title: `${t.serverName} · ${t.tool.name}`, command: JSON.stringify(args, null, 2).slice(0, 4000),
        danger: risky ? 'This tool can modify or delete data in the connected application.' : undefined,
        allowKey
      })
      if (d === 'deny') return { ok: false, denied: true, content: 'The user denied this MCP tool call.' }
      if (d === 'always') this.deps.addToAllowlist(scope, allowKey)
    }
    const r = await this.deps.mcp!.call(t.serverId, t.tool.name, args, ctx.abort.signal)
    return { ok: r.ok, content: r.text }
  }

  private async proposeEdit(ctx: RunCtx, relPath: string, content: string) {
    const ws = ctx.ws!
    const abs = ws.resolveInside(relPath)
    const key = ws.rel(abs)
    const before = ws.readFull(relPath)
    if (before !== null) {
      const seen = ws.readHashes.get(key)
      if (seen && seen !== ws.hash(before)) {
        ws.readHashes.delete(key)
        return { ok: false, content: `${relPath} was modified outside the agent since you read it. Read it again before editing.` }
      }
    }
    if ((before ?? '').replace(/\r\n/g, '\n') === content.replace(/\r\n/g, '\n')) return { ok: true, content: `No changes: ${relPath} already has this content.` }
    if (this.perm() === 'approval') {
      const d = await this.requestApproval(ctx, { kind: 'edit', title: before === null ? `Create ${key}` : `Edit ${key}`, path: key, before, after: content })
      if (d === 'deny') return { ok: false, denied: true, content: `The user rejected the change to ${relPath}.` }
    }
    ws.writeText(relPath, content)
    ws.readHashes.set(key, ws.hash(ws.readFull(relPath) ?? ''))
    const ch = this.recordChange(ctx, key, before, content)
    const { added, removed } = lineStats(before ?? '', content)
    return { ok: true, content: `${before === null ? 'Created' : 'Updated'} ${key} (+${added} −${removed} lines).`, changeIds: [ch.id] }
  }

  private recordChange(ctx: RunCtx, relPath: string, before: string | null, after: string | null): FileChange {
    const ch: FileChange = { id: randomUUID(), runId: ctx.runId, convId: ctx.conv.id, projectId: ctx.conv.projectId!, path: relPath, before, after, status: 'applied', createdAt: Date.now() }
    this.deps.db.addChange(ch)
    return ch
  }
}

export function stripAnsi(s: string) { return s.replace(/\x1b\[[0-9;?]*[ -/]*[@-~]/g, '').replace(/\x1b\][^\x07]*\x07/g, '') }

export function lineStats(a: string, b: string) {
  const A = a ? a.replace(/\r\n/g, '\n').split('\n') : []
  const B = b ? b.replace(/\r\n/g, '\n').split('\n') : []
  const count = new Map<string, number>()
  for (const l of A) count.set(l, (count.get(l) ?? 0) + 1)
  let common = 0
  for (const l of B) { const c = count.get(l) ?? 0; if (c > 0) { common++; count.set(l, c - 1) } }
  return { added: B.length - common, removed: A.length - common }
}

/** Keep the conversation within a token budget (≈ chars/4). Old tool outputs shrink first, then old turns drop. */
export function fitToBudget(msgs: ProviderMessage[], budgetTokens: number): { messages: ProviderMessage[]; summary?: string } {
  const est = (m: ProviderMessage[]) => m.reduce((n, x) => n + x.content.length + ('toolCalls' in x && x.toolCalls ? JSON.stringify(x.toolCalls).length : 0), 0) / 4
  let out = msgs.slice()
  if (est(out) <= budgetTokens) return { messages: out }
  const keepTail = 8
  out = out.map((m, i) => (i < out.length - keepTail && m.role === 'tool' && m.content.length > 400 ? { ...m, content: m.content.slice(0, 400) + '\n…[older output trimmed]' } : m))
  const dropped: ProviderMessage[] = []
  while (est(out) > budgetTokens && out.length > 2) {
    dropped.push(out.shift()!)
    while (out.length > 1 && out[0].role !== 'user') dropped.push(out.shift()!)
  }
  if (!dropped.length) return { messages: out }
  const asks = dropped.filter((m) => m.role === 'user').map((m) => `- ${m.content.replace(/\s+/g, ' ').slice(0, 160)}`)
  const touched = new Set<string>()
  for (const m of dropped) if (m.role === 'assistant') for (const t of m.toolCalls ?? []) if (typeof t.args.path === 'string' && /write|patch|create|delete/.test(t.name)) touched.add(t.args.path)
  const summary = `Earlier parts of this conversation were removed to fit the context window.\nEarlier user requests:\n${asks.join('\n') || '- (none)'}${touched.size ? `\nFiles changed earlier: ${[...touched].join(', ')}` : ''}`
  return { messages: out, summary }
}

/** MCP tool → provider tool spec (JSON schema must be an object schema). */
function mcpSpec(t: McpTool) {
  const schema = { ...(t.tool.inputSchema ?? {}) } as Record<string, unknown>
  if (schema.type !== 'object') schema.type = 'object'
  if (!schema.properties) schema.properties = {}
  delete schema.$schema
  return { name: t.publicName, description: `[${t.serverName}] ${t.tool.description}`.slice(0, 1024), parameters: schema }
}
