// Generates the marketing screenshot for the website (docs/assets/onyx-workspace.png).
// Run: $env:PTRAI_SHOT='1'; npx vitest run --config vitest.e2e.config.ts tests/e2e/screenshot.e2e.ts
// Uses a scripted mock model and a demo project, so no personal paths appear in the image.
import { TOS_VERSION } from '../../src/shared/app'
import { describe, it } from 'vitest'
import { _electron as electron } from 'playwright-core'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { startMock } from '../mockServer'

const MAIN_PY = `import random
import pygame

CELL, COLS, ROWS = 24, 28, 20
WHITE, BLACK, GREEN, RED = (240, 240, 240), (16, 16, 16), (80, 200, 120), (230, 80, 70)


def new_food(snake):
    while True:
        pos = (random.randrange(COLS), random.randrange(ROWS))
        if pos not in snake:
            return pos


def main():
    pygame.init()
    screen = pygame.display.set_mode((COLS * CELL, ROWS * CELL))
    pygame.display.set_caption("Snake")
    clock = pygame.time.Clock()
    snake = [(COLS // 2, ROWS // 2)]
    direction = (1, 0)
    food = new_food(snake)

    while True:
        for event in pygame.event.get():
            if event.type == pygame.QUIT:
                return
            if event.type == pygame.KEYDOWN:
                keys = {pygame.K_UP: (0, -1), pygame.K_DOWN: (0, 1), pygame.K_LEFT: (-1, 0), pygame.K_RIGHT: (1, 0)}
                if event.key in keys and keys[event.key] != (-direction[0], -direction[1]):
                    direction = keys[event.key]

        head = ((snake[0][0] + direction[0]) % COLS, (snake[0][1] + direction[1]) % ROWS)
        if head in snake:
            return
        snake.insert(0, head)
        if head == food:
            food = new_food(snake)
        else:
            snake.pop()

        screen.fill(BLACK)
        for x, y in snake:
            pygame.draw.rect(screen, GREEN, (x * CELL, y * CELL, CELL - 2, CELL - 2))
        pygame.draw.rect(screen, RED, (food[0] * CELL, food[1] * CELL, CELL - 2, CELL - 2))
        pygame.display.flip()
        clock.tick(10)


if __name__ == "__main__":
    main()
`

describe.skipIf(!process.env.PTRAI_SHOT)('Website screenshot', () => {
  it('captures a clean workspace session', async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ptrai-demo-'))
    const proj = path.join(root, 'snake-game')
    fs.mkdirSync(proj)
    fs.writeFileSync(path.join(proj, 'main.py'), MAIN_PY)
    fs.writeFileSync(path.join(proj, 'requirements.txt'), 'pygame>=2.5\n')
    fs.writeFileSync(path.join(proj, 'README.md'), '# Snake\n\nClassic snake in Python + pygame.\n\n```\npip install -r requirements.txt\npython main.py\n```\n')

    const mock = await startMock([
      { text: "I'll look at the game loop first.", toolCalls: [{ name: 'read_file', args: { path: 'main.py' } }] },
      { toolCalls: [{ name: 'apply_patch', args: { path: 'main.py', edits: [
        { old_text: '    food = new_food(snake)\n\n    while True:', new_text: '    food = new_food(snake)\n    score = 0\n    font = pygame.font.SysFont("consolas", 20)\n\n    while True:' },
        { old_text: '        if head == food:\n            food = new_food(snake)', new_text: '        if head == food:\n            score += 1\n            food = new_food(snake)' },
        { old_text: '        pygame.display.flip()\n        clock.tick(10)', new_text: '        screen.blit(font.render(f"Score {score}", True, WHITE), (10, 8))\n        pygame.display.flip()\n        clock.tick(10 + score // 3)  # speeds up as the snake grows' }
      ] } }] },
      { toolCalls: [{ name: 'run_command', args: { command: 'python -m py_compile main.py; if ($?) { "main.py compiles" }' } }] },
      { text: 'Done. **main.py** now has a score counter and gets faster as the snake grows.\n\n- `score` goes up each time the snake eats\n- The score is drawn in the top-left corner\n- Speed is `10 + score // 3` frames per second\n\nVerified: `main.py` compiles without errors. Run it with `python main.py`.' }
    ])
    const ud = fs.mkdtempSync(path.join(os.tmpdir(), 'ptrai-shot-'))
    fs.writeFileSync(path.join(ud, 'config.json'), JSON.stringify({
      settings: { onboarded: true, tosAcceptedVersion: TOS_VERSION, language: 'en', theme: 'dark', permissionMode: 'auto', defaultModel: { providerId: 'ollama', model: 'qwen2.5-coder:7b' } },
      providers: [{ id: 'ollama', kind: 'ollama', name: 'Ollama', baseUrl: mock.url, enabled: true }]
    }))
    const packaged = process.env.PTRAI_EXE
    const app = await electron.launch({ executablePath: packaged ?? (require('electron') as unknown as string), args: packaged ? [] : [path.join(__dirname, '..', '..')], env: { ...process.env, PTRAI_USER_DATA: ud } })
    await app.evaluate(({ dialog }, dir) => { dialog.showOpenDialog = (async () => ({ canceled: false, filePaths: [dir] })) as never }, proj)
    await app.evaluate(({ BrowserWindow }) => { const w = BrowserWindow.getAllWindows()[0]; w.setSize(1600, 960); w.center() })
    const page = await app.firstWindow()
    try {
      await page.getByText('What should we build?').waitFor()
      await page.getByRole('button', { name: 'Open project' }).first().click()
      await page.getByText('snake-game').first().waitFor()
      await page.locator('#composer').fill('Add a score counter and make the snake faster as it grows')
      await page.keyboard.press('Enter')
      await page.getByText('Verified:').waitFor({ timeout: 30000 })

      await page.getByRole('button', { name: 'Workspace', exact: true }).click()
      await page.locator('aside, div').getByRole('button', { name: 'main.py' }).first().click()
      await page.waitForTimeout(1200)
      // Hide the full folder path in the terminal prompt, then show a clean run.
      const term = page.locator('.xterm-helper-textarea').first()
      await term.focus()
      await page.keyboard.type('function prompt { "PS snake-game> " }; Clear-Host\r')
      await page.waitForTimeout(1200)
      await page.keyboard.type('python -m py_compile main.py; if ($?) { "OK: main.py compiles" }\r')
      await page.waitForTimeout(2500)
      await page.mouse.move(5, 300)
      await page.waitForTimeout(400)
      const out = path.join(__dirname, '..', '..', '..', 'docs', 'assets', 'onyx-workspace.png')
      await page.screenshot({ path: out })
      // A second, chat-only capture.
      await page.getByRole('button', { name: 'Chat', exact: true }).click()
      await page.waitForTimeout(800)
      await page.screenshot({ path: path.join(__dirname, '..', '..', '..', 'docs', 'assets', 'onyx-chat.png') })
    } finally { await app.close(); await mock.close() }
  }, 120000)
})
