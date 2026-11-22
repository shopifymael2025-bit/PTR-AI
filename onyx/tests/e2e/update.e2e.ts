// Auto-update test against the PACKAGED app. Requires:
//   PTRAI_EXE          path to release/win-unpacked/PTR AI.exe
//   PTRAI_RELEASE_DIR  folder with latest.yml + PTR AI-Setup-x.y.z.exe from `npm run dist`
// Serves a feed that advertises version 9.9.9 (pointing at the real installer) and checks that
// PTR AI detects it, downloads it and verifies its SHA-512 (state "ready"). It does NOT install.
import { TOS_VERSION } from '../../src/shared/app'
import { describe, it, expect } from 'vitest'
import { _electron as electron } from 'playwright-core'
import http from 'node:http'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import type { AddressInfo } from 'node:net'

const exe = process.env.PTRAI_EXE, rel = process.env.PTRAI_RELEASE_DIR

describe.skipIf(!exe || !rel)('Auto-update (packaged app)', () => {
  it('detects, downloads and verifies a newer version', async () => {
    const yml = fs.readFileSync(path.join(rel!, 'latest.yml'), 'utf8').replace(/^version: .*$/m, 'version: 9.9.9')
    const served: string[] = []
    const server = http.createServer((req, res) => {
      const name = decodeURIComponent((req.url ?? '/').split('?')[0].slice(1))
      served.push(name)
      if (name === 'latest.yml') { res.setHeader('Content-Type', 'text/yaml'); return res.end(yml) }
      const f = path.join(rel!, path.basename(name))
      if (!fs.existsSync(f)) { res.statusCode = 404; return res.end() }
      res.setHeader('Content-Length', fs.statSync(f).size)
      fs.createReadStream(f).pipe(res)
    })
    await new Promise<void>((r) => server.listen(0, '127.0.0.1', r))
    const url = `http://127.0.0.1:${(server.address() as AddressInfo).port}`
    const ud = fs.mkdtempSync(path.join(os.tmpdir(), 'ptrai-upd-'))
    fs.writeFileSync(path.join(ud, 'config.json'), JSON.stringify({ settings: { onboarded: true, tosAcceptedVersion: TOS_VERSION } }))
    const app = await electron.launch({ executablePath: exe!, env: { ...process.env, PTRAI_USER_DATA: ud, PTRAI_TEST_UPDATE_URL: url } })
    try {
      const page = await app.firstWindow()
      await page.waitForFunction(() => !!(window as unknown as { ptrai: unknown }).ptrai)
      await page.evaluate(() => (window as unknown as { ptrai: { invoke: (c: string) => Promise<unknown> } }).ptrai.invoke('update:check'))
      let status: { state: string; version?: string; error?: string } = { state: 'idle' }
      for (let i = 0; i < 180 && !['ready', 'error'].includes(status.state); i++) {
        await new Promise((r) => setTimeout(r, 1000))
        status = await page.evaluate(() => (window as unknown as { ptrai: { invoke: (c: string) => Promise<never> } }).ptrai.invoke('update:status'))
      }
      expect(status, JSON.stringify(status)).toMatchObject({ state: 'ready', version: '9.9.9' })
      expect(served).toContain('latest.yml')
      // The banner appears in the UI.
      await page.getByText('Update required').waitFor({ timeout: 10000 })
      await page.getByText('PTR AI 9.9.9').waitFor()
      await page.screenshot({ path: path.join(__dirname, 'shots', '20-update-ready.png') })
    } finally {
      await app.close()
      server.close()
    }
  }, 240000)

  it.skipIf(!process.env.PTRAI_REAL_FEED)('reads the real official feed on GitHub (no override)', async () => {
    const ud = fs.mkdtempSync(path.join(os.tmpdir(), 'ptrai-upd-real-'))
    fs.writeFileSync(path.join(ud, 'config.json'), JSON.stringify({ settings: { onboarded: true, tosAcceptedVersion: TOS_VERSION } }))
    const env: Record<string, string> = { ...(process.env as Record<string, string>), PTRAI_USER_DATA: ud }
    delete env.PTRAI_TEST_UPDATE_URL
    const app = await electron.launch({ executablePath: exe!, env })
    try {
      const page = await app.firstWindow()
      await page.waitForFunction(() => !!(window as unknown as { ptrai: unknown }).ptrai)
      await page.evaluate(() => (window as unknown as { ptrai: { invoke: (c: string) => Promise<unknown> } }).ptrai.invoke('update:check'))
      let status: { state: string; version?: string; error?: string } = { state: 'idle' }
      for (let i = 0; i < 60 && !['up-to-date', 'ready', 'downloading', 'error'].includes(status.state); i++) {
        await new Promise((r) => setTimeout(r, 1000))
        status = await page.evaluate(() => (window as unknown as { ptrai: { invoke: (c: string) => Promise<never> } }).ptrai.invoke('update:status'))
      }
      expect(status.state, JSON.stringify(status)).not.toBe('error')
      expect(['up-to-date', 'downloading', 'ready']).toContain(status.state)
    } finally { await app.close() }
  }, 120000)
})
