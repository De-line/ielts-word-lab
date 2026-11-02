import { describe, expect, it } from 'vitest'
import { DATASET_NAMESPACE, DATASET_VERSION } from '../../src/lib/vocabulary/catalog'
import { backupOf, dailyResults, emptyData, groupStatistics, groups, learningEvent, recommendations, validateBackup, wordStatistics } from '../../src/lib/vocabulary/history'
import type { LearningData, LearningEvent } from '../../src/lib/vocabulary/history'
import { LearningStore } from '../../src/lib/vocabulary/storage'
import type { HistoryDriver } from '../../src/lib/vocabulary/storage'
import { TypingSession } from '../../src/lib/vocabulary/typing'
import type { TypingOutcome } from '../../src/lib/vocabulary/typing'

let sequence = 0
function event(day: string, result: LearningEvent['result'], group = groups[0], index = 0): LearningEvent {
  const word = group.entries[index]
  const sessionId = `test-${++sequence}`
  return { eventId: `${sessionId}:0`, attemptId: `${sessionId}:0`, sessionId, datasetNamespace: DATASET_NAMESPACE, datasetVersion: DATASET_VERSION, wordId: word.wordId, sourceId: word.sourceId, topicId: word.topicId, groupId: group.id, endedAt: `${day}T10:00:00.000Z`, localDate: day, timezoneOffsetMinutes: 0, result }
}
const completed = (e: LearningEvent) => ({ ...e, schemaVersion: 1, completed: true, hadError: false, input: '', startedAt: null, acceptedSpelling: null }) as TypingOutcome
class Driver implements HistoryDriver {
  data: LearningData = emptyData()
  fail = false
  batches: number[] = []
  read = async () => this.data
  write = async (batch: readonly LearningEvent[], progress: LearningData['progress']) => {
    this.batches.push(batch.length)
    if (this.fail)
      throw new Error('QuotaExceededError')
    const ids = new Set(this.data.events.map(event => event.eventId))
    this.data = { events: [...this.data.events, ...batch.filter(event => !ids.has(event.eventId))], progress }
  }

  replace = async (data: LearningData) => {
    if (this.fail)
      throw new Error('transaction aborted')
    this.data = structuredClone(data)
  }
}

