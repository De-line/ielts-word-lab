<script setup lang="ts">
import { computed, ref } from 'vue'
import { DATASET_VERSION, vocabularyCatalog } from '../../lib/vocabulary/catalog'
import { groupById, groupStatistics, groups, recommendations, validateBackup } from '../../lib/vocabulary/history'
import type { Backup } from '../../lib/vocabulary/history'
import { learningStore } from '../../lib/vocabulary/storage'

const store = learningStore()
const loaded = ref(false)
store.ready.then(() => {
  loaded.value = true
})
const selectedTopic = ref(vocabularyCatalog[0].id)
const topicGroups = computed(() => vocabularyCatalog.find(topic => topic.id === selectedTopic.value)!.groups.map(group => groupStatistics(store.data.value.events, group)))
const summary = computed(() => groups.map(group => groupStatistics(store.data.value.events, group)))
const completed = computed(() => summary.value.filter(group => group.status === 'completed').length)
const recommended = computed(() => recommendations(store.data.value.events))
const progress = computed(() => store.data.value.progress)
const lastGroup = computed(() => groupById.get(progress.value?.groupId ?? ''))
const lastTopic = computed(() => vocabularyCatalog.find(topic => topic.id === lastGroup.value?.topicId))
const unfinished = computed(() => progress.value && progress.value.index < progress.value.wordIds.length)
const preview = ref<Backup | null>(null)
const importError = ref('')
const confirmed = ref(false)
const busy = ref(false)
const message = ref('')
const percent = (value: number | null) => value === null ? '覆盖完整后显示' : `${(value * 100).toFixed(1)}%`
const statusLabel: Record<string, string> = { not_started: '未开始', in_progress: '进行中', completed: '已完成' }
const topicLabel = (id: string) => vocabularyCatalog.find(topic => topic.id === id)!.label
function practiceLink(groupId: string, mode = 'whole') {
  return { path: '/vocabulary/typing', query: { group: groupId, mode } }
}
async function exportBackup() {
  try {
    const data = await store.exportData()
    const url = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' }))
    const anchor = document.createElement('a')
    anchor.href = url
    anchor.download = `ielts-word-lab-backup-${new Date().toISOString().slice(0, 10)}.json`
    anchor.click()
    setTimeout(() => URL.revokeObjectURL(url), 1000)
    message.value = '已请求下载备份，请检查浏览器下载记录。'
  }
  catch (error) { importError.value = String(error) }
}
let selection = 0
async function selectFile(event: Event) {
  const token = ++selection
  preview.value = null
  confirmed.value = false
  importError.value = ''
  const file = (event.target as HTMLInputElement).files?.[0]
  if (!file)
    return
  try {
    const data = validateBackup(JSON.parse(await file.text()))
    if (token === selection)
      preview.value = data
  }
  catch (error) {
    if (token === selection)
      importError.value = String(error)
  }
}
async function replace() {
  if (!preview.value || !confirmed.value || busy.value)
    return
  busy.value = true
  importError.value = ''
  try {
    await store.replace(preview.value)
    preview.value = null
    confirmed.value = false
    message.value = '导入完成，已替换本浏览器的学习记录和练习位置。'
  }
  catch (error) { importError.value = `导入失败，原记录未替换：${String(error)}` }
  finally { busy.value = false }
}
</script>

