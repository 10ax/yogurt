import { beforeEach, describe, expect, it, vi } from 'vitest'
import { Gemma4ChatWrapper, type LlamaChatSessionOptions } from 'node-llama-cpp'
import { createLlm } from '../src/engine/llm'

const fake = vi.hoisted(() => ({ architecture: 'gemma4', sessions: [] as unknown[], loads: [] as unknown[], disposed: 0, contextFails: 0, contextError: undefined as (() => Error) | undefined }))
vi.mock('node-llama-cpp', async (original) => {
  const actual = await original<typeof import('node-llama-cpp')>()
  const sequence = { contextTokens: [], tokenMeter: { usedInputTokens: 0 }, evaluateWithoutGeneratingNewTokens: async () => {} }
  return {
    ...actual,
    getLlama: async () => ({ gpu: 'vulkan', loadModel: async (o: { gpuLayers?: unknown }) => {
      fake.loads.push(o.gpuLayers)
      return {
        fileInfo: { metadata: { general: { architecture: fake.architecture } } }, gpuLayers: o.gpuLayers === 0 ? 0 : 20,
        tokenize: () => [], dispose: async () => { fake.disposed++ },
        createContext: async () => {
          if (fake.contextFails > 0) { fake.contextFails--; throw fake.contextError?.() ?? new actual.InsufficientMemoryError('A context size of 8192 is too large for the available VRAM') }
          return { contextSize: 8192, getSequence: () => sequence, dispose: async () => {} }
        },
      }
    } }),
    LlamaChatSession: class {
      constructor(options: LlamaChatSessionOptions) { fake.sessions.push(options) }
      setChatHistory() {}
      async preloadPrompt() {}
      async prompt() { return '' }
      dispose() {}
    },
  }
})

beforeEach(() => { fake.sessions.length = 0; fake.loads.length = 0; fake.disposed = 0; fake.contextFails = 0; fake.contextError = undefined })

describe('model prompt wrapper', () => {
  it.each(['gemma4', 'qwen3', 'gpt-oss'])('preload and answers use the same format for %s', async (architecture) => {
    fake.architecture = architecture
    const llm = createLlm()
    await llm.load('fixture.gguf', 8192, 8192)
    const messages = [{ role: 'user' as const, content: 'Synthetic transcript.' }]
    await llm.preload(messages)
    await llm.chat({ messages, thoughtBudget: 0 }, () => {})
    expect(fake.sessions).toHaveLength(2)
    for (const { chatWrapper } of fake.sessions as LlamaChatSessionOptions[]) {
      if (architecture === 'gemma4') {
        expect(chatWrapper).toBeInstanceOf(Gemma4ChatWrapper)
        const wrapper = chatWrapper as Gemma4ChatWrapper
        expect(wrapper.reasoning).toBe(false)
        const context = wrapper.generateContextState({ chatHistory: [{ type: 'user', text: 'Synthetic transcript.' }, { type: 'model', response: [] }] }).contextText.toString()
        expect(context).toContain('<|turn>user\nSynthetic transcript.')
        expect(context).not.toContain('<|think|>')
      } else expect(chatWrapper ?? 'auto').toBe('auto')
    }
    await llm.unload()
  })
})

describe('too little room on the graphics card for the notes', () => {
  it('loads once, as before, when the context fits', async () => {
    const llm = createLlm()
    expect(await llm.load('fixture.gguf', 32768, 8192)).toMatchObject({ gpu: 'vulkan', gpuLayers: 20 })
    expect(fake.loads).toEqual([undefined])
  })
  it('loads again with room left for the notes on the card, when the context did not fit', async () => {
    fake.contextFails = 1
    const llm = createLlm()
    await llm.load('fixture.gguf', 32768, 8192)
    expect(fake.loads).toEqual([undefined, { fitContext: { contextSize: 8192 } }])
    expect(fake.disposed).toBe(1)
  })
  it('runs on the processor alone when even that does not fit', async () => {
    fake.contextFails = 2
    const llm = createLlm()
    expect(await llm.load('fixture.gguf', 32768, 8192)).toMatchObject({ gpu: false, gpuLayers: 0 })
    expect(fake.loads).toEqual([undefined, { fitContext: { contextSize: 8192 } }, 0])
  })
  it('gives up when the processor alone does not fit either', async () => {
    fake.contextFails = 3
    await expect(createLlm().load('fixture.gguf', 32768, 8192)).rejects.toThrow(/too large/)
  })
  it('another error is not retried', async () => {
    fake.contextFails = 1; fake.contextError = () => new Error('bad file')
    await expect(createLlm().load('fixture.gguf', 32768, 8192)).rejects.toThrow('bad file')
    expect(fake.loads).toEqual([undefined])
  })
})
