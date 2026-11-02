import assert from 'node:assert/strict'
import { Buffer } from 'node:buffer'
import { createHash } from 'node:crypto'
import { createServer } from 'node:http'
import { mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs'
import { extname, resolve, sep } from 'node:path'
import process from 'node:process'
import { chromium } from 'playwright-core'

const output = resolve('dist-pages')
const prefix = '/ielts-word-lab/'
const port = Number(process.env.RELEASE_TEST_PORT || 4176)
const origin = `http://127.0.0.1:${port}`
const base = `${origin}${prefix}`
let revision = 1
const server = createServer((req, res) => {
  try {
    const path = decodeURIComponent(new URL(req.url, origin).pathname)
    if (!path.startsWith(prefix)) {
      res.writeHead(404).end()
      return
    }
    const file = resolve(output, path.slice(prefix.length) || 'index.html')
    if (!file.startsWith(output + sep) || !statSync(file).isFile()) {
      res.writeHead(404).end()
      return
    }
    const types = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.png': 'image/png', '.mp3': 'audio/mpeg', '.pdf': 'application/pdf', '.txt': 'text/plain' }
    res.setHeader('Content-Type', types[extname(file)] || 'application/octet-stream')
    res.setHeader('Cache-Control', 'no-store')
    const body = readFileSync(file)
    res.end(file.endsWith('index.html') ? body.toString().replace('</head>', `<meta name="release-preview-revision" content="${revision}"></head>`) : body)
  }
  catch {
    res.writeHead(404).end()
  }
})
mkdirSync('test-results', { recursive: true })
const fingerprintFiles = JSON.parse(readFileSync('test-results/browser.json', 'utf8')).fingerprintFiles
const hash = createHash('sha256')
for (const file of fingerprintFiles)
  hash.update(`${file}\0`).update(readFileSync(file)).update('\0')
const report = { executedAt: new Date().toISOString(), base, sourceFingerprint: hash.digest('hex'), cases: [], pageErrors: [] }
let browser
const prompt = page => page.getByTestId('accepted-spellings')
const input = page => page.getByTestId('typing-input')
async function saved(page) {
  await page.waitForFunction(() => !document.body.textContent.includes('正在自动保存') && !document.body.textContent.includes('正在保存，请'))
}
async function run(id, name, action) {
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 } })
  await context.route('**/*', route => route.request().url().startsWith(base) ? route.continue() : route.abort())
  const page = await context.newPage()
  page.setDefaultTimeout(5000)
  page.on('pageerror', error => report.pageErrors.push(error.message))
  try {
    await action(page)
    report.cases.push({ id, name, result: 'PASS' })
    process.stdout.write(`PASS ${id} ${name}\n`)
  }
  catch (error) {
    report.cases.push({ id, name, result: 'FAIL', error: String(error.stack || error) })
    process.exitCode = 1
  }
  finally { await context.close() }
}
async function typing(page) {
  await page.goto(`${base}#/vocabulary/typing`)
  await input(page).waitFor()
  await page.waitForFunction(() => !document.querySelector('[data-testid="typing-input"]').disabled)
}
async function records(page) {
  await page.getByRole('link', { name: '学习记录与备份', exact: true }).click()
  await page.getByTestId('learning-summary').waitFor()
  await saved(page)
}
try {
  await new Promise((resolve, reject) => {
    server.once('error', reject)
    server.listen(port, '127.0.0.1', resolve)
  })
  browser = await chromium.launch(process.env.BROWSER_EXECUTABLE_PATH ? { executablePath: process.env.BROWSER_EXECUTABLE_PATH, headless: true } : { channel: 'chrome', headless: true })
  report.browser = await browser.version()
  await run('TC-REL-001', 'strict repository subpath, homepage, direct hash routes and refresh', async (page) => {
    assert.equal((await fetch(`${origin}/vocabulary/typing`)).status, 404)
    assert.equal((await fetch(`${base}vocabulary/typing`)).status, 404)
    await page.goto(base)
    assert.equal(await page.title(), 'IELTS Word Lab')
    await page.getByText('单词练习', { exact: true }).click()
    await input(page).waitFor()
    assert.ok(page.url().startsWith(base))
    await records(page)
    await page.reload()
    await page.getByTestId('learning-summary').waitFor()
    await typing(page)
    await page.reload()
    await input(page).waitFor()
    const logo = page.locator('header a').first()
    assert.equal(await logo.getAttribute('href'), prefix)
    await logo.click()
    await page.getByText('单词练习', { exact: true }).waitFor()
  })
  await run('TC-REL-002', 'group selection, short group, weak and whole sessions under subpath', async (page) => {
    await typing(page)
    await page.getByTestId('group-select').selectOption('13')
    assert.equal((await prompt(page).innerText()).trim(), 'petroleum')
    await page.getByTestId('skip-word').click()
    await page.getByTestId('group-finished').waitFor()
    await records(page)
    const item = page.getByTestId('recommended-group')
    await item.getByRole('link', { name: '只复习薄弱词' }).click()
    await input(page).waitFor()
    assert.ok(page.url().startsWith(base))
    await input(page).fill('petroleum')
    await page.getByTestId('group-finished').waitFor()
    await records(page)
    assert.ok((await page.getByTestId('recommended-group').innerText()).includes('0.0%'))
    await page.getByTestId('recommended-group').getByRole('link', { name: '整组练习', exact: true }).click()
    await input(page).waitFor()
    assert.equal((await prompt(page).innerText()).trim(), 'petroleum')
    assert.ok((await page.getByTestId('group-progress').innerText()).includes('0 / 1'))
  })
  await run('TC-REL-003', 'ordinary static revision update retains IndexedDB history and committed draft', async (page) => {
    await typing(page)
    await page.getByTestId('skip-word').click()
    await input(page).fill('hydro')
    await saved(page)
    revision++
    await page.reload()
    await page.waitForFunction(() => document.querySelector('[data-testid="typing-input"]')?.value === 'hydro')
    assert.equal((await prompt(page).innerText()).trim(), 'hydrosphere')
    await records(page)
    assert.ok((await page.getByTestId('group-record').first().innerText()).includes('1/20'))
    assert.equal(await page.locator('meta[name="release-preview-revision"]').getAttribute('content'), String(revision))
  })
  await run('TC-REL-004', 'export, preview, cancel, explicit replacement and restored draft', async (page) => {
    await typing(page)
    await page.getByTestId('skip-word').click()
    await input(page).fill('hydro')
    await records(page)
    const pending = page.waitForEvent('download')
    await page.getByRole('button', { name: '导出现有备份', exact: true }).click()
    const chunks = []
    for await (const chunk of await (await pending).createReadStream()) chunks.push(chunk)
    const bytes = Buffer.concat(chunks)
    const backup = JSON.parse(bytes.toString())
    assert.equal(backup.events.length, 1)
    const file = { name: 'synthetic-backup.json', mimeType: 'application/json', buffer: bytes }
    await page.getByTestId('import-file').setInputFiles(file)
    await page.getByTestId('import-preview').waitFor()
    assert.equal(await page.getByTestId('replace-import').isDisabled(), true)
    await page.getByRole('button', { name: '取消', exact: true }).click()
    await page.getByRole('link', { name: '返回单词练习', exact: true }).click()
    await page.getByTestId('group-select').selectOption('13')
    await input(page).fill('petro')
    await records(page)
    await page.getByTestId('import-file').setInputFiles(file)
    await page.getByTestId('confirm-import').check()
    await page.getByTestId('replace-import').click()
    await page.getByText('导入完成，已替换本浏览器的学习记录和练习位置。', { exact: true }).waitFor()
    await page.getByTestId('continue-practice').click()
    await page.waitForFunction(() => document.querySelector('[data-testid="typing-input"]')?.value === 'hydro')
    await page.reload()
    await page.waitForFunction(() => document.querySelector('[data-testid="typing-input"]')?.value === 'hydro')
  })
  await run('TC-REL-005', 'audio, favicon, grammar resources and app not-found image use repository path', async (page) => {
    for (const path of ['favicon.png', '404.svg', 'grammar/雅思语法.svg', 'grammar/雅思基础语法配套课程讲义.pdf', 'vocabulary/audio/01_自然地理/atmosphere.mp3'])
      assert.equal((await fetch(new URL(path, base))).status, 200, path)
    assert.equal((await fetch(new URL('vocabulary/audio/12_饮食健康/chef.mp3', base))).status, 404)
    await typing(page)
    const request = page.waitForRequest(req => req.url().includes('/vocabulary/audio/') && req.url().endsWith('atmosphere.mp3'))
    await page.getByRole('button', { name: '重播发音', exact: true }).click()
    assert.ok((await request).url().startsWith(base))
    await page.goto(`${base}#/no-such-page`)
    await page.getByText('Page not found', { exact: true }).waitFor()
    assert.equal(await page.locator('img[alt="astronaut image"]').getAttribute('src'), `${prefix}404.svg`)
    await page.getByRole('link', { name: 'Go back home' }).click()
    await page.getByText('单词练习', { exact: true }).waitFor()
  })
  await run('TC-REL-006', 'unrelated modules render and legacy listening audio paths retain subpath', async (page) => {
    for (const route of ['/grammar', '/listening', '/reading', '/writing', '/speaking']) {
      await page.goto(`${base}#${route}`)
      await page.locator('main, h1, h2, h3, table').first().waitFor()
      if (route === '/writing')
        assert.ok((await page.getByRole('link', { name: '100 句翻译练习', exact: true }).getAttribute('href')).startsWith(prefix))
    }
    for (const route of ['/ielts/practice', '/listening/179practice']) {
      await page.goto(`${base}#${route}`)
      const request = page.waitForRequest(req => req.url().includes('179_audios/'))
      await page.getByRole('button', { name: '开始', exact: true }).click()
      assert.ok((await request).url().startsWith(base))
    }
  })
  assert.deepEqual(report.pageErrors, [])
}
catch (error) {
  report.fatal = String(error.stack || error)
  process.exitCode = 1
}
finally {
  await browser?.close()
  await new Promise(resolve => server.close(resolve))
  report.passed = report.cases.filter(item => item.result === 'PASS').length
  report.failed = report.cases.filter(item => item.result === 'FAIL').length
  writeFileSync('test-results/release-browser.json', `${JSON.stringify(report, null, 2)}\n`)
  process.stdout.write(`${JSON.stringify(report)}\n`)
}
