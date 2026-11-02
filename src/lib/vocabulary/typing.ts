import type { VocabularyEntry, VocabularyGroup } from './catalog'
import { DATASET_NAMESPACE, DATASET_VERSION } from './catalog'

export type CompletedResult = 'first_correct' | 'corrected' | 'skipped'
export type IncompleteReason = 'exercise_changed' | 'restarted' | 'unmounted'

interface OutcomeBase {
  readonly schemaVersion: 1
  readonly eventId: string
  readonly sessionId: string
  readonly attemptId: string
  readonly datasetNamespace: string
  readonly datasetVersion: string
  readonly wordId: string
  readonly sourceId: number
  readonly topicId: string
  readonly groupId: string
  readonly hadError: boolean
  readonly input: string
  readonly startedAt: string | null
  readonly endedAt: string
  readonly localDate: string
  readonly timezoneOffsetMinutes: number
}

export type TypingOutcome = OutcomeBase & (
  | { readonly result: CompletedResult; readonly completed: true; readonly acceptedSpelling: string | null }
  | { readonly result: 'incomplete'; readonly completed: false; readonly reason: IncompleteReason }
)

export interface TypingState {
  readonly sessionId: string
  readonly attemptId: string
  readonly group: VocabularyGroup | null
  readonly index: number
  readonly currentWord: VocabularyEntry | null
  readonly input: string
  readonly composing: boolean
  readonly hadError: boolean
  readonly pending: boolean
  readonly suspended: boolean
  readonly finished: boolean
  readonly counts: Readonly<Record<CompletedResult, number>>
}

interface SessionOptions {
  onChange?: (state: TypingState) => void
  onOutcome?: (outcome: TypingOutcome) => void
  now?: () => number
  newSessionId?: () => string
  schedule?: (callback: () => void, delay: number) => unknown
  cancel?: (handle: unknown) => void
}

export interface PracticeCheckpoint {
  sessionId: string
  groupId: string
  wordIds: string[]
  mode: 'whole' | 'weak'
  index: number
  input: string
  hadError: boolean
  touched: boolean
  startedAt: number | null
  counts: Record<CompletedResult, number>
  savedAt: string
}

// Canonical Unicode equivalence and typographic SPACE variants only.
// Case, accents, hyphens, repeated/leading/trailing spaces and U+200B are meaningful.
export function normalizeSpelling(value: string): string {
  return value.normalize('NFC').replace(/[\u00A0\u2000-\u200A\u202F\u205F\u3000]/g, ' ')
}

function acceptedSpelling(input: string, spellings: readonly string[]) {
  return spellings.find(spelling => normalizeSpelling(spelling) === normalizeSpelling(input))
}

export function isValidPrefix(input: string, spellings: readonly string[]): boolean {
  return spellings.some(spelling => normalizeSpelling(spelling).startsWith(normalizeSpelling(input)))
}

export interface FeedbackCharacter {
  readonly value: string
  readonly status: 'correct' | 'error' | 'pending' | 'composing'
}

export function characterFeedback(input: string, spellings: readonly string[], composing = false): FeedbackCharacter[] {
  const value = normalizeSpelling(input)
  // Prefer an alias that accepts the whole prefix. Otherwise use the longest shared prefix.
  const sharedPrefix = (answer: string) => {
    let length = 0
    while (length < value.length && value[length] === answer[length])
      length++
    return length
  }
  const answers = spellings.map(normalizeSpelling)
  const target = answers.find(answer => answer.startsWith(value))
    ?? [...answers].sort((a, b) => sharedPrefix(b) - sharedPrefix(a))[0]
    ?? ''
  const typed = Array.from(value)
  const expected = Array.from(target)
  return Array.from({ length: Math.max(typed.length, expected.length) }, (_, index) => ({
    value: typed[index] ?? expected[index],
    status: composing ? 'composing' : typed[index] === undefined ? 'pending' : typed[index] === expected[index] ? 'correct' : 'error',
  }))
}

