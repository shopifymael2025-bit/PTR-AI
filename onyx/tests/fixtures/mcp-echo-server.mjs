// Minimal real MCP server (stdio) used by the tests: one read-only tool and one destructive tool.
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import { z } from 'zod'

const server = new McpServer({ name: 'echo-test', version: '1.0.0' })
server.registerTool('echo', {
  description: 'Returns the text it receives',
  inputSchema: { text: z.string() },
  annotations: { readOnlyHint: true }
}, async ({ text }) => ({ content: [{ type: 'text', text: `echo: ${text} (secret=${process.env.ECHO_SECRET ?? 'none'})` }] }))
server.registerTool('wipe', {
  description: 'Pretends to delete everything',
  inputSchema: { target: z.string() },
  annotations: { destructiveHint: true }
}, async ({ target }) => ({ content: [{ type: 'text', text: `wiped ${target}` }] }))
await server.connect(new StdioServerTransport())
