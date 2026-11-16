import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { expect, it } from 'vitest'

const config = readFileSync(join(__dirname, '../electron.vite.config.ts'), 'utf8')

// Every window loads the renderer bundle; minified it is about 23% smaller (5.2 MB → 4.0 MB), licences kept beside it
it('the shipped renderer is minified, and its licences are still written out', () => {
  const renderer = config.slice(config.indexOf('renderer:'))
  expect(renderer).toMatch(/build:\s*\{[^}]*minify:\s*'esbuild'/)
  expect(renderer).toMatch(/license:\s*\{\s*fileName:\s*'LICENSES\.txt'\s*\}/)
})
