// Optional live test against a real local Ollama. Skips automatically when Ollama is not running.
// Run: npm test  (with Ollama started and at least one model installed; set OLLAMA_MODEL to choose one)
import { describe, it, expect } from 'vitest'
import { OllamaProvider } from '../src/main/providers/ollama'

const p = new OllamaProvider({ id: 'ollama', kind: 'ollama', name: 'Ollama', baseUrl: process.env.OLLAMA_URL ?? 'http://localhost:11434', enabled: true })
const status = await p.status()

describe.skipIf(!status.running)('Live Ollama (optional)', () => {
  it('lists installed models and streams a real completion', async () => {
    const models = await p.listModels()
    expect(models.length, 'Install a model first, e.g. `ollama pull qwen2.5-coder:1.5b`').toBeGreaterThan(0)
    const model = process.env.OLLAMA_MODEL ?? models[0].id
    let text = ''
    for await (const c of p.chat({ model, messages: [{ role: 'user', content: 'Reply with the single word: pong' }], signal: AbortSignal.timeout(120000) })) if (c.type === 'text') text += c.text
    expect(text.toLowerCase()).toContain('pong')
  }, 180000)
})
