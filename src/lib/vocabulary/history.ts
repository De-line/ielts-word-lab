import { DATASET_NAMESPACE, DATASET_VERSION, vocabularyCatalog } from './catalog'
import type { VocabularyGroup } from './catalog'
import type { PracticeCheckpoint, TypingOutcome } from './typing'

export const HISTORY_FORMAT = 1
export const groups = vocabularyCatalog.flatMap(topic => [...topic.groups])
export const groupById = new Map(groups.map(group => [group.id, group]))
const entries = new Map(vocabularyCatalog.flatMap(topic => topic.entries.map(word => [word.wordId, word] as const)))
export type LearningEvent = Pick<TypingOutcome, 'eventId' | 'sessionId' | 'attemptId' | 'datasetNamespace' | 'datasetVersion' | 'wordId' | 'sourceId' | 'topicId' | 'groupId' | 'endedAt' | 'localDate' | 'timezoneOffsetMinutes'> & { result: 'first_correct' | 'corrected' | 'skipped' }
export interface LearningData { events: LearningEvent[]; progress: PracticeCheckpoint | null }
export interface Backup extends LearningData { formatVersion: 1; datasetNamespace: string; datasetVersion: string; exportedAt: string }
export const emptyData = (): LearningData => ({ events: [], progress: null })
export function learningEvent(outcome: TypingOutcome): LearningEvent | null {
  if (!outcome.completed)
    return null
  const { eventId, sessionId, attemptId, datasetNamespace, datasetVersion, wordId, sourceId, topicId, groupId, endedAt, localDate, timezoneOffsetMinutes, result } = outcome
  return { eventId, sessionId, attemptId, datasetNamespace, datasetVersion, wordId, sourceId, topicId, groupId, endedAt, localDate, timezoneOffsetMinutes, result }
}

const eventIndexes = new WeakMap<readonly LearningEvent[], { length: number; index: Map<string, LearningEvent[]> }>()
function indexEvents(events: readonly LearningEvent[]) {
  const cached = eventIndexes.get(events)
  let index = cached?.length === events.length ? cached.index : undefined
  if (!index) {
    index = new Map()
    for (const event of events) {
      const values = index.get(event.wordId) ?? []
      values.push(event)
      index.set(event.wordId, values)
    }
    eventIndexes.set(events, { length: events.length, index })
  }
  return index
}
export function dailyResults(events: readonly LearningEvent[], wordId: string) {
  const dates = new Map<string, LearningEvent>()
  // Append order is the observed completion order, even if the device clock moves back.
  for (const event of indexEvents(events).get(wordId) ?? []) {
    if (!dates.has(event.localDate))
      dates.set(event.localDate, event)
  }
  return [...dates.values()].sort((a, b) => b.localDate.localeCompare(a.localDate))
}
export function wordStatistics(events: readonly LearningEvent[], wordId: string) {
  const days = dailyResults(events, wordId).slice(0, 3)
  const weights = [0.5, 0.3, 0.2]
  const denominator = days.reduce((sum, _, i) => sum + weights[i], 0)
  const accuracy = days.length ? days.reduce((sum, day, i) => sum + (day.result === 'first_correct' ? weights[i] : 0), 0) / denominator : null
  const recovered = days.length >= 2 && days.slice(0, 2).every(day => day.result === 'first_correct')
  return { days, accuracy, weak: accuracy !== null && !recovered && (days[0].result !== 'first_correct' || accuracy < 0.8) }
}
export function groupStatistics(events: readonly LearningEvent[], group: VocabularyGroup) {
  const words = group.entries.map(word => ({ word, ...wordStatistics(events, word.wordId) }))
  const covered = words.filter(word => word.accuracy !== null).length
  const index = indexEvents(events)
  const relevant = group.entries.flatMap(word => index.get(word.wordId) ?? [])
  const lastPractice = relevant.reduce((latest, event) => event.endedAt > latest ? event.endedAt : latest, '')
  return {
    group,
    covered,
    total: words.length,
    status: covered === 0 ? 'not_started' : covered === words.length ? 'completed' : 'in_progress',
    accuracy: covered === words.length ? words.reduce((sum, word) => sum + word.accuracy!, 0) / words.length : null,
    weakWords: words.filter(word => word.weak).map(word => word.word),
    lastPractice,
  }
}
export function recommendations(events: readonly LearningEvent[]) {
  return groups.map((group, order) => ({ ...groupStatistics(events, group), order }))
    .filter(item => item.accuracy !== null && item.accuracy < 0.8)
    .sort((a, b) => a.accuracy! - b.accuracy! || a.lastPractice.localeCompare(b.lastPractice) || a.order - b.order)
    .slice(0, 10)
}

