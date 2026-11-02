import { mount } from '@vue/test-utils'
import type { VueWrapper } from '@vue/test-utils'
import { nextTick } from 'vue'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import TypingPage from '../../src/pages/vocabulary/typing.vue'
import { vocabularyCatalog } from '../../src/lib/vocabulary/catalog'
import type { TypingOutcome } from '../../src/lib/vocabulary/typing'
import { resetLearningStoreForTests } from '../../src/lib/vocabulary/storage'

let wrapper: VueWrapper | null = null
async function tick() {
  await nextTick()
  await Promise.resolve()
  await nextTick()
}
const outcomes = () => (wrapper?.emitted('outcome') ?? []).map(args => args[0] as TypingOutcome)
async function open() {
  wrapper = mount(TypingPage, { attachTo: document.body, global: { stubs: { RouterLink: { template: '<a><slot /></a>' } } } })
  await tick()
  return wrapper
}

beforeEach(() => {
  resetLearningStoreForTests()
  vi.useFakeTimers()
  localStorage.clear()
  vi.spyOn(HTMLMediaElement.prototype, 'play').mockResolvedValue()
  vi.spyOn(HTMLMediaElement.prototype, 'pause').mockImplementation(() => {})
})
afterEach(() => {
  wrapper?.unmount()
  wrapper = null
  document.body.innerHTML = ''
  vi.restoreAllMocks()
  vi.useRealTimers()
})

