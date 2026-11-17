import { vi } from 'vitest'

type Parts = Array<string | Parts>
export function transcriptDom(parts: Parts = ['test test']) {
  const nodes: any[] = []
  const build = (parts: Parts): any => ({ children: parts.map(part => {
    if (typeof part !== 'string') return build(part)
    const node = { data: part, get length() { return this.data.length } }
    nodes.push(node); return node
  }) })
  const element = build(parts)
  const root: any = { ...element, firstChild: element.children[0], isConnected: true, contains: (node: unknown) => nodes.includes(node) }
  class TextRange {
    startContainer: any; endContainer: any; startOffset = 0; endOffset = 0
    setStart(node: any, offset: number) {
      if (offset < 0 || offset > node.length || !('data' in node)) throw new RangeError('Invalid start offset')
      this.startContainer = node; this.startOffset = offset
    }
    setEnd(node: any, offset: number) {
      if (offset < 0 || offset > node.length || !('data' in node)) throw new RangeError('Invalid end offset')
      this.endContainer = node; this.endOffset = offset
    }
    toString() {
      const start = nodes.indexOf(this.startContainer), end = nodes.indexOf(this.endContainer)
      return nodes.slice(start, end + 1).map((node, index) => node.data.slice(index === 0 ? this.startOffset : 0, start + index === end ? this.endOffset : undefined)).join('')
    }
    getBoundingClientRect() { return { top: 100, bottom: 120, height: 20 } }
  }
  const doc = {
    createTreeWalker: vi.fn((node: any, what: number) => {
      if (node !== root || what !== 4) throw new Error('Expected the text root and SHOW_TEXT')
      let index = 0
      return { nextNode: () => nodes[index++] ?? null }
    }),
    createRange: vi.fn(() => new TextRange()),
  }
  root.ownerDocument = doc
  const row = { dataset: { key: 'me:0' }, querySelector: () => root }
  const list = { querySelectorAll: () => [row], getBoundingClientRect: () => ({ top: 50, bottom: 500 }), scrollTop: 0, scrollTo: vi.fn() }
  vi.stubGlobal('Range', TextRange)
  vi.stubGlobal('NodeFilter', { SHOW_TEXT: 4 })
  return { list: list as unknown as HTMLOListElement, root, doc, nodes }
}
