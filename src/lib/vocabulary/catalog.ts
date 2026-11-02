import source from '../../pages/vocabulary/vocabulary'

export const DATASET_NAMESPACE = 'my-ielts.vocabulary'
export const DATASET_VERSION = '5cef573-v1'
export const DATASET_UPSTREAM_COMMIT = '5cef573933663c4673c6e0093f1df04e68018b1a'
export const DATASET_SOURCE_SHA256 = 'e21e604c16c30f1310dc025ccf6e58b93f2f525b231735f0b27e093d5e0eb1ce'
export const GROUP_SIZE = 20

interface SourceEntry {
  id: number
  word: string[]
  pos: string
  meaning: string
  example: string
  extra: string
}

export interface VocabularyEntry {
  readonly sourceId: number
  readonly wordId: string
  readonly topicId: string
  readonly spellings: readonly string[]
  readonly pos: string
  readonly meaning: string
  readonly example: string
  readonly extra: string
  readonly audioPath: string
}

export interface VocabularyGroup {
  readonly id: string
  readonly topicId: string
  readonly number: number
  readonly entries: readonly VocabularyEntry[]
}

export interface VocabularyTopic {
  readonly id: string
  readonly label: string
  readonly entries: readonly VocabularyEntry[]
  readonly groups: readonly VocabularyGroup[]
}

// Copy only content, never the legacy table's mutable spellValue/spellError fields.
function buildCatalog(): readonly VocabularyTopic[] {
  const data = source as unknown as Record<string, { label: string; words: SourceEntry[][] }>
  const ids = new Set<number>()
  return Object.freeze(Object.entries(data).map(([topicId, topic]) => {
    const entries = Object.freeze(topic.words.flat().map((entry) => {
      if (ids.has(entry.id) || !entry.word.length)
        throw new Error(`Invalid vocabulary identity: ${entry.id}`)
      ids.add(entry.id)
      return Object.freeze({
        sourceId: entry.id,
        wordId: `${DATASET_NAMESPACE}:${entry.id}`,
        topicId,
        spellings: Object.freeze([...entry.word]),
        pos: entry.pos,
        meaning: entry.meaning,
        example: entry.example,
        extra: entry.extra,
        audioPath: `vocabulary/audio/${topicId}/${entry.word[0]}.mp3`,
      })
    }))
    const groups: VocabularyGroup[] = []
    for (let offset = 0; offset < entries.length; offset += GROUP_SIZE) {
      const number = groups.length + 1
      groups.push(Object.freeze({
        id: `${DATASET_NAMESPACE}:${DATASET_VERSION}:${topicId}:group-${number}`,
        topicId,
        number,
        entries: Object.freeze(entries.slice(offset, offset + GROUP_SIZE)),
      }))
    }
    return Object.freeze({ id: topicId, label: topic.label, entries, groups: Object.freeze(groups) })
  }))
}

export const vocabularyCatalog = buildCatalog()
