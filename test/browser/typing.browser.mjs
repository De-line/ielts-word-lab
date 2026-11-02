import assert from 'node:assert/strict'
import { Buffer } from 'node:buffer'
import { createHash } from 'node:crypto'
import { execFileSync, spawn } from 'node:child_process'
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import process from 'node:process'
import { chromium } from 'playwright-core'

const root = process.cwd()
const output = resolve(root, 'test-results')
mkdirSync(output, { recursive: true })
if (!existsSync(resolve(root, 'dist/index.html')))
  throw new Error('Run pnpm run build before pnpm run test:browser.')

const bytes = readFileSync(resolve(root, 'src/pages/vocabulary/vocabulary.js'), 'utf8')
const data = JSON.parse(bytes.split('const vocabulary = ')[1].split('export default')[0].trim())
const topics = Object.keys(data)
const words = topic => data[topic].words.flat()
const port = Number(process.env.TEST_PORT || 4175)
const base = `http://127.0.0.1:${port}/`
const files = [
  '.gitignore', '.eslintignore', 'package.json', 'pnpm-lock.yaml', 'ATTRIBUTION.md',
  '.github/workflows/deploy.yml', '.github/workflows/validate.yml',
  'src/pages/vocabulary/index.vue', 'src/pages/vocabulary/typing.vue',
  'src/pages/vocabulary/records.vue',
  'index.html', 'vite.config.ts', '.node-version',
  'src/components/TheHeader.vue', 'src/components/TheFooter.vue',
  'src/pages/[...all].vue', 'src/pages/writing/index.vue',
  'src/pages/ielts/practice.vue', 'src/pages/listening/179practice.vue',
  ...['src/lib/vocabulary', 'test/vocabulary', 'test/browser', 'build', 'scripts'].flatMap(dir => readdirSync(resolve(root, dir)).map(file => `${dir}/${file}`)),
].sort()
const hash = createHash('sha256')
for (const file of files)
  hash.update(`${file}\0`).update(readFileSync(resolve(root, file))).update('\0')
const report = {
  executedAt: new Date().toISOString(),
  sourceCommit: execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim(),
  sourceState: 'uncommitted local Stage 2 + Stage 3 + Stage 4 changes',
  sourceFingerprint: hash.digest('hex'),
  fingerprintFiles: files,
  environment: { platform: process.platform, architecture: process.arch, node: process.version },
  cases: [],
  pageErrors: [],
}
const save = () => writeFileSync(resolve(output, 'browser.json'), `${JSON.stringify(report, null, 2)}\n`)
const server = spawn(process.execPath, [resolve(root, 'node_modules/vite/bin/vite.js'), 'preview', '--host', '127.0.0.1', '--port', String(port), '--strictPort'], { cwd: root, stdio: ['ignore', 'pipe', 'pipe'] })
let serverLog = ''
server.stdout.on('data', chunk => serverLog += chunk)
server.stderr.on('data', chunk => serverLog += chunk)
let browser
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms))

async function runCase(id, name, action, type = 'browser automation') {
  const started = Date.now()
  try {
    await action()
    report.cases.push({ id, name, type, result: 'passed', durationMs: Date.now() - started })
    process.stdout.write(`PASS ${id} ${name}\n`)
  }
  catch (error) {
    report.cases.push({ id, name, type, result: 'failed', error: String(error.stack || error), durationMs: Date.now() - started })
    process.stderr.write(`FAIL ${id} ${String(error)}\n`)
  }
  save()
}