<template>
  <main class="records mx-auto max-w-4xl px-4 py-6">
    <h1 class="mb-3 text-2xl font-bold">
      学习记录
    </h1>
    <router-link class="text-blue-600 underline" to="/vocabulary/typing">
      返回单词练习
    </router-link>
    <p v-if="!loaded" role="status">
      正在读取本机记录…
    </p>
    <p v-if="store.error.value" role="alert" class="my-3 text-amber-700">
      {{ store.error.value }}
    </p>
    <p v-if="store.pending.value" role="status">
      正在保存，请暂勿关闭页面。
    </p>
    <section class="card my-4" data-testid="learning-summary">
      <h2 class="text-lg font-bold">
        本机学习进度
      </h2>
      <p>已完成 {{ completed }} / {{ groups.length }} 组（按历史是否完整覆盖区分，跳过也算练过）</p>
      <template v-if="lastGroup">
        <p>最近练习：{{ lastTopic?.label }} · 第 {{ lastGroup.number }} 组{{ progress?.mode === 'weak' ? '（薄弱词）' : '' }}</p>
        <p>保存时间：{{ progress?.savedAt }}；本次已练 {{ progress?.index }} / {{ progress?.wordIds.length }}</p>
        <router-link v-if="unfinished" class="action primary" to="/vocabulary/typing" data-testid="continue-practice">
          继续上次未完成练习
        </router-link>
        <p v-else>
          上次练习已结束，可以任选一组再次练习。
        </p>
      </template>
      <p v-else>
        尚无练习记录。
      </p>
    </section>
    <section class="card my-4">
      <h2 class="text-lg font-bold">
        建议复习（最多10组）
      </h2>
      <p class="my-2 text-sm">
        仅推荐历史已完整覆盖、有效正确率低于80%的组。薄弱词复习为可选，整组练过即可结束。
      </p>
      <p v-if="!recommended.length">
        暂无符合条件的推荐组。
      </p>
      <article v-for="item in recommended" :key="item.group.id" class="group-card" data-testid="recommended-group">
        <h3>{{ topicLabel(item.group.topicId) }} · 第 {{ item.group.number }} 组</h3>
        <p>{{ percent(item.accuracy) }} · {{ item.accuracy! < 0.6 ? '优先复习' : '建议复习' }} · 薄弱词 {{ item.weakWords.length }} 个</p>
        <p class="text-sm">
          上次完成单词：{{ item.lastPractice }}
        </p>
        <div class="flex flex-wrap gap-2">
          <router-link class="action" :to="practiceLink(item.group.id)">
            整组练习
          </router-link>
          <router-link v-if="item.weakWords.length" class="action" :to="practiceLink(item.group.id, 'weak')">
            只复习薄弱词
          </router-link>
          <span v-else>暂无薄弱词，可整组练习。</span>
        </div>
      </article>
    </section>
    <section class="card my-4">
      <h2 class="text-lg font-bold">
        各组记录
      </h2>
      <label class="my-3 block">主题
        <select v-model="selectedTopic" class="control" data-testid="records-topic">
          <option v-for="topic in vocabularyCatalog" :key="topic.id" :value="topic.id">{{ topic.label }}</option>
        </select>
      </label>
      <article v-for="item in topicGroups" :key="item.group.id" class="group-card" data-testid="group-record">
        <p>第 {{ item.group.number }} 组 · {{ statusLabel[item.status] }} · 已覆盖 {{ item.covered }}/{{ item.total }}</p>
        <p>有效正确率：{{ percent(item.accuracy) }} · 薄弱词 {{ item.weakWords.length }}</p>
        <router-link class="action" :to="practiceLink(item.group.id)">
          整组练习
        </router-link>
        <router-link v-if="item.weakWords.length" class="action" :to="practiceLink(item.group.id, 'weak')">
          只复习薄弱词
        </router-link>
      </article>
    </section>
    <section class="card my-4" data-testid="backup-section">
      <h2 class="text-lg font-bold">
        备份与恢复
      </h2>
      <p class="my-2">
        练习时自动保存，无需每组导出。手动JSON用于备份或设备转移，不会自动上传或同步。
      </p>
      <button class="action" type="button" :disabled="!loaded || busy" @click="exportBackup">
        导出现有备份
      </button>
      <label class="my-3 block">选择要导入的JSON（预览后才会替换）
        <input class="control" type="file" accept=".json,application/json" :disabled="!loaded || busy" data-testid="import-file" @change="selectFile">
      </label>
      <div v-if="preview" class="group-card" data-testid="import-preview">
        <p>词库 {{ preview.datasetVersion }}；{{ preview.events.length }} 条完成事件；{{ preview.progress ? '包含练习位置' : '无练习位置' }}。</p>
        <p class="my-2 font-bold">
          确认导入会覆盖此浏览器现有历史和进度，不能自动合并。建议先下载现有备份。
        </p>
        <button class="action" type="button" :disabled="busy" @click="exportBackup">
          先导出现有备份
        </button>
        <label class="my-2 block"><input v-model="confirmed" type="checkbox" :disabled="busy" data-testid="confirm-import"> 我已备份或接受覆盖现有数据</label>
        <button class="action primary" type="button" :disabled="!confirmed || busy" data-testid="replace-import" @click="replace">
          确认覆盖导入
        </button>
        <button class="action" type="button" :disabled="busy" @click="preview = null">
          取消
        </button>
      </div>
      <p v-if="importError" role="alert" class="my-3 text-red-700">
        {{ importError }}
      </p>
      <p v-if="message" role="status">
        {{ message }}
      </p>
    </section>
    <details class="card my-4 text-sm">
      <summary>统计与保存规则</summary>
      <p class="my-2">
        每词每天只取首次有效完成：首次正确记1，修正或跳过记0；未完成不计。保留同日重练原始事件，但不覆盖当日首次成绩。
      </p>
      <p>最近三个不同有效日期，最新到最旧权重50%、30%、20%；不足三日按已有权重归一化。组率按原组全部词取平均，覆盖完整前不显示正式组率。</p>
      <p>最近有效日错误/跳过或加权率低于80%视为薄弱；最近连续两个有效日期首次正确优先退出薄弱词。</p>
      <p>这是近期独立拼写成功率估计，不是严格掌握度。日期按完成时设备本地日历记录；改时区或设备日期不重写旧日期，日内首次按记录顺序确定。</p>
      <p>数据仅在当前站点地址和浏览器内。换IP/端口/浏览器可能看不到旧数据；清除站点数据或浏览器回收存储会丢失记录，请定期导出。普通代码更新保持存储键和词库版本时保留记录。</p>
      <p>当前词库：{{ DATASET_VERSION }}。不同词库版本拒绝直接导入，需要另行审核迁移。请避免在多个标签页同时练习或导入，防止练习位置相互覆盖。</p>
    </details>
  </main>
</template>

<style scoped>
.records { overflow-wrap: anywhere; }
.card { border: 1px solid #9ca3af; border-radius: 12px; padding: 16px; }
.group-card { border-top: 1px solid #9ca3af; padding-top: 12px; margin-top: 12px; }
.action { display: inline-block; min-height: 44px; padding: 10px 12px; border: 1px solid #9ca3af; border-radius: 8px; margin: 6px 6px 0 0; }
.primary { background: #2563eb; color: white; }
.control { display: block; width: 100%; min-width: 0; min-height: 44px; font-size: 16px; border: 1px solid #9ca3af; border-radius: 8px; padding: 8px; color: inherit; background: transparent; }
input[type=file] { max-width: 100%; }
button:disabled { opacity: 0.5; }
.action:focus-visible, .control:focus-visible { outline: 3px solid #3b82f6; }
</style>