function check(condition: unknown, message: string): asserts condition {
  if (!condition)
    throw new Error(message)
}
function object(value: unknown): asserts value is Record<string, any> {
  check(value !== null && typeof value === 'object' && !Array.isArray(value), '数据结构无效')
}
const validText = (value: unknown): value is string => typeof value === 'string' && value.length > 0 && value.length <= 300
const validISO = (value: unknown): value is string => typeof value === 'string' && Number.isFinite(Date.parse(value)) && new Date(value).toISOString() === value
export function validateProgress(value: unknown): PracticeCheckpoint | null {
  if (value === null)
    return null
  object(value)
  const group = groupById.get(value.groupId)
  check(group && validText(value.sessionId) && ['whole', 'weak'].includes(value.mode), '练习位置或会话无效')
  check(Array.isArray(value.wordIds) && value.wordIds.length > 0 && value.wordIds.length <= group.entries.length, '练习词列表无效')
  const allowed = group.entries.map(word => word.wordId)
  check(value.wordIds.every((id: unknown, i: number) => typeof id === 'string' && allowed.includes(id) && (i === 0 || allowed.indexOf(value.wordIds[i - 1]) < allowed.indexOf(id))), '练习词身份或顺序无效')
  check(value.mode !== 'whole' || JSON.stringify(value.wordIds) === JSON.stringify(allowed), '整组词列表不完整')
  check(Number.isInteger(value.index) && value.index >= 0 && value.index <= value.wordIds.length, '练习索引无效')
  check(typeof value.input === 'string' && value.input.length <= 10000 && typeof value.hadError === 'boolean' && typeof value.touched === 'boolean', '输入草稿无效')
  check(value.startedAt === null || (typeof value.startedAt === 'number' && Number.isFinite(value.startedAt) && Number.isFinite(new Date(value.startedAt).getTime())), '开始时间无效')
  check(validISO(value.savedAt), '保存时间无效')
  object(value.counts)
  const counts = ['first_correct', 'corrected', 'skipped'].map(key => value.counts[key])
  check(counts.every(n => Number.isInteger(n) && n >= 0) && counts.reduce((a, b) => a + b, 0) === value.index, '练习计数无效')
  return JSON.parse(JSON.stringify(value)) as PracticeCheckpoint
}
export function validateBackup(value: unknown): Backup {
  object(value)
  check(value.formatVersion === HISTORY_FORMAT, '不支持的数据格式版本')
  check(value.datasetNamespace === DATASET_NAMESPACE && value.datasetVersion === DATASET_VERSION, '词库身份或版本不匹配；需要显式迁移，不能直接导入')
  check(validISO(value.exportedAt) && Array.isArray(value.events), '导出时间或事件列表无效')
  const ids = new Set<string>()
  for (const event of value.events) {
    object(event)
    const entry = entries.get(event.wordId)
    const group = groupById.get(event.groupId)
    check(entry && group?.entries.some(word => word.wordId === entry.wordId), '记录包含未知单词或组')
    check(event.datasetNamespace === DATASET_NAMESPACE && event.datasetVersion === DATASET_VERSION && event.topicId === entry.topicId && event.sourceId === entry.sourceId, '事件词库身份不匹配')
    check(validText(event.eventId) && validText(event.sessionId) && event.attemptId === event.eventId && event.eventId.startsWith(`${event.sessionId}:`) && !ids.has(event.eventId), '事件身份重复或无效')
    ids.add(event.eventId)
    check(['first_correct', 'corrected', 'skipped'].includes(event.result) && validISO(event.endedAt), '事件结果或时间无效')
    check(Number.isInteger(event.timezoneOffsetMinutes) && Math.abs(event.timezoneOffsetMinutes) <= 840, '时区无效')
    const date = new Date(Date.parse(event.endedAt) - event.timezoneOffsetMinutes * 60000).toISOString().slice(0, 10)
    check(event.localDate === date, '本地日期与时间/时区不符')
  }
  const progress = validateProgress(value.progress)
  return { formatVersion: 1, datasetNamespace: DATASET_NAMESPACE, datasetVersion: DATASET_VERSION, exportedAt: value.exportedAt, events: JSON.parse(JSON.stringify(value.events)), progress }
}
export function backupOf(data: LearningData): Backup {
  return { formatVersion: 1, datasetNamespace: DATASET_NAMESPACE, datasetVersion: DATASET_VERSION, exportedAt: new Date().toISOString(), events: data.events, progress: data.progress }
}
