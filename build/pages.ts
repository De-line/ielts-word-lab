import { copyFileSync, mkdirSync, readdirSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import type { Plugin } from 'vite'

export const PAGES_BASE = '/ielts-word-lab/'
export const PAGES_OUTPUT = 'dist-pages'
// Copy only application resources. A backup accidentally placed in public/
// must never become part of the Pages artifact.
export function pagesAssets(): Plugin {
  let root = ''
  return {
    name: 'word-lab-pages-assets',
    apply: 'build',
    configResolved(config) { root = config.root },
    closeBundle() {
      const output = resolve(root, PAGES_OUTPUT)
      function copy(directory: string, prefix = '') {
        for (const item of readdirSync(directory, { withFileTypes: true })) {
          const relative = prefix ? `${prefix}/${item.name}` : item.name
          if (item.isSymbolicLink())
            throw new Error(`Public asset symlink is not allowed: ${relative}`)
          if (item.isDirectory()) {
            if (relative !== 'screenshot')
              copy(join(directory, item.name), relative)
          }
          else if (/^(?:vocabulary\/audio\/.+\.mp3|179_audios\/.+\.mp3|grammar\/.+\.(?:svg|pdf)|404\.svg|favicon\.(?:png|svg))$/.test(relative)) {
            const target = join(output, relative)
            mkdirSync(dirname(target), { recursive: true })
            copyFileSync(join(directory, item.name), target)
          }
        }
      }
      copy(join(root, 'public'))
      copyFileSync(join(root, 'ATTRIBUTION.md'), join(output, 'ATTRIBUTION.txt'))
    },
  }
}
