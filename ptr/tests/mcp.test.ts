import { describe, it, expect, afterEach } from 'vitest'
import path from 'node:path'
import { McpManager, mcpToolName, resolveCommand } from '../src/main/services/mcp'
import type { McpServerConfig } from '../src/shared/types'

const fixture = path.join(__dirname, 'fixtures', 'mcp-echo-server.mjs')
let mgr: McpManager | null = null
afterEach(async () => { await mgr?.closeAll(); mgr = null })

describe('MCP manager (real stdio server)', () => {
  it('connects, lists tools with annotations and calls them, passing secret env vars', async () => {
    const servers: McpServerConfig[] = [{ id: 'echo', name: 'Echo', enabled: true, transport: 'stdio', command: process.execPath, args: [fixture] }]
    mgr = new McpManager(() => servers, () => ({ ECHO_SECRET: 's3cr3t' }), '1.0.0')
    await mgr.syncAll()
    const st = mgr.list()[0]
    expect(st.status, st.error).toBe('connected')
    expect(st.tools.map((t) => t.name).sort()).toEqual(['echo', 'wipe'])
    expect(st.tools.find((t) => t.name === 'echo')!.readOnly).toBe(true)
    expect(st.tools.find((t) => t.name === 'wipe')!.destructive).toBe(true)
    expect(mgr.allTools().map((t) => t.publicName)).toContain('mcp__echo__echo')
    const r = await mgr.call('echo', 'echo', { text: 'hello' })
    expect(r).toEqual({ ok: true, text: 'echo: hello (secret=s3cr3t)' })
  })

  it('reports a clear error when the program does not exist', async () => {
    const servers: McpServerConfig[] = [{ id: 'bad', name: 'Bad', enabled: true, transport: 'stdio', command: 'definitely-not-a-real-mcp-server-xyz' }]
    mgr = new McpManager(() => servers, () => ({}), '1.0.0')
    await mgr.syncAll()
    expect(mgr.list()[0].status).toBe('error')
  })

  it('names tools safely and expands environment variables in commands', () => {
    expect(mcpToolName('roblox-studio', 'execute_luau')).toBe('mcp__roblox-studio__execute_luau')
    expect(mcpToolName('a b', 'x.y')).toBe('mcp__a_b__x_y')
    process.env.PTRAI_TEST_DIR = 'C:\\Tools'
    expect(resolveCommand('%PTRAI_TEST_DIR%\\srv.bat', ['${PTRAI_TEST_DIR}'])).toEqual({ command: 'C:\\Tools\\srv.bat', args: ['C:\\Tools'] })
  })
})
