// E2E: French UI, mode menu in Code layout, Apply-to-file without a project (project picker + conversation move),
// running a code block in the integrated terminal, and permission settings. Uses the mock model server.
import { TOS_VERSION } from '../../src/shared/app'
import { describe, it, expect } from 'vitest'
import { _electron as electron } from 'playwright-core'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { startMock } from '../mockServer'

const shots = path.join(__dirname, 'shots')

describe('PTR AI features (FR)', () => {
  it('mode menu, apply-to-file project picker, run snippet, permissions UI', async () => {
    const reply = 'Voici le script :\n\n```python\nprint("pong-" + str(6*7))\n```\n'
    const mock = await startMock([{ text: reply }])
    const ud = fs.mkdtempSync(path.join(os.tmpdir(), 'ptrai-feat-'))
    const proj = fs.mkdtempSync(path.join(os.tmpdir(), 'ptrai-feat-proj-'))
    fs.writeFileSync(path.join(ud, 'config.json'), JSON.stringify({
      settings: { onboarded: true, tosAcceptedVersion: TOS_VERSION, language: 'fr', startup: 'home', defaultModel: { providerId: 'ollama', model: 'mock:latest' } },
      providers: [{ id: 'ollama', kind: 'ollama', name: 'Ollama', baseUrl: mock.url, enabled: true }, { id: 'opencode', kind: 'opencode', name: 'OpenCode Zen', baseUrl: 'https://opencode.ai/zen/v1', enabled: false }]
    }))
    const packaged = process.env.PTRAI_EXE
    const app = await electron.launch({ executablePath: packaged ?? (require('electron') as unknown as string), args: packaged ? [] : [path.join(__dirname, '..', '..')], env: { ...process.env, PTRAI_USER_DATA: ud } })
    await app.evaluate(({ dialog }, dir) => { dialog.showOpenDialog = (async () => ({ canceled: false, filePaths: [dir] })) as never }, proj)
    const page = await app.firstWindow()
    const shot = (n: string) => page.screenshot({ path: path.join(shots, `${n}.png`) })
    try {
      await page.getByText('Que construisons-nous ?').waitFor()

      // Mode menu works in Code layout (Ask = "Question" in French).
      await page.getByRole('button', { name: 'Code', exact: true }).click()
      await page.getByRole('button', { name: 'Agent mode' }).click()
      await page.getByRole('menuitem', { name: /Question/ }).click()
      await expect.poll(() => page.getByRole('button', { name: 'Agent mode' }).innerText()).toBe('Question')
      await page.getByRole('button', { name: 'Agent mode' }).click()
      await page.getByRole('menuitem', { name: /Construire/ }).click()
      await shot('30-code-layout-fr')

      // Chat without a project, then "Appliquer au fichier" → project picker → conversation moves into the project.
      await page.locator('#composer').fill('Écris un script python')
      await page.keyboard.press('Enter')
      await page.getByText('Voici le script').waitFor()
      await page.getByRole('button', { name: /Appliquer au fichier/ }).click()
      await page.getByRole('dialog', { name: 'Choisir un projet pour cette discussion' }).waitFor()
      await shot('31-project-picker')
      await page.getByRole('button', { name: /Ouvrir un autre dossier/ }).click()
      const ask = page.getByRole('textbox', { name: /Appliquer au fichier/ })
      await ask.fill('pong.py')
      await ask.press('Enter')
      await page.getByRole('button', { name: /Accepter et écrire/ }).click()
      await expect.poll(() => fs.existsSync(path.join(proj, 'pong.py')), { timeout: 10000 }).toBe(true)
      expect(fs.readFileSync(path.join(proj, 'pong.py'), 'utf8')).toContain('pong-')
      await page.getByText('Écris un script python').first().waitFor() // conversation kept, now inside the project
      await shot('32-applied')

      // Run the code block inside PTR AI: opens the terminal and runs it.
      await page.getByRole('button', { name: 'Chat', exact: true }).click()
      await page.getByRole('button', { name: /^Lancer$/ }).first().click()
      await expect.poll(async () => (await page.locator('.xterm-rows').allInnerTexts()).join('\n'), { timeout: 20000 }).toContain('pong-42')
      await shot('33-run-snippet')

      // Deleting a conversation uses PTR AI's own confirmation dialog (not the native Windows popup).
      const aside = page.locator('aside')
      await aside.getByText('Écris un script python').hover()
      await aside.getByRole('button', { name: 'More' }).click()
      await aside.getByRole('button', { name: /Supprimer/ }).click()
      const dlg = page.getByRole('alertdialog', { name: /Supprimer cette discussion/ })
      await dlg.waitFor()
      await shot('36-confirm-dialog')
      await dlg.getByRole('button', { name: 'Annuler' }).click()
      await dlg.waitFor({ state: 'detached' })
      await aside.getByText('Écris un script python').waitFor() // still there

      // Settings in French with permission modes.
      await page.getByRole('button', { name: 'Paramètres' }).click()
      await page.getByRole('dialog', { name: 'Paramètres' }).getByRole('button', { name: 'Agent' }).click()
      await page.getByRole('radio', { name: /Auto/ }).waitFor()
      expect(await page.getByRole('radio', { name: /Auto/ }).getAttribute('aria-checked')).toBe('true')
      await shot('34-settings-permissions-fr')
      await page.getByRole('dialog', { name: 'Paramètres' }).getByRole('button', { name: 'Modèles' }).click()
      await page.getByRole('button', { name: /Ajouter un fournisseur/ }).click()
      await page.getByText('Google Gemini').waitFor()
      await shot('35-settings-models-fr')
    } catch (e) { await shot('98-features-failure'); throw e }
    finally { await app.close(); await mock.close() }
  }, 120000)
})
