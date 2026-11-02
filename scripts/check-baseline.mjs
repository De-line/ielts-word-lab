import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import process from 'node:process'

const types = readFileSync('test-results/typecheck.log', 'utf8')
const diagnostics = types.split('\n').filter(line => /error TS\d+/.test(line))
assert.equal(diagnostics.length, 3, 'Global typecheck baseline changed; review diagnostics.')
assert.equal(diagnostics.filter(line => /src\/pages\/ielts\/practice\.vue\(19,\d+\): error TS7006/.test(line)).length, 2)
assert.equal(diagnostics.filter(line => /src\/pages\/ielts\/practice\.vue\(52,\d+\): error TS2322/.test(line)).length, 1)
const lint = readFileSync('test-results/full-lint.log', 'utf8')
const totals = lint.match(/\((\d+) errors?, (\d+) warnings?\)/)
assert.ok(totals, 'Global lint output has no summary; it may have crashed.')
// Targeted lint must pass independently. Any other baseline drift requires review.
assert.equal(Number(totals[1]), 98059, 'Global lint error baseline changed.')
assert.equal(Number(totals[2]), 38, 'Global lint warning baseline changed.')
process.stdout.write('Known global diagnostics match the reviewed baseline; they remain failures.\n')
