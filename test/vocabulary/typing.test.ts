import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { DATASET_VERSION, vocabularyCatalog } from '../../src/lib/vocabulary/catalog'
import type { VocabularyGroup } from '../../src/lib/vocabulary/catalog'
import { TypingSession, characterFeedback, isValidPrefix, normalizeSpelling } from '../../src/lib/vocabulary/typing'
import type { TypingOutcome } from '../../src/lib/vocabulary/typing'

const group = vocabularyCatalog[0].groups[0]

function setup(exercise: VocabularyGroup = group) {
  const events: TypingOutcome[] = []
  const engine = new TypingSession({ onOutcome: event => events.push(event) })
  engine.start(exercise)
  const input = (value: string, composing = false) => engine.input(value, engine.state.attemptId, composing)
  const complete = (value: string) => {
    input(value)
    vi.advanceTimersByTime(200)
  }
  return { engine, events, input, complete }
}

beforeEach(() => {
  vi.useFakeTimers()
  vi.setSystemTime(new Date('2026-10-28T10:00:00+08:00'))
})
afterEach(() => {
  vi.useRealTimers()
})

describe('typing outcomes and recovery', () => {
  it('TC-TYP-001 / TC-OUT-001 valid prefixes complete once as first_correct with identity metadata', () => {
    const { engine, input, events, complete } = setup()
    input('atmos')
    expect(engine.state.hadError).toBe(false)
    expect(events).toHaveLength(0)
    complete('atmosphere')
    expect(events).toHaveLength(1)
    expect(events[0]).toMatchObject({ result: 'first_correct', completed: true, wordId: group.entries[0].wordId, sourceId: 1, datasetVersion: DATASET_VERSION, acceptedSpelling: 'atmosphere', hadError: false })
    expect(events[0].eventId).toBe(events[0].attemptId)
    expect(events[0].endedAt).toBe(new Date().toISOString())
    expect(events[0].localDate).toMatch(/^\d{4}-\d{2}-\d{2}$/)
    expect(engine.state.currentWord?.spellings[0]).toBe('hydrosphere')
  })

  it('TC-TYP-002 keeps a genuine error after editing, deleting all text or retrying this same word', () => {
    const { engine, input, complete, events } = setup()
    input('atmospherx')
    input('atmospher')
    input('')
    engine.retry(engine.state.attemptId)
    expect(engine.state.input).toBe('')
    expect(engine.state.hadError).toBe(true)
    complete('atmosphere')
    expect(events[0]).toMatchObject({ result: 'corrected', hadError: true })
    expect(engine.state.hadError).toBe(false)
    complete('hydrosphere')
    expect(events[1].result).toBe('first_correct')
  })

  it('TC-TYP-003 renders the actual extra characters as errors and permits correction', () => {
    const { engine, input, complete, events } = setup()
    input('atmospherex')
    const feedback = characterFeedback(engine.state.input, group.entries[0].spellings)
    expect(feedback.map(item => item.value).join('')).toBe('atmospherex')
    expect(feedback[10]).toEqual({ value: 'x', status: 'error' })
    expect(engine.state.pending).toBe(false)
    complete('atmosphere')
    expect(events[0].result).toBe('corrected')
  })

  it('TC-TYP-005 skip cancels a pending success and ignores repeated actions for the settled word', () => {
    const { engine, input, events } = setup()
    const id = engine.state.attemptId
    input('atmosphere')
    engine.skip(id)
    engine.skip(id)
    vi.advanceTimersByTime(500)
    expect(events).toHaveLength(1)
    expect(events[0]).toMatchObject({ result: 'skipped', completed: true, acceptedSpelling: null })
    expect(engine.state.index).toBe(1)
  })

  it('TC-TYP-006 a group can finish entirely with skips, including a one-word final group', () => {
    const { engine, events } = setup(vocabularyCatalog[0].groups[12])
    engine.skip(engine.state.attemptId)
    expect(engine.state.finished).toBe(true)
    expect(engine.state.counts).toEqual({ first_correct: 0, corrected: 0, skipped: 1 })
    engine.skip(engine.state.attemptId)
    expect(events).toHaveLength(1)
    engine.start(group)
    for (let i = 0; i < 20; i++)
      engine.skip(engine.state.attemptId)
    expect(engine.state.finished).toBe(true)
    expect(engine.state.counts.skipped).toBe(20)
  })

  it('TC-OUT-002 abandoning a prefix emits incomplete only once; untouched words emit nothing', () => {
    const { engine, input, events } = setup()
    engine.start(group)
    expect(events).toHaveLength(0)
    input('atm')
    engine.dispose()
    engine.dispose()
    vi.advanceTimersByTime(1000)
    expect(events).toHaveLength(1)
    expect(events[0]).toMatchObject({ result: 'incomplete', completed: false, hadError: false, reason: 'unmounted', input: 'atm' })
  })
})