let fallbackSession = 0

/** One in-memory exercise. No history persistence or statistical accuracy is implemented here. */
export class TypingSession {
  private group: VocabularyGroup | null = null
  private sessionId = ''
  private index = 0
  private inputValue = ''
  private committedValue = ''
  private composing = false
  private hadError = false
  private touched = false
  private startedAt: number | null = null
  private suspended = false
  private disposed = false
  private generation = 0
  private timer: unknown = null
  private counts: Record<CompletedResult, number> = { first_correct: 0, corrected: 0, skipped: 0 }
  private readonly now: () => number
  private readonly schedule: NonNullable<SessionOptions['schedule']>
  private readonly cancel: NonNullable<SessionOptions['cancel']>

  constructor(private readonly options: SessionOptions = {}) {
    this.now = options.now ?? Date.now
    this.schedule = options.schedule ?? ((callback, delay) => setTimeout(callback, delay))
    this.cancel = options.cancel ?? (handle => clearTimeout(handle as ReturnType<typeof setTimeout>))
  }

  get state(): TypingState {
    return {
      sessionId: this.sessionId,
      attemptId: `${this.sessionId}:${this.index}`,
      group: this.group,
      index: this.index,
      currentWord: this.group?.entries[this.index] ?? null,
      input: this.inputValue,
      composing: this.composing,
      hadError: this.hadError,
      pending: this.timer !== null,
      suspended: this.suspended,
      finished: this.group !== null && this.index >= this.group.entries.length,
      counts: { ...this.counts },
    }
  }

  checkpoint(mode: 'whole' | 'weak' = 'whole'): PracticeCheckpoint | null {
    if (!this.group)
      return null
    return {
      sessionId: this.sessionId,
      groupId: this.group.id,
      wordIds: this.group.entries.map(word => word.wordId),
      mode,
      index: this.index,
      input: this.committedValue,
      hadError: this.hadError,
      touched: this.touched,
      startedAt: this.startedAt,
      counts: { ...this.counts },
      savedAt: new Date(this.now()).toISOString(),
    }
  }

  restore(group: VocabularyGroup, checkpoint: PracticeCheckpoint) {
    if (this.disposed)
      return
    this.cancelTransition()
    this.group = group
    this.sessionId = checkpoint.sessionId
    this.index = checkpoint.index
    this.resetWord()
    this.inputValue = checkpoint.input
    this.committedValue = checkpoint.input
    this.hadError = checkpoint.hadError
    this.touched = checkpoint.touched
    this.startedAt = checkpoint.startedAt
    this.counts = { ...checkpoint.counts }
    this.suspended = true
    this.publish()
  }

  start(group: VocabularyGroup, reason: IncompleteReason = 'exercise_changed') {
    if (this.disposed)
      return
    this.abandon(reason)
    this.group = group
    this.sessionId = this.options.newSessionId?.()
      ?? globalThis.crypto?.randomUUID?.()
      ?? `${this.now()}-${++fallbackSession}`
    this.index = 0
    this.counts = { first_correct: 0, corrected: 0, skipped: 0 }
    this.resetWord()
    this.publish()
  }

  input(value: string, attemptId: string, isComposing = false) {
    if (!this.isCurrent(attemptId))
      return
    this.cancelTransition()
    this.inputValue = value
    this.suspended = false
    if (value.length > 0) {
      this.touched = true
      this.startedAt ??= this.now()
    }
    if (isComposing)
      this.composing = true
    if (!this.composing) {
      this.committedValue = value
      if (!isValidPrefix(value, this.state.currentWord!.spellings))
        this.hadError = true
      this.scheduleCompletion()
    }
    this.publish()
  }

  compositionStart(attemptId: string) {
    if (!this.isCurrent(attemptId))
      return
    this.cancelTransition()
    this.composing = true
    this.publish()
  }

