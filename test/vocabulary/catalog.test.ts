import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import source from '../../src/pages/vocabulary/vocabulary'
import { DATASET_NAMESPACE, DATASET_SOURCE_SHA256, DATASET_VERSION, vocabularyCatalog } from '../../src/lib/vocabulary/catalog'

describe('read-only vocabulary catalog', () => {
  it('TC-GRP-001 preserves 22 topics, all 3674 entries, ordering and exactly 194 groups', () => {
    expect(vocabularyCatalog).toHaveLength(22)
    expect(vocabularyCatalog.flatMap(topic => topic.entries)).toHaveLength(3674)
    expect(vocabularyCatalog.flatMap(topic => topic.groups)).toHaveLength(194)
    expect(vocabularyCatalog.map(topic => topic.id)).toEqual(Object.keys(source))
    for (const topic of vocabularyCatalog) {
      const original = (source as Record<string, { words: { id: number; word: string[]; meaning: string }[][] }>)[topic.id].words.flat()
      expect(topic.entries.map(entry => entry.sourceId)).toEqual(original.map(entry => entry.id))
      expect(topic.entries.map(entry => entry.spellings)).toEqual(original.map(entry => entry.word))
      expect(topic.entries.map(entry => entry.meaning)).toEqual(original.map(entry => entry.meaning))
      expect(topic.groups.flatMap(group => group.entries)).toEqual(topic.entries)
      for (const [index, group] of topic.groups.entries()) {
        expect(group.number).toBe(index + 1)
        expect(group.entries.every(entry => entry.topicId === topic.id)).toBe(true)
        expect(group.entries.length).toBe(index === topic.groups.length - 1 ? (topic.entries.length - 1) % 20 + 1 : 20)
      }
    }
  })

  it('TC-GRP-002 retains a one-word final group without borrowing from the next topic', () => {
    const topic = vocabularyCatalog[0]
    expect(topic.entries).toHaveLength(241)
    expect(topic.groups[12].entries).toEqual([topic.entries[240]])
    expect(topic.groups[12].number).toBe(13)
  })

  it('TC-ID-001 namespaces original IDs, distinguishes duplicate spellings and shares entries across group views', () => {
    const entries = vocabularyCatalog.flatMap(topic => topic.entries)
    expect(new Set(entries.map(entry => entry.wordId)).size).toBe(3674)
    const cores = entries.filter(entry => entry.spellings.includes('core'))
    expect(cores.map(entry => entry.sourceId)).toEqual([8, 1802])
    expect(cores[0].wordId).not.toBe(cores[1].wordId)
    expect(cores[0].wordId).toBe(`${DATASET_NAMESPACE}:8`)
    expect(vocabularyCatalog[0].groups[0].entries[7]).toBe(cores[0])
    expect(vocabularyCatalog[0].groups[0].id).toContain(DATASET_VERSION)
    expect(Object.isFrozen(cores[0])).toBe(true)
    expect(Object.isFrozen(cores[0].spellings)).toBe(true)
    expect(Object.isFrozen(vocabularyCatalog[0].groups[0].entries)).toBe(true)
  })

  it('TC-ID-002 rejects silent data regeneration through a pinned full-source fingerprint', () => {
    const bytes = readFileSync(new URL('../../src/pages/vocabulary/vocabulary.js', import.meta.url))
    expect(createHash('sha256').update(bytes).digest('hex')).toBe(DATASET_SOURCE_SHA256)
  })
})
