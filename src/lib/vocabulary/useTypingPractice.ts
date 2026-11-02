import { nextTick, onBeforeUnmount, onMounted, ref, shallowRef } from 'vue'
import { vocabularyCatalog } from './catalog'
import { TypingSession } from './typing'
import type { TypingOutcome, TypingState } from './typing'
import { learningStore } from './storage'
import { groupById, groupStatistics } from './history'

const CHAPTER_KEY = 'vocabulary_typing_chapter'

export function useTypingPractice(onOutcome: (outcome: TypingOutcome) => void) {
  const history = learningStore()
  const ready = ref(false)
  const mode = ref<'whole' | 'weak'>('whole')
  const notice = ref('')
  let active = true
  const inputElement = ref<HTMLInputElement | null>(null)
  const engine = new TypingSession({
    onChange: updateState,
    onOutcome: (outcome) => {
      if (ready.value)
        history.save(outcome, engine.checkpoint(mode.value))
      onOutcome(outcome)
    },
  })
  const state = shallowRef<TypingState>(engine.state)
  let compositionAttempt: string | null = null

  function updateState(snapshot: TypingState) {
    state.value = snapshot
    if (ready.value)
      history.save(null, engine.checkpoint(mode.value))
  }

  function chooseGroup(topicId: string, number = 1, restart = false) {
    mode.value = 'whole'
    notice.value = ''
    const topic = vocabularyCatalog.find(item => item.id === topicId) ?? vocabularyCatalog[0]
    const group = topic.groups.find(item => item.number === number) ?? topic.groups[0]
    engine.start(group, restart ? 'restarted' : 'exercise_changed')
    try {
      localStorage.setItem(CHAPTER_KEY, topic.id)
    }
    catch {
      // Topic preference is optional; storage denial must not disable the exercise.
    }
  }

  let initialTopic: string | null = null
  try {
    initialTopic = localStorage.getItem(CHAPTER_KEY)
  }
  catch {
    // The exercise works without localStorage (history is out of this stage's scope).
  }
  chooseGroup(initialTopic ?? vocabularyCatalog[0].id)

  function focusInput() {
    if (!ready.value)
      return
    inputElement.value?.focus()
    inputElement.value?.scrollIntoView?.({ block: 'nearest' })
    engine.resume()
  }

  function eventAttempt(event: Event) {
    return (event.target as HTMLInputElement).dataset.attemptId ?? ''
  }

  function handleInput(event: Event) {
    if (eventAttempt(event) !== state.value.attemptId)
      return
    const inputEvent = event as InputEvent
    if (inputEvent.isComposing)
      compositionAttempt ??= eventAttempt(event)
    engine.input((event.target as HTMLInputElement).value, eventAttempt(event), inputEvent.isComposing)
  }

  function compositionStart(event: Event) {
    if (eventAttempt(event) !== state.value.attemptId)
      return
    compositionAttempt = eventAttempt(event)
    engine.compositionStart(compositionAttempt)
  }

  function compositionEnd(event: Event) {
    if (eventAttempt(event) !== state.value.attemptId)
      return
    if (compositionAttempt)
      engine.compositionEnd((event.target as HTMLInputElement).value, compositionAttempt)
    compositionAttempt = null
    // A composition from the previous exercise must not overwrite the new input.
    const target = event.target as HTMLInputElement
    target.value = state.value.input
  }

  function actionAttempt(event?: Event) {
    return (event?.currentTarget as HTMLElement | null)?.dataset.attemptId ?? state.value.attemptId
  }

  function retry(event?: Event) {
    if (!ready.value)
      return
    engine.retry(actionAttempt(event))
    focusInput()
  }

  function skip(event?: Event) {
    if (!ready.value)
      return
    engine.skip(actionAttempt(event))
  }

  function suspend() {
    engine.suspend()
  }

  function visibilityChange() {
    if (document.hidden)
      suspend()
    // Do not summon a virtual keyboard automatically when the app returns.
  }

  onMounted(async () => {
    document.addEventListener('visibilitychange', visibilityChange)
    window.addEventListener('pagehide', suspend)
    await history.ready
    if (!active)
      return
    const params = new URLSearchParams(window.location.hash.split('?')[1] ?? '')
    const requested = groupById.get(params.get('group') ?? '')
    const progress = history.data.value.progress
    if (requested) {
      mode.value = params.get('mode') === 'weak' ? 'weak' : 'whole'
      const words = mode.value === 'weak' ? groupStatistics(history.data.value.events, requested).weakWords : requested.entries
      if (words.length) {
        engine.start({ ...requested, entries: words })
      }
      else {
        engine.start(requested)
        mode.value = 'whole'
        notice.value = '本组暂无薄弱词，已打开整组练习。'
      }
      // Consume this launch request; refreshing must restore the saved session.
      window.history.replaceState(window.history.state, '', `${window.location.pathname}${window.location.search}#/vocabulary/typing`)
    }
    else if (progress) {
      const group = groupById.get(progress.groupId)!
      mode.value = progress.mode
      engine.restore({ ...group, entries: progress.wordIds.map(id => group.entries.find(word => word.wordId === id)!) }, progress)
    }
    ready.value = true
    history.save(null, engine.checkpoint(mode.value))
    await nextTick()
    focusInput()
  })

  onBeforeUnmount(() => {
    active = false
    document.removeEventListener('visibilitychange', visibilityChange)
    window.removeEventListener('pagehide', suspend)
    engine.dispose()
  })

  return { state, inputElement, chooseGroup, focusInput, handleInput, compositionStart, compositionEnd, retry, skip, suspend, history, ready, mode, notice }
}