describe('daily learning calculations', () => {
  it('TC-HIS-001/002 first effective completion per local day wins, raw same-day attempts survive', () => {
    const events = [event('2026-10-28', 'corrected'), event('2026-10-28', 'first_correct'), event('2026-10-28', 'skipped')]
    expect(events).toHaveLength(3)
    expect(dailyResults(events, events[0].wordId)).toHaveLength(1)
    expect(wordStatistics(events, events[0].wordId).accuracy).toBe(0)
    const incomplete = { ...completed(events[0]), completed: false, result: 'incomplete', reason: 'unmounted' } as TypingOutcome
    expect(learningEvent(incomplete)).toBeNull()
  })

  it('TC-STAT-001 wrong/wrong/correct is 50%, uses latest three distinct dates regardless of append clock order', () => {
    const events = [event('2026-10-25', 'first_correct'), event('2026-10-26', 'corrected'), event('2026-10-28', 'first_correct'), event('2026-10-27', 'skipped')]
    expect(wordStatistics(events, events[0].wordId).accuracy).toBe(0.5)
  })

  it('TC-STAT-002 normalizes one day and two days', () => {
    const events = [event('2026-10-28', 'corrected'), event('2026-10-29', 'first_correct')]
    expect(wordStatistics(events.slice(1), events[0].wordId).accuracy).toBe(1)
    expect(wordStatistics(events, events[0].wordId).accuracy).toBe(0.625)
    expect(wordStatistics([], events[0].wordId).accuracy).toBeNull()
  })

  it('TC-WEAK-001 entry and two distinct correct dates exit take precedence; same-day repeats cannot exit', () => {
    const events = [event('2026-10-27', 'skipped'), event('2026-10-28', 'first_correct')]
    expect(wordStatistics(events, events[0].wordId).weak).toBe(true)
    events.push(event('2026-10-28', 'first_correct'))
    expect(wordStatistics(events, events[0].wordId).weak).toBe(true)
    events.push(event('2026-10-29', 'first_correct'))
    expect(wordStatistics(events, events[0].wordId).weak).toBe(false)
    events.push(event('2026-10-30', 'corrected'))
    expect(wordStatistics(events, events[0].wordId).weak).toBe(true)
  })

  it('TC-GSTAT-001 incomplete coverage has no official accuracy; partial reviews keep full denominator', () => {
    const group = groups[0]
    const events = group.entries.map((_, index) => event('2026-10-28', index === 0 ? 'skipped' : 'first_correct', group, index))
    expect(groupStatistics(events.slice(1), group)).toMatchObject({ covered: 19, total: 20, accuracy: null, status: 'in_progress' })
    expect(groupStatistics(events, group).accuracy).toBeCloseTo(0.95)
    events.push(event('2026-10-29', 'first_correct', group))
    expect(groupStatistics(events, group).accuracy).toBeCloseTo((19 + 0.625) / 20)
    expect(recommendations(events)).toHaveLength(0)
  })

  it('TC-REC-001 low rate, oldest practice, catalog order and top ten; never fills with ineligible groups', () => {
    const events = groups.slice(0, 12).flatMap((group, i) => group.entries.map((_, n) => event(i === 1 ? '2026-10-27' : '2026-10-28', 'skipped', group, n)))
    const result = recommendations(events)
    expect(result).toHaveLength(10)
    expect(result[0].group.id).toBe(groups[1].id)
    expect(result[1].group.id).toBe(groups[0].id)
    expect(recommendations(events.filter(e => e.groupId === groups[0].id))).toHaveLength(1)
    expect(recommendations([events[0]])).toHaveLength(0)
  })

  it('TC-DATE-001 local dates validated against captured offset; device clock rollback keeps first appended result', () => {
    const first = { ...event('2026-10-29', 'skipped'), endedAt: '2026-10-28T16:10:00.000Z', timezoneOffsetMinutes: -480 }
    expect(validateBackup(backupOf({ events: [first], progress: null })).events[0].localDate).toBe('2026-10-29')
    expect(() => validateBackup(backupOf({ events: [{ ...first, localDate: '2026-10-28' }], progress: null }))).toThrow()
    expect(wordStatistics([first, { ...event('2026-10-29', 'first_correct'), endedAt: '2026-10-29T01:00:00.000Z' }], first.wordId).accuracy).toBe(0)
  })
})