  compositionEnd(value: string, attemptId: string) {
    if (!this.isCurrent(attemptId) || !this.composing)
      return
    this.composing = false
    this.input(value, attemptId)
  }

  retry(attemptId: string) {
    if (!this.isCurrent(attemptId))
      return
    this.cancelTransition()
    this.inputValue = ''
    this.committedValue = ''
    this.composing = false
    this.suspended = false
    // Keep hadError and startedAt: retrying this same word is not a new independent attempt.
    this.publish()
  }

  skip(attemptId: string) {
    if (this.isCurrent(attemptId))
      this.complete('skipped')
  }

  suspend() {
    this.cancelTransition()
    if (this.composing) {
      this.inputValue = this.committedValue
      this.composing = false
    }
    this.suspended = true
    this.publish()
  }

  resume() {
    if (this.disposed)
      return
    this.suspended = false
    this.scheduleCompletion()
    this.publish()
  }

  dispose() {
    if (this.disposed)
      return
    this.abandon('unmounted')
    this.disposed = true
  }

  private isCurrent(attemptId: string) {
    return !this.disposed && !!this.state.currentWord && this.state.attemptId === attemptId
  }

  private cancelTransition() {
    this.generation++
    if (this.timer !== null)
      this.cancel(this.timer)
    this.timer = null
  }

  private scheduleCompletion() {
    const word = this.state.currentWord
    if (!word || this.composing || this.suspended || this.timer !== null || acceptedSpelling(this.inputValue, word.spellings) === undefined)
      return
    const generation = this.generation
    const attemptId = this.state.attemptId
    this.timer = this.schedule(() => {
      if (generation !== this.generation || !this.isCurrent(attemptId) || this.composing || this.suspended)
        return
      if (acceptedSpelling(this.inputValue, word.spellings) !== undefined)
        this.complete(this.hadError ? 'corrected' : 'first_correct')
    }, 200)
  }

  private outcomeBase(): OutcomeBase {
    const state = this.state
    const ended = new Date(this.now())
    const localDate = [ended.getFullYear(), String(ended.getMonth() + 1).padStart(2, '0'), String(ended.getDate()).padStart(2, '0')].join('-')
    return {
      schemaVersion: 1,
      eventId: state.attemptId,
      sessionId: this.sessionId,
      attemptId: state.attemptId,
      datasetNamespace: DATASET_NAMESPACE,
      datasetVersion: DATASET_VERSION,
      wordId: state.currentWord!.wordId,
      sourceId: state.currentWord!.sourceId,
      topicId: state.currentWord!.topicId,
      groupId: this.group!.id,
      hadError: this.hadError,
      input: this.inputValue,
      startedAt: this.startedAt === null ? null : new Date(this.startedAt).toISOString(),
      endedAt: ended.toISOString(),
      localDate,
      timezoneOffsetMinutes: ended.getTimezoneOffset(),
    }
  }

  private complete(result: CompletedResult) {
    const outcome: TypingOutcome = {
      ...this.outcomeBase(),
      result,
      completed: true,
      acceptedSpelling: result === 'skipped' ? null : acceptedSpelling(this.inputValue, this.state.currentWord!.spellings)!,
    }
    this.cancelTransition()
    this.counts[result]++
    this.index++
    this.resetWord()
    this.options.onOutcome?.(Object.freeze(outcome))
    this.publish()
  }

  private abandon(reason: IncompleteReason) {
    this.cancelTransition()
    if (this.state.currentWord && this.touched)
      this.options.onOutcome?.(Object.freeze({ ...this.outcomeBase(), result: 'incomplete', completed: false, reason }))
  }

  private resetWord() {
    this.inputValue = ''
    this.committedValue = ''
    this.composing = false
    this.hadError = false
    this.touched = false
    this.startedAt = null
    this.suspended = false
  }

  private publish() {
    this.options.onChange?.(this.state)
  }
}
