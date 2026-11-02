<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { vocabularyCatalog } from '../../lib/vocabulary/catalog'
import { characterFeedback } from '../../lib/vocabulary/typing'
import type { TypingOutcome } from '../../lib/vocabulary/typing'
import { useTypingPractice } from '../../lib/vocabulary/useTypingPractice'

const emit = defineEmits<{ (event: 'outcome', outcome: TypingOutcome): void }>()
const { state, inputElement, chooseGroup, focusInput, handleInput, compositionStart, compositionEnd, retry, skip, suspend, history, ready, mode, notice } = useTypingPractice(outcome => emit('outcome', outcome))
const topic = computed(() => vocabularyCatalog.find(item => item.id === state.value.group?.topicId)!)
const feedback = computed(() => characterFeedback(state.value.input, state.value.currentWord?.spellings ?? [], state.value.composing))
const hasVisibleError = computed(() => feedback.value.some(char => char.status === 'error'))
const audioMessage = ref('')
let audio: HTMLAudioElement | null = null
let audioGeneration = 0
let audioTimer: ReturnType<typeof setTimeout> | null = null
let active = true

function stopAudio() {
  audioGeneration++
  if (audioTimer !== null)
    clearTimeout(audioTimer)
  audioTimer = null
  if (audio) {
    audio.onerror = null
    audio.onplaying = null
    audio.onwaiting = null
    audio.onstalled = null
    audio.pause()
    audio = null
  }
}

async function playAudio() {
  stopAudio()
  audioMessage.value = ''
  const word = state.value.currentWord
  if (!word)
    return
  const generation = audioGeneration
  const player = document.createElement('audio')
  audio = player
  const failed = () => {
    if (generation !== audioGeneration)
      return
    if (audioTimer !== null)
      clearTimeout(audioTimer)
    audioTimer = null
    audioMessage.value = '音频暂不可用，可继续输入或点击重播。'
  }
  player.onerror = failed
  const waiting = () => {
    if (generation !== audioGeneration || audioTimer !== null)
      return
    audioTimer = setTimeout(() => {
      audioTimer = null
      if (generation === audioGeneration)
        audioMessage.value = '音频加载超时，可继续输入或点击重播。'
    }, 8000)
  }
  player.onwaiting = waiting
  player.onstalled = waiting
  player.onplaying = () => {
    if (generation !== audioGeneration)
      return
    if (audioTimer !== null)
      clearTimeout(audioTimer)
    audioTimer = null
    audioMessage.value = ''
  }
  player.src = word.audioPath
  waiting()
  try {
    await player.play()
  }
  catch {
    failed()
  }
}

watch(() => state.value.attemptId, async () => {
  await nextTick()
  if (!active)
    return
  if (!state.value.finished)
    focusInput()
  await playAudio()
})
onMounted(playAudio)
onBeforeUnmount(() => {
  active = false
  stopAudio()
})

function selectTopic(event: Event) {
  chooseGroup((event.target as HTMLSelectElement).value)
}
function selectGroup(event: Event) {
  chooseGroup(topic.value.id, Number((event.target as HTMLSelectElement).value))
}
</script>

