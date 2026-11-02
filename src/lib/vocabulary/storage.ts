import { ref, shallowRef } from 'vue'
import { DATASET_NAMESPACE, DATASET_VERSION } from './catalog'
import { backupOf, emptyData, learningEvent, validateBackup } from './history'
import type { Backup, LearningData, LearningEvent } from './history'
import type { PracticeCheckpoint, TypingOutcome } from './typing'

export const DATABASE_NAME = 'ielts-word-lab-learning'
export interface HistoryDriver {
  read: () => Promise<LearningData>
  write: (events: readonly LearningEvent[], progress: PracticeCheckpoint | null) => Promise<void>
  replace: (data: Backup) => Promise<void>
}
function request<T>(req: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error ?? new Error('读取失败'))
  })
}
export class IndexedHistory implements HistoryDriver {
  private database: Promise<IDBDatabase> | null = null
  private open() {
    this.database ??= new Promise<IDBDatabase>((resolve, reject) => {
      if (!globalThis.indexedDB) {
        reject(new Error('此浏览器无法使用IndexedDB'))
        return
      }
      const opening = indexedDB.open(DATABASE_NAME, 1)
      const timer = setTimeout(() => reject(new Error('本地数据库打开超时，请关闭其他旧标签页后重试')), 5000)
      opening.onupgradeneeded = () => {
        const events = opening.result.createObjectStore('events', { autoIncrement: true })
        events.createIndex('eventId', 'eventId', { unique: true })
        opening.result.createObjectStore('meta')
      }
      opening.onerror = () => {
        clearTimeout(timer)
        reject(opening.error)
      }
      opening.onblocked = () => {
        clearTimeout(timer)
        reject(new Error('其他标签页阻止了本地数据库打开'))
      }
      opening.onsuccess = () => {
        clearTimeout(timer)
        opening.result.onversionchange = () => opening.result.close()
        resolve(opening.result)
      }
    })
    return this.database
  }

  async read(): Promise<LearningData> {
    const database = await this.open()
    const tx = database.transaction(['events', 'meta'], 'readonly')
    const values = await Promise.all([request(tx.objectStore('events').getAll()), request(tx.objectStore('meta').get('identity'))])
    const [events, identity] = values
    if (!identity) {
      if (events.length)
        throw new Error('历史身份信息缺失，保留原数据，停止覆盖')
      return emptyData()
    }
    return validateBackup({ ...identity, events, exportedAt: new Date().toISOString() })
  }

  async write(batch: readonly LearningEvent[], progress: PracticeCheckpoint | null) {
    const database = await this.open()
    await new Promise<void>((resolve, reject) => {
      const tx = database.transaction(['events', 'meta'], 'readwrite')
      const events = tx.objectStore('events')
      for (const event of batch) {
        const existing = events.index('eventId').getKey(event.eventId)
        existing.onsuccess = () => {
          if (existing.result === undefined)
            events.add(event)
        }
      }
      tx.objectStore('meta').put({ formatVersion: 1, datasetNamespace: DATASET_NAMESPACE, datasetVersion: DATASET_VERSION, progress }, 'identity')
      tx.oncomplete = () => resolve()
      tx.onabort = () => reject(tx.error ?? new Error('保存事务已回滚'))
      tx.onerror = () => {} // onabort is the single rejection path.
    })
  }

  async replace(data: Backup) {
    const database = await this.open()
    await new Promise<void>((resolve, reject) => {
      const tx = database.transaction(['events', 'meta'], 'readwrite')
      const events = tx.objectStore('events')
      events.clear()
      for (const event of data.events)
        events.add(event)
      tx.objectStore('meta').put({ formatVersion: 1, datasetNamespace: DATASET_NAMESPACE, datasetVersion: DATASET_VERSION, progress: data.progress }, 'identity')
      tx.oncomplete = () => resolve()
      tx.onabort = () => reject(tx.error ?? new Error('导入事务已回滚，原数据保留'))
      tx.onerror = () => {}
    })
  }
}

export class LearningStore {
  readonly data = shallowRef<LearningData>(emptyData())
  readonly error = ref('')
  readonly pending = ref(0)
  readonly ready: Promise<void>
  private readable = false
  private queue: Promise<void> = Promise.resolve()
  private ids = new Set<string>()
  private unsaved = new Map<string, LearningEvent>()
  constructor(private readonly driver: HistoryDriver = new IndexedHistory()) {
    this.ready = driver.read().then((data) => {
      this.data.value = data
      this.ids = new Set(data.events.map(event => event.eventId))
      this.persisted = new Set(this.ids)
      this.readable = true
    }).catch((error) => {
      this.error.value = `无法读取学习记录：${String(error)}。本次可继续练习，但不覆盖已有存储；可导出本次内存记录。`
    })
  }

  private enqueue(action: () => Promise<void>) {
    this.pending.value++
    const result = this.queue.then(action)
    this.queue = result.catch(() => {}).finally(() => {
      this.pending.value--
    })
    return result
  }

  save(outcome: TypingOutcome | null, progress: PracticeCheckpoint | null) {
    const event = outcome ? learningEvent(outcome) : null
    const added = event && !this.ids.has(event.eventId) ? event : null
    if (added) {
      this.ids.add(added.eventId)
      this.unsaved.set(added.eventId, added)
    }
    this.data.value = { events: added ? [...this.data.value.events, added] : this.data.value.events, progress }
    if (!this.readable)
      return
    // Memory remains usable after quota/transaction failure, with a visible warning.
    // Subsequent writes retry unsaved events in order, so a transient failure cannot
    // silently discard an earlier completed result while claiming to be saved.
    const unsaved = [...this.unsaved.values()]
    void this.enqueue(async () => {
      const batch = unsaved.filter(item => !this.persisted.has(item.eventId))
      await this.driver.write(batch, progress)
      for (const item of batch) {
        this.persisted.add(item.eventId)
        this.unsaved.delete(item.eventId)
      }
      this.error.value = ''
    }).catch((error) => {
      this.error.value = `学习记录尚未保存：${String(error)}。请保留页面并导出备份，勿清除站点数据。`
    })
  }

  private persisted = new Set<string>()
  async settled() {
    await this.ready
    await this.queue
  }

  async exportData(): Promise<Backup> {
    await this.settled()
    return backupOf(this.data.value)
  }

  async replace(value: unknown) {
    const validated = validateBackup(value)
    await this.ready
    if (!this.readable)
      throw new Error('当前存储不可用，不能替换已有数据')
    await this.enqueue(async () => {
      await this.driver.replace(validated)
      this.data.value = { events: validated.events, progress: validated.progress }
      this.ids = new Set(validated.events.map(event => event.eventId))
      this.persisted = new Set(this.ids)
      this.unsaved.clear()
      this.error.value = ''
    })
  }
}

let currentStore: LearningStore | null = null
export function learningStore() {
  currentStore ??= new LearningStore()
  return currentStore
}

export function resetLearningStoreForTests() {
  currentStore = null
}
