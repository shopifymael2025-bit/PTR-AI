// End-to-end smoke test of the real built Electron app (run `npm run build` first).
// Uses a mock model server speaking the Ollama protocol â€” this verifies the app wiring,
// NOT a live model. Screenshots are written to tests/e2e/shots/.
import { describe, it, expect, afterAll } from 'vitest'
import { _electron as electron, type ElectronApplication, type Page } from 'playwright-core'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { startMock } from '../mockServer'

const shots = path.join(__dirname, 'shots')
fs.mkdirSync(shots, { recursive: true })
const userData = fs.mkdtempSync(path.join(os.tmpdir(), 'ptrai-e2e-data-'))
const project = fs.mkdtempSync(path.join(os.tmpdir(), 'ptrai-e2e-proj-'))
fs.writeFileSync(path.join(project, 'README.md'), '# Demo project\n')
let app: ElectronApplication | null = null

async function launch(mockUrl: string) {
  // PTRAI_EXE lets the same test run against the packaged app (release/win-unpacked/PTR AI.exe).
  const packaged = process.env.PTRAI_EXE
  const exe = packaged ?? (require('electron') as unknown as string)
  const a = await electron.launch({ executablePath: exe, args: packaged ? [] : [path.join(__dirname, '..', '..')], env: { ...process.env, PTRAI_USER_DATA: userData } })
  await a.evaluate(({ dialog }, dir) => { dialog.showOpenDialog = (async () => ({ canceled: false, filePaths: [dir] })) as never }, project)
  const page = await a.firstWindow()
  await page.setViewportSize({ width: 1400, height: 880 }).catch(() => {})
  void mockUrl
  return { a, page }
}
const shot = (p: Page, name: string) => p.screenshot({ path: path.join(shots, `${name}.png`) })

afterAll(async () => { await app?.close().catch(() => {}) })

describe('PTR AI desktop app', () => {
  it('onboards, runs an agent task with approvals, and persists history across restarts', async () => {
    const mock = await startMock([
      { toolCalls: [{ name: 'create_file', args: { path: 'hello.ps1', content: 'Write-Output "Hello from PTR AI"\n' } }] },
      { toolCalls: [{ name: 'run_command', args: { command: '.\\hello.ps1' } }] },
      { text: 'Created **hello.ps1** and ran it - output: `Hello from PTR AI`.' }
    ])
    // Point the default Ollama provider at the mock before first launch.
    fs.writeFileSync(path.join(userData, 'config.json'), JSON.stringify({ settings: { permissionMode: 'approval' }, providers: [{ id: 'ollama', kind: 'ollama', name: 'Ollama', baseUrl: mock.url, enabled: true }] }))

    let { a, page } = await launch(mock.url)
    app = a
    page.on('console', (m) => console.log(`[renderer:${m.type()}]`, m.text().slice(0, 300)))
    page.on('pageerror', (e) => console.log('[renderer:pageerror]', e.message))
    try { await run() } catch (e) { await shot(page, '99-failure'); throw e }
    async function run() {
    // Terms of Service must be accepted before anything else.
    await page.getByText('Terms of Service').first().waitFor()
    expect(await page.getByRole('button', { name: 'Accept and continue' }).isDisabled()).toBe(true) // blocked until the box is ticked
    await page.getByRole('checkbox').check()
    await page.getByRole('button', { name: 'Accept and continue' }).click()
    await page.getByText('PTR AI.').waitFor()
    await shot(page, '01-onboarding-welcome')
    await page.getByRole('button', { name: /Next/ }).click()
    await page.getByText('Choose your AI provider').waitFor()
    await shot(page, '02-onboarding-provider')
    await page.getByRole('button', { name: /Ollama/ }).click()
    await page.getByText('Connect your model').waitFor({ timeout: 8000 })
    await page.getByText(/Running . v0\.99\.0-mock/).waitFor()
    await page.getByRole('button', { name: 'Use' }).click()
    await shot(page, '03-onboarding-connect')
    await page.getByRole('button', { name: /^Next/ }).click()
    await page.getByRole('button', { name: /Open project.*existing folder/ }).click()
    await page.getByText('What should we build?').waitFor()
    await shot(page, '04-home')

    await page.locator('#composer').fill('Create hello.ps1 that prints a greeting and run it')
    await page.keyboard.press('Enter')
    await page.getByRole('alertdialog').waitFor()
    await shot(page, '05-edit-approval')
    await page.getByRole('button', { name: 'Allow', exact: true }).click()
    await page.getByRole('alertdialog', { name: 'Run command' }).waitFor()
    await shot(page, '06-command-approval')
    await page.getByRole('button', { name: 'Allow', exact: true }).click()
    await page.getByText('Created hello.ps1', { exact: false }).waitFor({ timeout: 30000 })
    await shot(page, '07-task-done')
    expect(fs.readFileSync(path.join(project, 'hello.ps1'), 'utf8')).toContain('Hello from PTR AI')

    // The command really ran: its output is stored in the tool result shown in the UI.
    await page.getByText('.\\hello.ps1').click()
    await page.getByText(/Exit code: 0/).waitFor()
    await shot(page, '08-command-output')

    await page.getByRole('button', { name: 'Workspace', exact: true }).click()
    await page.getByText('hello.ps1').first().waitFor()
    await page.locator('aside, div').getByRole('button', { name: 'hello.ps1' }).first().click().catch(() => {})
    await page.waitForTimeout(1500)
    await shot(page, '09-workspace-layout')

    await page.getByRole('button', { name: 'Changes' }).click()
    await page.getByText('Modified files (1)').waitFor()
    await shot(page, '10-change-review')

    await page.getByRole('button', { name: 'Code', exact: true }).click()
    await page.keyboard.press('Control+Shift+P')
    await page.getByPlaceholder(/Type a command/).fill('theme')
    await page.keyboard.press('Enter')
    await page.waitForTimeout(400)
    await shot(page, '11-light-theme')
    await page.getByRole('button', { name: 'Settings' }).click()
    await page.getByRole('dialog', { name: 'Settings' }).waitFor()
    await shot(page, '12-settings')
    await page.keyboard.press('Escape')

    // Restart and confirm history persisted.
    await a.close()
    ;({ a, page } = await launch(mock.url))
    app = a
    await page.getByText('Create hello.ps1 that prints a greeting and run it').first().waitFor({ timeout: 15000 })
    await shot(page, '13-after-restart')
    await a.close(); app = null
    await mock.close()
    }
  }, 120000)
})