describe('event sequencing', () => {
  it('TC-ASY-001 duplicate matching input events schedule at most one transition', () => {
    const { engine, input, events } = setup()
    input('atmosphere')
    input('atmosphere')
    expect(vi.getTimerCount()).toBe(1)
    vi.advanceTimersByTime(1000)
    expect(engine.state.index).toBe(1)
    expect(events).toHaveLength(1)
  })

  it('TC-ASY-002 changing a correct answer before its timer fires cancels completion', () => {
    const { engine, input, events } = setup()
    input('atmosphere')
    input('atmospherex')
    vi.advanceTimersByTime(1000)
    expect(engine.state.index).toBe(0)
    expect(events).toHaveLength(0)
    engine.retry(engine.state.attemptId)
    vi.advanceTimersByTime(1000)
    expect(engine.state.input).toBe('')
    expect(engine.state.index).toBe(0)
  })

  it('TC-ASY-002 retry directly cancels a pending success without inventing an error', () => {
    const { engine, input, complete, events } = setup()
    input('atmosphere')
    engine.retry(engine.state.attemptId)
    vi.advanceTimersByTime(1000)
    expect(engine.state.index).toBe(0)
    expect(engine.state.input).toBe('')
    expect(events).toHaveLength(0)
    complete('atmosphere')
    expect(events[0].result).toBe('first_correct')
  })

  it('TC-ASY-003 switching group, topic, restarting or unmounting invalidates old callbacks', () => {
    const { engine, input, events } = setup()
    input('atmosphere')
    engine.start(vocabularyCatalog[0].groups[1])
    vi.advanceTimersByTime(1000)
    expect(engine.state.index).toBe(0)
    expect(engine.state.group?.number).toBe(2)
    input(engine.state.currentWord!.spellings[0])
    engine.start(vocabularyCatalog[1].groups[0])
    vi.advanceTimersByTime(1000)
    expect(engine.state.currentWord?.spellings[0]).toBe('photosynthesis')
    input('photosynthesis')
    engine.start(vocabularyCatalog[1].groups[0], 'restarted')
    vi.advanceTimersByTime(1000)
    expect(engine.state.index).toBe(0)
    input('photosynthesis')
    engine.dispose()
    vi.advanceTimersByTime(1000)
    expect(events.filter(event => event.completed)).toHaveLength(0)
    expect(events.map(event => event.result)).toEqual(['incomplete', 'incomplete', 'incomplete', 'incomplete'])
  })

  it('TC-ASY-004 even a callback already queued before cancellation cannot advance a new exercise', () => {
    const callbacks: (() => void)[] = []
    const engine = new TypingSession({ schedule: callback => callbacks.push(callback), cancel: () => {} })
    engine.start(group)
    const oldId = engine.state.attemptId
    engine.input('atmosphere', oldId)
    engine.start(group)
    callbacks[0]()
    engine.input('atmosphere', oldId)
    engine.skip(oldId)
    expect(engine.state.index).toBe(0)
    expect(engine.state.input).toBe('')
  })

  it('TC-IME-001 composition states are never scored or advanced; the committed value completes normally', () => {
    const { engine, input, events } = setup()
    engine.compositionStart(engine.state.attemptId)
    input('完全不同的临时组合', true)
    expect(engine.state.hadError).toBe(false)
    expect(characterFeedback(engine.state.input, group.entries[0].spellings, true).every(char => char.status === 'composing')).toBe(true)
    input('atmosphere', true)
    vi.advanceTimersByTime(500)
    expect(events).toHaveLength(0)
    engine.compositionEnd('atmosphere', engine.state.attemptId)
    input('atmosphere') // Browsers can emit a final input after compositionend.
    vi.advanceTimersByTime(500)
    expect(events).toHaveLength(1)
    expect(events[0].result).toBe('first_correct')
  })

  it('TC-IME-002 suspending discards an uncommitted composition without counting an error', () => {
    const { engine, input, events, complete } = setup()
    input('atm')
    engine.compositionStart(engine.state.attemptId)
    input('暂态', true)
    engine.suspend()
    expect(engine.state.input).toBe('atm')
    expect(engine.state.composing).toBe(false)
    engine.compositionEnd('暂态', engine.state.attemptId)
    engine.resume()
    complete('atmosphere')
    expect(events[0].result).toBe('first_correct')
  })

  it('TC-IME-001 starting composition cancels a pending match; only a committed wrong value counts as an error', () => {
    const { engine, input, complete, events } = setup()
    input('atmosphere')
    engine.compositionStart(engine.state.attemptId)
    vi.advanceTimersByTime(1000)
    expect(events).toHaveLength(0)
    input('暂态', true)
    expect(engine.state.hadError).toBe(false)
    engine.compositionEnd('wrong', engine.state.attemptId)
    expect(engine.state.hadError).toBe(true)
    complete('atmosphere')
    expect(events[0].result).toBe('corrected')
  })

  it.each([30000, 120000])('TC-PAUSE-001 a %i ms pause does not penalize an incomplete valid prefix', (pause) => {
    const { input, complete, events } = setup()
    input('atmos')
    vi.advanceTimersByTime(pause)
    complete('atmosphere')
    expect(events[0].result).toBe('first_correct')
  })

  it('TC-FOC-001 blur/background cancels pending completion and resumes safely without losing a committed answer', () => {
    const { engine, input, events } = setup()
    input('atmosphere')
    engine.suspend()
    vi.advanceTimersByTime(120000)
    expect(events).toHaveLength(0)
    expect(engine.state.input).toBe('atmosphere')
    engine.resume()
    engine.resume()
    vi.advanceTimersByTime(200)
    expect(events).toHaveLength(1)
    expect(events[0].result).toBe('first_correct')
  })
})