describe('persistence, restore and backups', () => {
  it('TC-HIS-003 deduplicates event identity and preserves same-day independent attempts', async () => {
    const driver = new Driver()
    const store = new LearningStore(driver)
    await store.ready
    const first = completed(event('2026-10-28', 'skipped'))
    store.save(first, null)
    store.save(first, null)
    store.save(completed(event('2026-10-28', 'first_correct')), null)
    await store.settled()
    expect(driver.data.events).toHaveLength(2)
    expect(store.data.value.events).toHaveLength(2)
    expect(wordStatistics(driver.data.events, first.wordId).accuracy).toBe(0)
  })

  it('TC-SAVE-001 resume preserves corrected identity, draft and counts, excludes uncommitted composition', () => {
    const outcomes: TypingOutcome[] = []
    const session = new TypingSession({ onOutcome: item => outcomes.push(item), newSessionId: () => 'restore-test' })
    session.start(groups[0])
    session.input('wrong', session.state.attemptId)
    session.retry(session.state.attemptId)
    session.input('atmos', session.state.attemptId)
    session.compositionStart(session.state.attemptId)
    session.input('atmos暂态', session.state.attemptId, true)
    const checkpoint = session.checkpoint()!
    expect(checkpoint.input).toBe('atmos')
    session.dispose()
    const restored = new TypingSession({ onOutcome: item => outcomes.push(item) })
    restored.restore(groups[0], checkpoint)
    expect(restored.state).toMatchObject({ sessionId: 'restore-test', input: 'atmos', hadError: true, suspended: true })
    restored.skip(restored.state.attemptId)
    expect(outcomes.filter(item => item.completed)).toHaveLength(1)
    expect(outcomes.at(-1)?.eventId).toBe(`${checkpoint.sessionId}:0`)
    expect(restored.checkpoint()?.counts.skipped).toBe(1)
    restored.dispose()
  })

  it('TC-SAVE-002 storage errors remain visible, unsaved history is exportable and later saves retry it', async () => {
    const driver = new Driver()
    const store = new LearningStore(driver)
    await store.ready
    driver.fail = true
    store.save(completed(event('2026-10-28', 'skipped')), null)
    await store.settled()
    expect(store.error.value).toContain('尚未保存')
    expect((await store.exportData()).events).toHaveLength(1)
    expect(driver.data.events).toHaveLength(0)
    driver.fail = false
    store.save(completed(event('2026-10-29', 'first_correct')), null)
    await store.settled()
    expect(driver.data.events).toHaveLength(2)
    expect(store.error.value).toBe('')
    expect(driver.batches).toEqual([1, 2])
  })

  it('TC-SAVE-002 read denial protects existing storage and exercise remains usable in memory', async () => {
    const driver = new Driver()
    driver.read = async () => {
      throw new Error('SecurityError')
    }
    const store = new LearningStore(driver)
    await store.ready
    store.save(completed(event('2026-10-28', 'skipped')), null)
    expect(store.error.value).toContain('不覆盖已有存储')
    expect((await store.exportData()).events).toHaveLength(1)
    await expect(store.replace(backupOf(emptyData()))).rejects.toThrow('不可用')
    expect(driver.data.events).toHaveLength(0)
  })

  it('TC-JSON-001/002 export roundtrip, malformed/duplicate/unknown identity/version reject without changes', async () => {
    const driver = new Driver()
    const store = new LearningStore(driver)
    await store.ready
    store.save(completed(event('2026-10-28', 'skipped')), null)
    const backup = await store.exportData()
    expect(validateBackup(JSON.parse(JSON.stringify(backup)))).toEqual(backup)
    for (const invalid of [null, {}, { ...backup, formatVersion: 2 }, { ...backup, datasetVersion: 'next' }, { ...backup, events: [backup.events[0], backup.events[0]] }, { ...backup, events: [{ ...backup.events[0], wordId: 'unknown' }] }, { ...backup, progress: {} }]) {
      await expect(store.replace(invalid)).rejects.toThrow()
      expect(driver.data.events).toEqual(backup.events)
    }
  })

  it('TC-JSON-003 failed replacement rolls back, successful replacement switches memory only after commit', async () => {
    const driver = new Driver()
    const store = new LearningStore(driver)
    await store.ready
    store.save(completed(event('2026-10-28', 'skipped')), null)
    const original = await store.exportData()
    driver.fail = true
    await expect(store.replace(backupOf(emptyData()))).rejects.toThrow()
    expect(store.data.value.events).toEqual(original.events)
    expect(driver.data.events).toEqual(original.events)
    driver.fail = false
    await store.replace(backupOf(emptyData()))
    expect(store.data.value.events).toHaveLength(0)
  })

  it('TC-SAVE-003 new store instance reads records under unchanged schema/dataset after an ordinary update', async () => {
    const driver = new Driver()
    const old = new LearningStore(driver)
    await old.ready
    old.save(completed(event('2026-10-28', 'first_correct')), null)
    await old.settled()
    const updated = new LearningStore(driver)
    await updated.ready
    expect(updated.data.value.events).toEqual(old.data.value.events)
  })
})
