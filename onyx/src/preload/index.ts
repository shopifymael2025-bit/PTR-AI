import { contextBridge, ipcRenderer, type IpcRendererEvent } from 'electron'
import { INVOKE_CHANNELS, EVENT_CHANNELS } from '../shared/ipc'

const invokeSet = new Set<string>(INVOKE_CHANNELS)
const eventSet = new Set<string>(EVENT_CHANNELS)

// Narrow, allowlisted bridge. No Node APIs are exposed to the renderer.
const api = {
  invoke(channel: string, payload?: unknown): Promise<unknown> {
    if (!invokeSet.has(channel)) return Promise.reject(new Error(`Blocked IPC channel: ${channel}`))
    return ipcRenderer.invoke(channel, payload)
  },
  on(channel: string, cb: (payload: unknown) => void): () => void {
    if (!eventSet.has(channel)) throw new Error(`Blocked IPC event: ${channel}`)
    const listener = (_e: IpcRendererEvent, payload: unknown) => cb(payload)
    ipcRenderer.on(channel, listener)
    return () => ipcRenderer.removeListener(channel, listener)
  }
}

contextBridge.exposeInMainWorld('ptrai', api)
export type PtrAiBridge = typeof api