describe('accepted spellings and explicit normalization', () => {
  it('TC-SPL-001 accepts every spelling and every prefix of all 70 alternative entries', () => {
    const entries = vocabularyCatalog.flatMap(topic => topic.entries).filter(entry => entry.spellings.length > 1)
    expect(entries).toHaveLength(70)
    for (const entry of entries) {
      for (const spelling of entry.spellings) {
        const { events, complete } = setup({ ...group, entries: [entry] })
        complete(spelling)
        expect(events[0]).toMatchObject({ result: 'first_correct', acceptedSpelling: spelling })
        for (let length = 0; length <= spelling.length; length++) {
          const prefix = spelling.slice(0, length)
          expect(isValidPrefix(prefix, entry.spellings)).toBe(true)
          expect(characterFeedback(prefix, entry.spellings).some(char => char.status === 'error')).toBe(false)
        }
      }
    }
  })

  it('TC-SPL-002 preserves spaces, hyphens, case and accents while allowing canonical Unicode and typographic spaces', () => {
    expect(normalizeSpelling('re\u0301sume\u0301')).toBe('résumé')
    expect(normalizeSpelling('carbon\u00A0dioxide')).toBe('carbon dioxide')
    for (const [input, answer] of [['carbondioxide', 'carbon dioxide'], ['carbon  dioxide', 'carbon dioxide'], [' eco-friendly', 'eco-friendly'], ['ecofriendly', 'eco-friendly'], ['el nino', 'El Nino'], ['résume', 'résumé'], ['carbon\u200Bdioxide', 'carbon dioxide']])
      expect(isValidPrefix(input, [answer])).toBe(false)
    for (const spelling of ['carbon dioxide', 'eco-friendly', 'El Nino', 're\u0301sume\u0301']) {
      const expected = normalizeSpelling(spelling)
      const { events, complete } = setup({ ...group, entries: [{ ...group.entries[0], spellings: [expected] }] })
      complete(spelling)
      expect(events[0].result).toBe('first_correct')
    }
  })
})