describe('typing page integration', () => {
  it('TC-TYP-003 actual input and feedback both expose extra characters, which remain editable', async () => {
    const page = await open()
    const input = page.get<HTMLInputElement>('[data-testid="typing-input"]')
    await input.setValue('atmospherex')
    expect(input.element.value).toBe('atmospherex')
    expect(page.get('[data-testid="typing-feedback"]').text()).toContain('atmospherex')
    expect(page.get('[data-status="error"]').text()).toBe('x')
    expect(input.attributes('aria-invalid')).toBe('true')
    await input.setValue('atmosphere')
    vi.advanceTimersByTime(200)
    await tick()
    expect(page.get('[data-testid="accepted-spellings"]').text()).toBe('hydrosphere')
    expect(outcomes()[0].result).toBe('corrected')
  })

  it('TC-TYP-002 / TC-TYP-005 retry keeps error history and skip cancels a pending timer', async () => {
    const page = await open()
    await page.get('input').setValue('wrong')
    await page.get('[data-testid="retry-word"]').trigger('click')
    expect(page.get<HTMLInputElement>('input').element.value).toBe('')
    expect(document.activeElement).toBe(page.get('input').element)
    await page.get('input').setValue('atmosphere')
    await page.get('[data-testid="skip-word"]').trigger('click')
    vi.advanceTimersByTime(1000)
    await tick()
    expect(outcomes()).toHaveLength(1)
    expect(outcomes()[0]).toMatchObject({ result: 'skipped', hadError: true })
    expect(page.get('[data-testid="accepted-spellings"]').text()).toBe('hydrosphere')
  })

  it('TC-TYP-005 duplicate skip delivery from one rendered word does not skip its successor', async () => {
    const page = await open()
    const button = page.get<HTMLButtonElement>('[data-testid="skip-word"]').element
    button.click()
    button.click()
    await tick()
    expect(outcomes()).toHaveLength(1)
    expect(page.get('[data-testid="accepted-spellings"]').text()).toBe('hydrosphere')
  })

  it('TC-IME-001 compositionend and the final input produce exactly one unpenalized completion', async () => {
    const page = await open()
    const input = page.get<HTMLInputElement>('input')
    await input.trigger('compositionstart')
    input.element.value = '暂态'
    input.element.dispatchEvent(new InputEvent('input', { bubbles: true, isComposing: true }))
    await tick()
    expect(page.findAll('[data-status="error"]')).toHaveLength(0)
    input.element.value = 'atmosphere'
    input.element.dispatchEvent(new InputEvent('input', { bubbles: true, isComposing: true }))
    vi.advanceTimersByTime(1000)
    await tick()
    expect(outcomes()).toHaveLength(0)
    await input.trigger('compositionend')
    input.element.dispatchEvent(new InputEvent('input', { bubbles: true }))
    vi.advanceTimersByTime(200)
    await tick()
    expect(outcomes()).toHaveLength(1)
    expect(outcomes()[0].result).toBe('first_correct')
  })

  it('TC-ASY-003 topic/group selection and unmount cancel pending old-word transitions', async () => {
    const page = await open()
    await page.get('input').setValue('atmosphere')
    await page.get('[data-testid="group-select"]').setValue('2')
    vi.advanceTimersByTime(1000)
    await tick()
    expect(page.get('[data-testid="accepted-spellings"]').text()).toBe(vocabularyCatalog[0].groups[1].entries[0].spellings.join(' / '))
    await page.get('input').setValue(vocabularyCatalog[0].groups[1].entries[0].spellings[0])
    await page.get('[data-testid="topic-select"]').setValue(vocabularyCatalog[1].id)
    vi.advanceTimersByTime(1000)
    await tick()
    expect(page.get('[data-testid="group-select"]').element).toHaveProperty('value', '1')
    expect(page.get('[data-testid="accepted-spellings"]').text()).toBe('photosynthesis')
    await page.get('input').setValue('photosynthesis')
    page.unmount()
    wrapper = null
    vi.advanceTimersByTime(1000)
    expect((page.emitted('outcome') ?? []).every(args => !(args[0] as TypingOutcome).completed)).toBe(true)
  })

  it('TC-ASY-004 late composition events from a detached old-group input cannot alter the new composition', async () => {
    const page = await open()
    const oldInput = page.get<HTMLInputElement>('input').element
    oldInput.dispatchEvent(new CompositionEvent('compositionstart', { bubbles: true }))
    await page.get('[data-testid="group-select"]').setValue('2')
    const current = page.get<HTMLInputElement>('input')
    await current.trigger('compositionstart')
    oldInput.value = 'atmosphere'
    oldInput.dispatchEvent(new CompositionEvent('compositionstart', { bubbles: true }))
    oldInput.dispatchEvent(new InputEvent('input', { bubbles: true, isComposing: true }))
    oldInput.dispatchEvent(new CompositionEvent('compositionend', { bubbles: true }))
    await tick()
    expect(current.element.value).toBe('')
    expect(page.get('#typing-status').text()).toContain('组合中')
    current.element.value = vocabularyCatalog[0].groups[1].entries[0].spellings[0]
    await current.trigger('compositionend')
    vi.advanceTimersByTime(200)
    await tick()
    expect(outcomes().filter(event => event.completed)).toHaveLength(1)
    expect(outcomes().find(event => event.completed)?.result).toBe('first_correct')
  })

  it('TC-GRP-002 direct final-group selection completes with one skip, without requiring a correct answer', async () => {
    const page = await open()
    await page.get('[data-testid="group-select"]').setValue('13')
    expect(page.get('[data-testid="group-progress"]').text()).toContain('已练 0 / 1 词')
    await page.get('[data-testid="skip-word"]').trigger('click')
    expect(page.get('[data-testid="group-finished"]').text()).toContain('跳过 1')
    expect(page.get('[data-testid="group-progress"]').text()).toContain('已练 1 / 1 词')
  })

  it('TC-FOC-001 a visible recovery button restores focus and preserves partial input after blur/background', async () => {
    const page = await open()
    const input = page.get<HTMLInputElement>('input')
    await input.setValue('atmos')
    input.element.blur()
    window.dispatchEvent(new Event('pagehide'))
    vi.advanceTimersByTime(120000)
    await tick()
    expect(page.get('#typing-status').text()).toContain('继续输入')
    const resume = page.findAll('button').find(button => button.text() === '继续输入')!
    await resume.trigger('click')
    expect(document.activeElement).toBe(input.element)
    expect(input.element.value).toBe('atmos')
    await input.setValue('atmosphere')
    vi.advanceTimersByTime(200)
    await tick()
    expect(outcomes()[0].result).toBe('first_correct')
  })

  it('TC-AUD-001 rejected playback never blocks completion or creates an unhandled rejection', async () => {
    vi.mocked(HTMLMediaElement.prototype.play).mockRejectedValue(new Error('NotAllowedError'))
    const page = await open()
    expect(page.text()).toContain('音频暂不可用')
    await page.get('input').setValue('atmosphere')
    vi.advanceTimersByTime(200)
    await tick()
    expect(page.get('[data-testid="accepted-spellings"]').text()).toBe('hydrosphere')
    expect(outcomes()[0].result).toBe('first_correct')
  })

  it('TC-AUD-002 stalled playback gives bounded feedback and cannot affect a later word', async () => {
    vi.mocked(HTMLMediaElement.prototype.play).mockImplementation(() => new Promise<void>(() => {}))
    const page = await open()
    vi.advanceTimersByTime(8000)
    await tick()
    expect(page.text()).toContain('音频加载超时')
    await page.get('input').setValue('atmosphere')
    vi.advanceTimersByTime(200)
    await tick()
    expect(page.get('[data-testid="accepted-spellings"]').text()).toBe('hydrosphere')
    expect(page.text()).not.toContain('音频加载超时')
  })

  it('TC-AUD-002 playing clears the deadline, a later waiting event starts a new bounded wait', async () => {
    const players: HTMLMediaElement[] = []
    vi.mocked(HTMLMediaElement.prototype.play).mockImplementation(function (this: HTMLMediaElement) {
      players.push(this)
      return Promise.resolve()
    })
    const page = await open()
    const audio = players[0]
    audio.dispatchEvent(new Event('playing'))
    vi.advanceTimersByTime(8000)
    await tick()
    expect(page.text()).not.toContain('音频加载超时')
    audio.dispatchEvent(new Event('waiting'))
    vi.advanceTimersByTime(8000)
    await tick()
    expect(page.text()).toContain('音频加载超时')
    audio.dispatchEvent(new Event('playing'))
    await tick()
    expect(page.text()).not.toContain('音频加载超时')
  })

  it('TC-ENV-001 invalid topic preferences and unavailable localStorage fall back to a usable exercise', async () => {
    localStorage.setItem('vocabulary_typing_chapter', 'missing-topic')
    let page = await open()
    expect(page.get('[data-testid="accepted-spellings"]').text()).toBe('atmosphere')
    page.unmount()
    wrapper = null
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('SecurityError')
    })
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('QuotaExceededError')
    })
    page = await open()
    await page.get('input').setValue('atmosphere')
    vi.advanceTimersByTime(200)
    await tick()
    expect(page.get('[data-testid="accepted-spellings"]').text()).toBe('hydrosphere')
  })
})
