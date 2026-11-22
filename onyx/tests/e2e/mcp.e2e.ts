// E2E: Settings → MCP → add the detected Roblox Studio server → it connects and lists its tools.
// Skipped when Roblox Studio's MCP launcher is not installed on this computer.
import { TOS_VERSION } from '../../src/shared/app'
import { describe, it, expect } from 'vitest'
import { _electron as electron } from 'playwright-core'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

const bat = path.join(process.env.LOCALAPPDATA ?? '', 'Roblox', 'mcp.bat')

describe.skipIf(process.platform !== 'win32' || !fs.existsSync(bat))('MCP: Roblox Studio', () => {
  it('adds the detected Roblox Studio server and lists its tools', async () => {
    const ud = fs.mkdtempSync(path.join(os.tmpdir(), 'ptrai-mcp-'))
    fs.writeFileSync(path.join(ud, 'config.json'), JSON.stringify({ settings: { onboarded: true, tosAcceptedVersion: TOS_VERSION, language: 'en', startup: 'home' } }))
    const packaged = process.env.PTRAI_EXE
    const app = await electron.launch({ executablePath: packaged ?? (require('electron') as unknown as string), args: packaged ? [] : [path.join(__dirname, '..', '..')], env: { ...process.env, PTRAI_USER_DATA: ud } })
    const page = await app.firstWindow()
    try {
      await page.getByText('What should we build?').waitFor()
      await page.getByRole('button', { name: 'Settings' }).click()
      await page.getByRole('dialog', { name: 'Settings' }).getByRole('button', { name: 'MCP' }).click()
      await page.getByText('detected on this computer').waitFor()
      await page.getByRole('button', { name: 'Add', exact: true }).click()
      await page.getByText(/Roblox Studio/).first().waitFor()
      await expect.poll(async () => (await page.getByText(/\d+ tools/i).count()) > 0, { timeout: 40000 }).toBe(true)
      const label = await page.getByText(/\d+ tools/i).first().innerText()
      expect(Number(label.match(/(\d+) tools/i)![1])).toBeGreaterThan(5)
      // Expand the server card to show its tool list.
      await page.locator('button', { hasText: /Tools|outils/ }).first().click()
      await expect.poll(() => page.locator('div.mono', { hasText: 'execute_luau' }).count(), { timeout: 10000 }).toBeGreaterThan(0)
      await page.screenshot({ path: path.join(__dirname, 'shots', '40-mcp-roblox.png') })
    } catch (e) { await page.screenshot({ path: path.join(__dirname, 'shots', '97-mcp-failure.png') }).catch(() => {}); throw e }
    finally { await app.close() }
  }, 90000)
})