async function withPage(action, route = '/vocabulary/typing', options = {}) {
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 }, ...options })
  // These are isolated local tests, never a user's profile or a third-party service.
  await context.route('**/*', request => request.request().url().startsWith(base) ? request.continue() : request.abort())
  const page = await context.newPage()
  page.setDefaultTimeout(5000)
  page.on('pageerror', error => report.pageErrors.push(error.message))
  try {
    await page.goto(`${base}#${route}`)
    await page.locator(route === '/vocabulary' ? 'table' : '[data-testid="typing-input"]').waitFor()
    await action(page)
  }
  finally {
    await context.close()
  }
}
const input = page => page.getByTestId('typing-input')
const prompt = page => page.getByTestId('accepted-spellings').innerText()
async function waitWord(page, expected) {
  await page.waitForFunction(value => document.querySelector('[data-testid="accepted-spellings"]')?.textContent.trim() === value, expected)
}
async function readHistory(page) {
  return page.evaluate(() => new Promise((resolve, reject) => {
    const opening = indexedDB.open('ielts-word-lab-learning', 1)
    opening.onerror = () => reject(opening.error)
    opening.onsuccess = () => {
      const database = opening.result
      const tx = database.transaction(['events', 'meta'])
      const events = tx.objectStore('events').getAll()
      const meta = tx.objectStore('meta').get('identity')
      tx.oncomplete = () => {
        resolve({ events: events.result, progress: meta.result?.progress })
        database.close()
      }
    }
  }))
}
async function saved(page) {
  await page.waitForFunction(() => !document.body.textContent.includes('正在自动保存') && !document.body.textContent.includes('正在保存，请'))
}
async function advance(page, index) {
  const list = words(topics[0])
  await input(page).fill(list[index].word[0])
  await waitWord(page, list[index + 1].word.join(' / '))
}

