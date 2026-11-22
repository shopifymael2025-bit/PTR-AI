import type { InvokeChannel, EventChannel } from '@shared/ipc'

interface Bridge {
  invoke(channel: string, payload?: unknown): Promise<unknown>
  on(channel: string, cb: (payload: unknown) => void): () => void
}
declare global { interface Window { ptrai: Bridge } }

export async function invoke<T = unknown>(channel: InvokeChannel, payload?: unknown): Promise<T> {
  try {
    return (await window.ptrai.invoke(channel, payload)) as T
  } catch (e) {
    // Strip Electron's "Error invoking remote method 'x': Error: " prefix.
    const msg = String((e as Error).message ?? e).replace(/^Error invoking remote method '[^']+': (Error: )?/, '')
    throw new Error(msg)
  }
}

export function on<T = unknown>(channel: EventChannel, cb: (payload: T) => void): () => void {
  return window.ptrai.on(channel, cb as (p: unknown) => void)
}
