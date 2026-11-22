// Typed tool definitions. Arguments are validated with zod before any execution.
import { z } from 'zod'
import type { AgentMode } from '../../shared/types'
import type { ToolSpec } from '../providers/types'

const rel = z.string().min(1).max(1000)

export const TOOL_SCHEMAS = {
  list_directory: z.object({ path: z.string().max(1000).optional().describe('Directory relative to the project root. Defaults to the root.') }),
  read_file: z.object({
    path: rel.describe('File path relative to the project root'),
    start_line: z.number().int().min(1).optional(),
    end_line: z.number().int().min(1).optional()
  }),
  search_files: z.object({ pattern: z.string().min(1).max(300).describe('Substring or glob (e.g. "**/*.tsx") matched against file paths') }),
  search_content: z.object({
    query: z.string().min(1).max(500),
    regex: z.boolean().optional(),
    glob: z.string().max(300).optional().describe('Optional glob to restrict files, e.g. "src/**/*.ts"')
  }),
  create_file: z.object({ path: rel, content: z.string().max(2_000_000) }),
  write_file: z.object({ path: rel, content: z.string().max(2_000_000).describe('The complete new file content') }),
  apply_patch: z.object({
    path: rel,
    edits: z.array(z.object({
      old_text: z.string().min(1).describe('Exact existing text to replace (must match exactly once)'),
      new_text: z.string()
    })).min(1).max(50)
  }),
  delete_file: z.object({ path: rel }),
  move_file: z.object({ from: rel, to: rel }),
  create_directory: z.object({ path: rel }),
  run_command: z.object({
    command: z.string().min(1).max(4000).describe('A shell command (PowerShell on Windows, zsh/bash on macOS)'),
    cwd: z.string().max(1000).optional().describe('Working directory relative to the project root'),
    timeout_sec: z.number().int().min(1).max(1800).optional()
  }),
  submit_plan: z.object({
    summary: z.string().min(1).max(4000),
    steps: z.array(z.object({ title: z.string().min(1).max(300), detail: z.string().max(2000).optional() })).min(1).max(30)
  }),
  update_plan_step: z.object({ index: z.number().int().min(0), status: z.enum(['in_progress', 'done', 'skipped']) })
} as const

export type ToolName = keyof typeof TOOL_SCHEMAS

const DESCRIPTIONS: Record<ToolName, string> = {
  list_directory: 'List files and folders in a project directory (ignored folders like node_modules are hidden).',
  read_file: 'Read a UTF-8 text file from the project. Optionally a line range. Always read a file before editing it.',
  search_files: 'Find files by path substring or glob.',
  search_content: 'Search file contents (case-insensitive). Returns path:line: text matches.',
  create_file: 'Create a new file. Fails if it already exists. The user reviews the change.',
  write_file: 'Replace the entire content of a file (or create it). The user reviews the diff.',
  apply_patch: 'Edit an existing file by replacing exact text snippets. Prefer this for small changes to large files.',
  delete_file: 'Delete a file. Always requires user approval.',
  move_file: 'Move or rename a file inside the project. Requires approval.',
  create_directory: 'Create a directory (and parents).',
  run_command: 'Run a shell command in the project (build, test, run scripts). The user must approve. Returns exit code and output.',
  submit_plan: 'Submit an implementation plan for the user to review. Use only in PLAN mode, after inspecting the project.',
  update_plan_step: 'Mark a step of the approved plan as in_progress, done or skipped.'
}

const READ_ONLY: ToolName[] = ['list_directory', 'read_file', 'search_files', 'search_content']
const WRITE: ToolName[] = ['create_file', 'write_file', 'apply_patch', 'delete_file', 'move_file', 'create_directory', 'run_command']

export function toolsForMode(mode: AgentMode, hasApprovedPlan: boolean): ToolName[] {
  if (mode === 'ask') return READ_ONLY
  if (mode === 'plan') return [...READ_ONLY, 'submit_plan']
  return [...READ_ONLY, ...WRITE, ...(hasApprovedPlan ? (['update_plan_step'] as ToolName[]) : [])]
}

export function toolSpecs(names: ToolName[]): ToolSpec[] {
  return names.map((n) => {
    const schema = z.toJSONSchema(TOOL_SCHEMAS[n]) as Record<string, unknown>
    delete schema.$schema
    return { name: n, description: DESCRIPTIONS[n], parameters: schema }
  })
}

export type ParsedCall = { ok: true; name: ToolName; args: Record<string, unknown> } | { ok: false; error: string }

/** Validate a model-produced tool call. Unknown or out-of-mode tools are rejected, never executed. */
export function parseToolCall(name: string, args: unknown, allowed: ToolName[]): ParsedCall {
  if (!(name in TOOL_SCHEMAS)) return { ok: false, error: `Unknown tool "${name}". Available: ${allowed.join(', ')}` }
  if (!allowed.includes(name as ToolName)) return { ok: false, error: `Tool "${name}" is not permitted in the current mode.` }
  const r = TOOL_SCHEMAS[name as ToolName].safeParse(args ?? {})
  if (!r.success) return { ok: false, error: `Invalid arguments for ${name}: ${r.error.issues.map((i) => `${i.path.join('.') || '(root)'}: ${i.message}`).join('; ')}` }
  return { ok: true, name: name as ToolName, args: r.data as Record<string, unknown> }
}
