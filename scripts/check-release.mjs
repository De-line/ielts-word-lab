import assert from 'node:assert/strict'
import { lstatSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import process from 'node:process'

const root = 'dist-pages'
mkdirSync('test-results', { recursive: true })
const files = []
function walk(path, prefix = '') {
  for (const name of readdirSync(path)) {
    const relative = prefix ? `${prefix}/${name}` : name
    const full = join(path, name)
    const stat = lstatSync(full)
    assert.ok(!stat.isSymbolicLink(), `Symlink in release artifact: ${relative}`)
    if (stat.isDirectory())
      walk(full, relative)
    else files.push({ path: relative, bytes: stat.size })
  }
}
walk(root)
const allowed = /^(?:index\.html|ATTRIBUTION\.txt|assets\/[^/]+\.(?:js|css)|vocabulary\/audio\/.+\.mp3|179_audios\/.+\.mp3|grammar\/.+\.(?:pdf|svg)|404\.svg|favicon\.(?:png|svg))$/
for (const file of files) {
  assert.ok(allowed.test(file.path), `Unexpected artifact file: ${file.path}`)
  if (/\.(?:js|css|html|svg|txt)$/.test(file.path)) {
    const text = readFileSync(join(root, file.path), 'utf8')
    assert.ok(!/(?:\/Users\/|\/home\/[^/]+\/|file:\/\/|[A-Z]:\\Users\\)/.test(text), `Local absolute path in artifact: ${file.path}`)
    assert.ok(!/(?:gh[pousr]_[A-Za-z0-9]{25,}|github_pat_[A-Za-z0-9_]{30,}|-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----|AKIA[0-9A-Z]{16})/.test(text), `Possible credential in artifact: ${file.path}`)
  }
}
const html = readFileSync(join(root, 'index.html'), 'utf8')
assert.ok(html.includes('/ielts-word-lab/assets/'), 'Pages base was not applied.')
assert.ok(html.includes('IELTS Word Lab'), 'Project title missing.')
assert.ok(!html.includes('sourceMappingURL'), 'Unexpected source map.')
assert.ok(files.some(file => file.path === 'ATTRIBUTION.txt'), 'Attribution missing.')
const report = { checkedAt: new Date().toISOString(), files: files.length, bytes: files.reduce((sum, file) => sum + file.bytes, 0), forbiddenFiles: 0, pathOrCredentialMatches: 0, inventory: files }
writeFileSync('test-results/release-artifact.json', `${JSON.stringify(report, null, 2)}\n`)
process.stdout.write(`${JSON.stringify({ files: report.files, bytes: report.bytes, forbiddenFiles: 0, pathOrCredentialMatches: 0 })}\n`)
