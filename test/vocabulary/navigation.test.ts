import { mount } from '@vue/test-utils'
import { defineComponent, nextTick } from 'vue'
import { createMemoryHistory, createRouter } from 'vue-router'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import VocabularyList from '../../src/pages/vocabulary/index.vue'
import TypingPage from '../../src/pages/vocabulary/typing.vue'
import { resetLearningStoreForTests } from '../../src/lib/vocabulary/storage'

beforeEach(() => {
  resetLearningStoreForTests()
  localStorage.clear()
  vi.spyOn(HTMLMediaElement.prototype, 'play').mockResolvedValue()
  vi.spyOn(HTMLMediaElement.prototype, 'pause').mockImplementation(() => {})
  vi.spyOn(HTMLMediaElement.prototype, 'load').mockImplementation(() => {})
})
afterEach(() => {
  document.body.innerHTML = ''
  vi.restoreAllMocks()
})

describe('original vocabulary keyboard shortcuts', () => {
  it('TC-NAV-002 keeps body/audio shortcuts but leaves input, select and editable targets untouched', async () => {
    const wrapper = mount(VocabularyList, { attachTo: document.body })
    const audio = wrapper.get<HTMLAudioElement>('audio').element
    audio.currentTime = 10
    const right = new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true, cancelable: true })
    document.body.dispatchEvent(right)
    expect(right.defaultPrevented).toBe(true)
    expect(audio.currentTime).toBe(15)
    const space = new KeyboardEvent('keydown', { key: ' ', bubbles: true, cancelable: true })
    document.body.dispatchEvent(space)
    expect(space.defaultPrevented).toBe(true)
    expect(HTMLMediaElement.prototype.play).toHaveBeenCalled()
    for (const options of [{ ctrlKey: true }, { altKey: true }, { metaKey: true }, { isComposing: true }]) {
      const event = new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true, cancelable: true, ...options })
      document.body.dispatchEvent(event)
      expect(event.defaultPrevented).toBe(false)
    }
    for (const tag of ['input', 'textarea', 'select', 'button', 'div']) {
      const element = document.createElement(tag)
      if (tag === 'div')
        element.setAttribute('contenteditable', 'true')
      document.body.append(element)
      for (const key of [' ', 'ArrowLeft', 'ArrowRight']) {
        const event = new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true })
        element.dispatchEvent(event)
        expect(event.defaultPrevented).toBe(false)
      }
      element.remove()
    }
    audio.remove()
    const noAudio = new KeyboardEvent('keydown', { key: ' ', bubbles: true, cancelable: true })
    document.body.dispatchEvent(noAudio)
    expect(noAudio.defaultPrevented).toBe(false)
    wrapper.unmount()
  })

  it('TC-NAV-001 repeated real route transitions remove the exact listeners and do not break typing', async () => {
    const add = vi.spyOn(document, 'addEventListener')
    const remove = vi.spyOn(document, 'removeEventListener')
    const router = createRouter({ history: createMemoryHistory(), routes: [{ path: '/vocabulary', component: VocabularyList }, { path: '/typing', component: TypingPage }, { path: '/vocabulary/records', component: { template: '<div />' } }] })
    await router.push('/vocabulary')
    await router.isReady()
    const wrapper = mount(defineComponent({ template: '<RouterView />' }), { global: { plugins: [router] }, attachTo: document.body })
    for (let i = 0; i < 3; i++) {
      await router.push('/typing')
      await nextTick()
      const input = wrapper.get('input')
      for (const key of [' ', 'ArrowLeft', 'ArrowRight']) {
        const event = new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true })
        input.element.dispatchEvent(event)
        expect(event.defaultPrevented).toBe(false)
      }
      if (i < 2)
        await router.push('/vocabulary')
    }
    wrapper.unmount()
    const registered = add.mock.calls.filter(([type, callback]) => type === 'keydown' && typeof callback === 'function' && callback.name === 'onAudioKeydown')
    expect(registered).toHaveLength(3)
    for (const [, callback] of registered)
      expect(remove.mock.calls.some(([type, removed]) => type === 'keydown' && removed === callback)).toBe(true)
    const event = new KeyboardEvent('keydown', { key: ' ', cancelable: true })
    document.dispatchEvent(event)
    expect(event.defaultPrevented).toBe(false)
  })
})