try {
  let ready = false
  for (let i = 0; i < 80; i++) {
    if (server.exitCode !== null)
      throw new Error(`Preview failed: ${serverLog}`)
    try {
      const response = await fetch(base, { signal: AbortSignal.timeout(500) })
      if (response.ok) {
        ready = true
        break
      }
    }
    catch {}
    await sleep(100)
  }
  if (!ready)
    throw new Error(`Preview did not start: ${serverLog}`)
  browser = await chromium.launch(process.env.BROWSER_EXECUTABLE_PATH ? { executablePath: process.env.BROWSER_EXECUTABLE_PATH, headless: true } : { channel: 'chrome', headless: true })
  report.environment.browser = await browser.version()
  report.audioResources = []
  for (const path of ['vocabulary/audio/01_自然地理/atmosphere.mp3', 'vocabulary/audio/12_饮食健康/chef.mp3']) {
    const response = await fetch(new URL(path, base))
    report.audioResources.push({ path, status: response.status, contentType: response.headers.get('content-type'), bytes: (await response.arrayBuffer()).byteLength })
  }

  await runCase('TC-TYP-003', 'extra suffix is visible, red and correctable with Backspace', () => withPage(async (page) => {
    await input(page).pressSequentially('atmospherex')
    assert.equal(await input(page).inputValue(), 'atmospherex')
    assert.equal(await page.locator('[data-status="error"]').last().innerText(), 'x')
    assert.equal(await input(page).getAttribute('aria-invalid'), 'true')
    await input(page).press('End')
    await input(page).press('Backspace')
    await waitWord(page, 'hydrosphere')
  }))

  await runCase('TC-TYP-004', 'native arrow movement, Delete and selection replacement work', () => withPage(async (page) => {
    await advance(page, 0)
    await input(page).fill('hydrxsphere')
    await input(page).press('Home')
    for (let i = 0; i < 4; i++)
      await input(page).press('ArrowRight')
    assert.equal(await input(page).evaluate(el => el.selectionStart), 4)
    await input(page).press('Delete')
    await input(page).pressSequentially('o')
    await waitWord(page, 'lithosphere')
    await input(page).fill('lithxsphere')
    await input(page).evaluate(el => el.setSelectionRange(4, 5))
    await input(page).pressSequentially('o')
    await waitWord(page, 'oxygen')
  }))

  await runCase('TC-TYP-005', 'retry restores usable input and skip cancels delayed success', () => withPage(async (page) => {
    await input(page).fill('incorrect-whole-word')
    await page.getByTestId('retry-word').click()
    assert.equal(await input(page).inputValue(), '')
    assert.equal(await input(page).evaluate(el => document.activeElement === el), true)
    await input(page).evaluate((el) => {
      el.value = 'atmosphere'
      el.dispatchEvent(new InputEvent('input', { bubbles: true }))
      document.querySelector('[data-testid="skip-word"]').click()
      document.querySelector('[data-testid="skip-word"]').click()
    })
    await waitWord(page, 'hydrosphere')
    await page.waitForTimeout(350)
    assert.equal(await prompt(page), 'hydrosphere')
  }))

  await runCase('TC-ASY-001', 'duplicate matching input cannot skip a second word', () => withPage(async (page) => {
    await input(page).evaluate((el) => {
      el.value = 'atmosphere'
      el.dispatchEvent(new InputEvent('input', { bubbles: true }))
      el.dispatchEvent(new InputEvent('input', { bubbles: true }))
    })
    await page.waitForTimeout(400)
    assert.equal(await prompt(page), 'hydrosphere')
  }))

  await runCase('TC-ASY-002', 'editing before the delayed transition cancels it', () => withPage(async (page) => {
    await input(page).evaluate((el) => {
      el.value = 'atmosphere'
      el.dispatchEvent(new InputEvent('input', { bubbles: true }))
      el.value = 'atmospherex'
      el.dispatchEvent(new InputEvent('input', { bubbles: true }))
    })
    await page.waitForTimeout(400)
    assert.equal(await prompt(page), 'atmosphere')
    assert.equal(await input(page).inputValue(), 'atmospherex')
  }))

  await runCase('TC-ASY-003', 'topic/group changes and route leave cancel stale transitions', () => withPage(async (page) => {
    await input(page).fill('atmosphere')
    await page.getByTestId('group-select').selectOption('2')
    await page.waitForTimeout(350)
    assert.equal(await prompt(page), words(topics[0])[20].word.join(' / '))
    await input(page).fill(words(topics[0])[20].word[0])
    await page.getByTestId('topic-select').selectOption(topics[1])
    await page.waitForTimeout(350)
    assert.equal(await page.getByTestId('group-select').inputValue(), '1')
    assert.equal(await prompt(page), words(topics[1])[0].word.join(' / '))
    await input(page).fill(words(topics[1])[0].word[0])
    await page.evaluate(() => location.hash = '/')
    await page.locator('h1').waitFor()
    await page.evaluate(() => location.hash = '/vocabulary/typing')
    await input(page).waitFor()
    // Stage 3 restores the committed draft. Cancel automatic completion to
    // observe the restored word instead of expecting Stage 2's discarded draft.
    await page.getByRole('button', { name: '重播发音' }).click()
    await page.waitForTimeout(350)
    assert.equal(await prompt(page), words(topics[1])[0].word.join(' / '))
    assert.equal(await input(page).inputValue(), words(topics[1])[0].word[0])
  }))

  await runCase('TC-IME-001', 'synthetic composition waits for commit and completes only once', () => withPage(async (page) => {
    await input(page).evaluate((el) => {
      el.dispatchEvent(new CompositionEvent('compositionstart', { bubbles: true }))
      el.value = '暂态'
      el.dispatchEvent(new InputEvent('input', { bubbles: true, isComposing: true }))
      el.value = 'atmosphere'
      el.dispatchEvent(new InputEvent('input', { bubbles: true, isComposing: true }))
    })
    await page.waitForTimeout(350)
    assert.equal(await prompt(page), 'atmosphere')
    assert.equal(await page.locator('[data-status="error"]').count(), 0)
    await input(page).evaluate((el) => {
      el.dispatchEvent(new CompositionEvent('compositionend', { bubbles: true }))
      el.dispatchEvent(new InputEvent('input', { bubbles: true }))
    })
    await page.waitForTimeout(400)
    assert.equal(await prompt(page), 'hydrosphere')
  }))

  await runCase('TC-NAV-001', 'three list/home/typing route cycles preserve native spaces and arrows', () => withPage(async (page) => {
    for (let cycle = 0; cycle < 3; cycle++) {
      if (cycle > 0) {
        await page.evaluate(() => location.hash = '/vocabulary')
        await page.locator('table').waitFor()
      }
      await page.evaluate(() => location.hash = '/')
      await page.getByText('单词练习', { exact: true }).click()
      await input(page).waitFor()
      await page.getByTestId('group-select').selectOption('2')
      await page.getByTestId('group-select').selectOption('1')
      for (let index = 0; index < 5; index++)
        await advance(page, index)
      await input(page).fill('carbon')
      await input(page).press('Space')
      assert.equal(await input(page).inputValue(), 'carbon ')
      await input(page).press('ArrowLeft')
      assert.equal(await input(page).evaluate(el => el.selectionStart), 6)
      await input(page).press('ArrowRight')
      await input(page).pressSequentially('dioxide')
      await waitWord(page, 'hydrogen')
    }
  }, '/vocabulary'))

  await runCase('TC-NAV-002', 'original chapter audio keyboard seek remains available', () => withPage(async (page) => {
    await page.locator('h3').first().click()
    await page.locator('audio').first().evaluate(el => el.currentTime = 10)
    await page.keyboard.press('ArrowRight')
    const currentTime = await page.locator('audio').first().evaluate(el => el.currentTime)
    assert.ok(currentTime >= 14.9)
  }, '/vocabulary'))

  await runCase('TC-GRP-002', 'select any topic/group and finish a short final group with a skip', () => withPage(async (page) => {
    assert.equal(await page.getByTestId('topic-select').locator('option').count(), 22)
    await page.getByTestId('group-select').selectOption('13')
    assert.ok((await page.getByTestId('group-progress').innerText()).includes('已练 0 / 1 词'))
    await page.getByTestId('skip-word').click()
    await page.getByTestId('group-finished').waitFor()
    assert.ok((await page.getByTestId('group-progress').innerText()).includes('已练 1 / 1 词'))
    await page.getByRole('button', { name: '再练本组' }).click()
    assert.equal(await input(page).inputValue(), '')
  }))

  await runCase('TC-FOC-001', 'blur/application pagehide recovers via a real focus button', () => withPage(async (page) => {
    await input(page).fill('atmos')
    await page.getByRole('button', { name: '重播发音' }).click()
    await page.evaluate(() => window.dispatchEvent(new Event('pagehide')))
    await page.getByRole('button', { name: '继续输入', exact: true }).click()
    assert.equal(await input(page).evaluate(el => document.activeElement === el), true)
    assert.equal(await input(page).inputValue(), 'atmos')
    await input(page).pressSequentially('phere')
    await waitWord(page, 'hydrosphere')
  }))

  await runCase('TC-SAVE-001', 'IndexedDB saves each completed event and draft, refresh and new tab restore same attempt', () => withPage(async (page) => {
    await input(page).fill('wrong')
    await input(page).fill('atmosphere')
    await waitWord(page, 'hydrosphere')
    await input(page).fill('hydro')
    await saved(page)
    const before = await readHistory(page)
    assert.equal(before.events.length, 1)
    assert.equal(before.events[0].result, 'corrected')
    await page.reload()
    await input(page).waitFor()
    assert.equal(await input(page).inputValue(), 'hydro')
    await waitWord(page, 'hydrosphere')
    const reopened = await page.context().newPage()
    await page.close()
    await reopened.goto(`${base}#/vocabulary/typing`)
    await input(reopened).waitFor()
    await reopened.waitForFunction(() => document.querySelector('[data-testid="typing-input"]')?.value === 'hydro')
    const after = await readHistory(reopened)
    assert.equal(after.progress.sessionId, before.progress.sessionId)
    await input(reopened).fill('hydrosphere')
    await waitWord(reopened, 'lithosphere')
    await saved(reopened)
    assert.equal((await readHistory(reopened)).events.length, 2)
  }))

  await runCase('TC-JSON-001/003', 'preview/cancel, backup download, atomic import, invalid data rejection and transaction rollback', () => withPage(async (page) => {
    await page.getByTestId('skip-word').click()
    await page.getByRole('link', { name: '学习记录与备份' }).click()
    await page.getByTestId('learning-summary').waitFor()
    await saved(page)
    const original = await readHistory(page)
    const upload = value => page.getByTestId('import-file').setInputFiles({ name: 'backup.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(value)) })
    const replacement = { formatVersion: 1, datasetNamespace: 'my-ielts.vocabulary', datasetVersion: '5cef573-v1', exportedAt: new Date().toISOString(), events: [], progress: null }
    await upload(replacement)
    await page.getByTestId('import-preview').waitFor()
    assert.equal(await page.getByTestId('replace-import').isDisabled(), true)
    assert.equal((await readHistory(page)).events.length, original.events.length)
    const downloading = page.waitForEvent('download')
    await page.getByRole('button', { name: '先导出现有备份', exact: true }).click()
    assert.ok((await downloading).suggestedFilename().endsWith('.json'))
    await page.getByRole('button', { name: '取消', exact: true }).click()
    assert.equal((await readHistory(page)).events.length, original.events.length)
    await upload({ ...replacement, datasetVersion: 'different' })
    await page.getByRole('alert').filter({ hasText: '词库身份或版本不匹配' }).waitFor()
    assert.equal((await readHistory(page)).events.length, original.events.length)
    await upload(replacement)
    await page.getByTestId('import-preview').waitFor()
    await page.getByTestId('confirm-import').check()
    await page.evaluate(() => {
      const originalTransaction = IDBDatabase.prototype.transaction
      IDBDatabase.prototype.transaction = function (...args) {
        const transaction = originalTransaction.apply(this, args)
        if (args[1] === 'readwrite') {
          IDBDatabase.prototype.transaction = originalTransaction
          queueMicrotask(() => transaction.abort())
        }
        return transaction
      }
    })
    await page.getByTestId('replace-import').click()
    await page.getByRole('alert').filter({ hasText: '导入失败' }).waitFor()
    assert.deepEqual((await readHistory(page)).events, original.events)
    await page.getByTestId('replace-import').click()
    await page.getByText('导入完成，已替换本浏览器的学习记录和练习位置。', { exact: true }).waitFor()
    assert.equal((await readHistory(page)).events.length, 0)
  }))

  await runCase('TC-REVIEW-001', 'whole and weak review share word identities and fixed group denominator', () => withPage(async (page) => {
    await page.getByRole('link', { name: '学习记录与备份' }).click()
    const topic = topics[0]
    const groupId = `my-ielts.vocabulary:5cef573-v1:${topic}:group-1`
    const now = new Date()
    const localDate = [now.getFullYear(), String(now.getMonth() + 1).padStart(2, '0'), String(now.getDate()).padStart(2, '0')].join('-')
    const events = words(topic).slice(0, 20).map((word, index) => ({ eventId: `seed:${index}`, attemptId: `seed:${index}`, sessionId: 'seed', datasetNamespace: 'my-ielts.vocabulary', datasetVersion: '5cef573-v1', wordId: `my-ielts.vocabulary:${word.id}`, sourceId: word.id, topicId: topic, groupId, endedAt: now.toISOString(), localDate, timezoneOffsetMinutes: now.getTimezoneOffset(), result: index < 5 ? 'skipped' : 'first_correct' }))
    const backup = { formatVersion: 1, datasetNamespace: 'my-ielts.vocabulary', datasetVersion: '5cef573-v1', exportedAt: now.toISOString(), events, progress: null }
    await page.getByTestId('import-file').setInputFiles({ name: 'review.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(backup)) })
    await page.getByTestId('confirm-import').check()
    await page.getByTestId('replace-import').click()
    const recommendation = page.getByTestId('recommended-group')
    await recommendation.waitFor()
    assert.ok((await recommendation.innerText()).includes('75.0%'))
    await recommendation.getByRole('link', { name: '只复习薄弱词' }).click()
    await input(page).waitFor()
    assert.ok((await page.getByTestId('group-progress').innerText()).includes('0 / 5'))
    await input(page).fill('atmos')
    await saved(page)
    await page.reload()
    await input(page).waitFor()
    await page.waitForFunction(() => document.querySelector('input')?.value === 'atmos')
    for (let i = 0; i < 5; i++)
      await page.getByTestId('skip-word').click()
    await page.getByTestId('group-finished').waitFor()
    await page.getByRole('link', { name: '学习记录与备份' }).click()
    await page.getByTestId('recommended-group').waitFor()
    assert.ok((await page.getByTestId('recommended-group').innerText()).includes('75.0%'))
    assert.ok((await page.getByTestId('group-record').first().innerText()).includes('20/20'))
    const data = await readHistory(page)
    assert.equal(data.events.length, 25)
    assert.equal(new Set(data.events.map(event => event.wordId)).size, 20)
    await page.getByTestId('recommended-group').getByRole('link', { name: '整组练习', exact: true }).click()
    await input(page).waitFor()
    assert.ok((await page.getByTestId('group-progress').innerText()).includes('0 / 20'))
  }))

  for (const mode of ['http404', 'unsupported', 'unavailable', 'stalled']) {
    await runCase(mode === 'stalled' ? 'TC-AUD-002' : 'TC-AUD-001', `audio ${mode} feedback never blocks typing`, () => withPage(async (page) => {
      await page.evaluate(() => {
        window.__audioEvents = []
        const original = document.createElement.bind(document)
        document.createElement = (...args) => {
          const element = original(...args)
          if (args[0] === 'audio') {
            for (const name of ['error', 'playing', 'waiting', 'stalled'])
              element.addEventListener(name, () => window.__audioEvents.push({ name, code: element.error?.code, readyState: element.readyState, networkState: element.networkState }))
          }
          return element
        }
      })
      if (mode === 'stalled')
        await page.evaluate(() => HTMLMediaElement.prototype.play = () => new Promise(() => {}))
      else
        await page.route('**/vocabulary/audio/**', route => mode === 'unavailable' ? route.abort('connectionrefused') : route.fulfill({ status: mode === 'http404' ? 404 : 200, contentType: 'audio/mpeg', body: 'not an mp3' }))
      await page.getByRole('button', { name: '重播发音' }).click()
      await page.getByTestId('audio-status').waitFor({ timeout: 12000 })
      assert.ok((await page.getByTestId('audio-status').innerText()).includes(mode === 'stalled' ? '音频加载超时' : '音频暂不可用'))
      report.audioEvents ??= {}
      report.audioEvents[mode] = await page.evaluate(() => window.__audioEvents)
      await input(page).fill('atmosphere')
      await waitWord(page, 'hydrosphere')
    }))
  }

  await runCase('TC-SAVE-002', 'browser IndexedDB denied still allows typing and visible storage warning', () => withPage(async (page) => {
    await page.addInitScript(() => Object.defineProperty(window, 'indexedDB', {
      configurable: true,
      get() {
        throw new DOMException('Denied', 'SecurityError')
      },
    }))
    await page.reload()
    await input(page).waitFor()
    await page.getByRole('alert').filter({ hasText: '无法读取学习记录' }).waitFor()
    await input(page).fill('atmosphere')
    await waitWord(page, 'hydrosphere')
  }))

  for (const width of [320, 390]) {
    await runCase('TC-VIEW-001/002', `${String(width)}px simulated mobile viewport: typing and records/backup controls`, () => withPage(async (page) => {
      const longest = topics.flatMap(topic => words(topic).map((entry, index) => ({ topic, entry, index }))).sort((a, b) => b.entry.word[0].length - a.entry.word[0].length)[0]
      await page.getByTestId('topic-select').selectOption(longest.topic)
      await page.getByTestId('group-select').selectOption(String(Math.floor(longest.index / 20) + 1))
      for (let index = 0; index < longest.index % 20; index++)
        await page.getByTestId('skip-word').click()
      await input(page).fill(`${longest.entry.word[0]}x`)
      assert.ok(await page.locator('[data-status="error"]').count() > 0)
      const layout = await input(page).evaluate(el => ({ right: el.getBoundingClientRect().right, height: el.getBoundingClientRect().height, fontSize: Number.parseFloat(getComputedStyle(el).fontSize), viewport: innerWidth, document: document.documentElement.scrollWidth }))
      assert.ok(layout.document <= layout.viewport)
      assert.ok(layout.right <= layout.viewport)
      assert.ok(layout.height >= 44)
      assert.ok(layout.fontSize >= 16)
      await page.screenshot({ path: resolve(output, `mobile-${width}.png`), fullPage: true })
      await page.getByRole('link', { name: '学习记录与备份' }).click()
      await page.getByTestId('learning-summary').waitFor()
      assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth))
      await page.getByTestId('import-file').scrollIntoViewIfNeeded()
      assert.ok((await page.getByTestId('import-file').boundingBox()).width <= width)
      await page.screenshot({ path: resolve(output, `records-${width}.png`), fullPage: true })
    }, '/vocabulary/typing', { viewport: { width, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 }), 'simulated mobile viewport')
  }

  assert.deepEqual(report.pageErrors, [], 'Unhandled application errors were captured.')
}
catch (error) {
  report.fatal = String(error.stack || error)
  process.exitCode = 1
}
finally {
  await browser?.close()
  server.kill('SIGTERM')
  await new Promise((resolve) => {
    if (server.exitCode !== null || server.signalCode)
      resolve()
    else
      server.once('exit', resolve)
  })
  report.passed = report.cases.filter(item => item.result === 'passed').length
  report.failed = report.cases.filter(item => item.result === 'failed').length
  save()
  if (report.failed || report.fatal)
    process.exitCode = 1
  process.stdout.write(`${JSON.stringify({ passed: report.passed, failed: report.failed, fatal: report.fatal, sourceFingerprint: report.sourceFingerprint, report: resolve(output, 'browser.json') })}\n`)
}
