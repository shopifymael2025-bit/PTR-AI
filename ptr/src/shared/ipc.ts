// The complete allowlist of IPC channels. Preload refuses anything not listed here,
// and the main process validates every payload with zod before acting.
export const INVOKE_CHANNELS = [
  'window:minimize', 'window:maximize', 'window:close', 'window:isMaximized',
  'app:info', 'app:openExternal', 'app:dataDir', 'app:exportConversations', 'app:clearHistory', 'app:diagnostics',
  'settings:get', 'settings:set',
  'providers:list', 'providers:save', 'providers:remove', 'providers:setKey', 'providers:test',
  'models:list',
  'ollama:status', 'ollama:pull', 'ollama:cancelPull', 'ollama:delete',
  'projects:list', 'projects:openDialog', 'projects:open', 'projects:remove', 'projects:update', 'projects:createDialog',
  'conv:list', 'conv:create', 'conv:rename', 'conv:delete', 'conv:messages', 'conv:update', 'conv:truncateFrom',
  'agent:send', 'agent:cancel', 'agent:approve', 'agent:approvePlan',
  'changes:list', 'changes:revert', 'changes:reapply',
  'fs:list', 'fs:read', 'fs:write', 'fs:searchFiles', 'fs:searchContent', 'fs:pickAttachment',
  'term:create', 'term:write', 'term:resize', 'term:kill',
  'git:status', 'git:diff', 'git:stage', 'git:unstage', 'git:commit', 'git:log',
  'update:status', 'update:check', 'update:install', 'tos:accept',
  'conv:moveToProject', 'run:preview', 'run:writeTemp',
  'mcp:list', 'mcp:save', 'mcp:remove', 'mcp:restart', 'mcp:detect', 'mcp:importClaude',
  'auth:status', 'auth:register', 'auth:login', 'auth:logout'
] as const

export const EVENT_CHANNELS = ['agent:event', 'term:data', 'term:exit', 'ollama:pullProgress', 'window:maximized', 'fs:changed', 'update:status', 'mcp:status'] as const

export type InvokeChannel = (typeof INVOKE_CHANNELS)[number]
export type EventChannel = (typeof EVENT_CHANNELS)[number]