<template>
  <main class="practice mx-auto max-w-3xl px-4 py-6 sm:px-6">
    <h1 class="mb-2 text-2xl font-bold sm:text-3xl">
      单词打字练习
    </h1>
    <p class="mb-5 text-sm text-gray-500 dark:text-gray-400">
      逐字反馈，正确后自动进入下一词；可以随时修改、重试或跳过。
    </p>

    <router-link to="/vocabulary/records" class="mb-4 inline-block text-blue-600 underline">
      学习记录与备份
    </router-link>
    <p v-if="!ready" role="status">
      正在读取本机练习记录…
    </p>
    <p v-if="history.error.value" class="mb-3 text-amber-700" role="alert">
      {{ history.error.value }}
    </p>
    <p v-if="notice" class="mb-3" role="status">
      {{ notice }}
    </p>
    <p v-if="mode === 'weak'" class="mb-3">
      只复习薄弱词；成绩与整组练习共用，组统计仍按原组全部单词计算。
    </p>

    <div class="grid mb-5 gap-3 sm:grid-cols-2">
      <label class="block text-sm font-medium">
        主题
        <select :value="topic.id" :disabled="!ready" class="practice-control mt-1" data-testid="topic-select" @change="selectTopic">
          <option v-for="item in vocabularyCatalog" :key="item.id" :value="item.id">{{ item.label }}</option>
        </select>
      </label>
      <label class="block text-sm font-medium">
        分组（每组 20 词）
        <select :value="state.group?.number" :disabled="!ready" class="practice-control mt-1" data-testid="group-select" @change="selectGroup">
          <option v-for="group in topic.groups" :key="group.id" :value="group.number">第 {{ group.number }} 组 · {{ group.entries.length }} 词</option>
        </select>
      </label>
    </div>

    <p class="mb-4 text-sm" data-testid="group-progress" aria-live="polite">
      {{ topic.label }} · 第 {{ state.group?.number }} / {{ topic.groups.length }} 组
      · 已练 {{ state.index }} / {{ state.group?.entries.length }} 词
    </p>

    <section v-if="state.currentWord" class="practice-card border border-gray-200 rounded-xl bg-white p-4 shadow-sm dark:border-gray-700 dark:bg-gray-800 sm:p-6">
      <div class="mb-3 flex items-center justify-between gap-3">
        <p class="text-sm text-gray-500 dark:text-gray-400">
          本组第 {{ state.index + 1 }} 词
        </p>
        <button type="button" class="practice-button" @click="playAudio">
          重播发音
        </button>
      </div>

      <p v-if="audioMessage" class="mb-3 text-sm text-amber-700 dark:text-amber-400" role="status" data-testid="audio-status">
        {{ audioMessage }}
      </p>

      <p class="mb-2 break-words text-lg font-medium" data-testid="accepted-spellings">
        {{ state.currentWord.spellings.join(' / ') }}
      </p>
      <div class="character-feedback mb-5 text-3xl font-mono" data-testid="typing-feedback" aria-hidden="true">
        <span v-for="(char, index) in feedback" :key="index" :data-status="char.status" :class="`character-${char.status}`">{{ char.value === ' ' ? '␣' : char.value }}</span>
      </div>

      <label for="typing-input" class="mb-1 block text-sm font-medium">输入单词或词组</label>
      <input
        id="typing-input"
        :key="state.sessionId"
        ref="inputElement"
        :value="state.input"
        :disabled="!ready"
        :data-attempt-id="state.attemptId"
        type="text"
        inputmode="text"
        class="practice-control font-mono"
        :class="{ 'input-error': hasVisibleError }"
        data-testid="typing-input"
        autocapitalize="off"
        autocorrect="off"
        autocomplete="off"
        :spellcheck="false"
        :aria-invalid="hasVisibleError"
        aria-describedby="typing-status"
        @input="handleInput"
        @compositionstart="compositionStart"
        @compositionend="compositionEnd"
        @blur="suspend"
        @focus="focusInput"
      >
      <p id="typing-status" class="mt-2 min-h-7 text-sm" role="status">
        <template v-if="state.composing">
          输入法组合中，确认候选词后再检查。
        </template>
        <template v-else-if="state.suspended">
          已暂停自动跳词，点击“继续输入”恢复。
        </template>
        <template v-else-if="state.pending">
          正确，正在进入下一词…
        </template>
        <template v-else-if="hasVisibleError">
          请修改红色字符，包括末尾多余字符。
        </template>
        <template v-else>
          空格、大小写、连字符和重音按原词拼写；␣ 表示空格。
        </template>
      </p>
      <p v-if="state.hadError" class="mt-1 text-sm text-amber-700 dark:text-amber-400">
        本词曾有输入错误，改对后记为“修正正确”。
      </p>

      <div class="my-4 flex flex-wrap gap-2">
        <button type="button" class="practice-button primary-button" @click="focusInput">
          继续输入
        </button>
        <button type="button" class="practice-button" data-testid="retry-word" :data-attempt-id="state.attemptId" @click="retry">
          重试本词
        </button>
        <button type="button" class="practice-button" data-testid="skip-word" :data-attempt-id="state.attemptId" @click="skip">
          跳过本词
        </button>
      </div>

      <div class="border-t border-gray-200 pt-4 dark:border-gray-700">
        <p><span class="mr-2 text-sm italic text-gray-500">{{ state.currentWord.pos }}</span>{{ state.currentWord.meaning }}</p>
        <p class="mt-2 break-words text-sm italic text-gray-500 dark:text-gray-400">
          {{ state.currentWord.example }}
        </p>
      </div>
    </section>

    <section v-else-if="state.finished" class="practice-card border border-gray-200 rounded-xl bg-white p-5 dark:border-gray-700 dark:bg-gray-800" data-testid="group-finished">
      <h2 class="text-xl font-bold">
        {{ mode === 'weak' ? '本次薄弱词练习已完成' : '本组已完成' }}
      </h2>
      <p class="my-3">
        首次正确 {{ state.counts.first_correct }} · 修正正确 {{ state.counts.corrected }} · 跳过 {{ state.counts.skipped }}
      </p>
      <div class="flex flex-wrap gap-2">
        <button class="practice-button" type="button" @click="chooseGroup(topic.id, state.group?.number, true)">
          {{ mode === 'weak' ? '整组再练' : '再练本组' }}
        </button>
        <button v-if="state.group && state.group.number < topic.groups.length" class="practice-button primary-button" type="button" @click="chooseGroup(topic.id, state.group.number + 1)">
          下一组
        </button>
      </div>
    </section>

    <p class="mt-5 text-sm text-gray-500 dark:text-gray-400">
      {{ history.pending.value ? '正在自动保存…' : history.error.value ? '本次记录尚未可靠保存，请到学习记录页导出备份。' : '学习记录与进度自动保存在此浏览器，可刷新或稍后继续。' }}
    </p>
  </main>
</template>

<style scoped>
.practice-control {
  width: 100%;
  min-width: 0;
  min-height: 48px;
  border: 1px solid #9ca3af;
  border-radius: 8px;
  padding: 10px 12px;
  font-size: 18px;
  color: inherit;
  background: transparent;
}
.practice-control:focus-visible,
.practice-button:focus-visible {
  outline: 3px solid #3b82f6;
  outline-offset: 3px;
}
.practice-button {
  min-height: 44px;
  border: 1px solid #9ca3af;
  border-radius: 8px;
  padding: 7px 14px;
  font-size: 15px;
}
.primary-button {
  border-color: #2563eb;
  background: #2563eb;
  color: white;
}
.character-feedback {
  white-space: pre-wrap;
  overflow-wrap: anywhere;
  line-height: 1.6;
}
.character-pending,
.character-composing { color: #9ca3af; }
.character-correct { color: #15803d; }
.character-error { color: #dc2626; text-decoration: underline; }
.input-error { border-color: #dc2626; }
:global(.dark) .character-correct { color: #4ade80; }
:global(.dark) .character-error { color: #f87171; }
</style>
