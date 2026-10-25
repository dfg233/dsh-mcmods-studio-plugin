/**
 * 客户端渲染层测试装置。
 *
 * client.js 是浏览器模块，组件全在 `__ModuleLoader__.load` 的 factory 闭包内。
 * 本装置做三件事：
 *   1. 用可控的假 React 执行 client.js（useState 可写、useEffect 立即执行）；
 *   2. 通过 `window.__MCMODS_TEST__` 让模块暴露组件；
 *   3. 提供元素树查询工具，对渲染结果做结构断言。
 *
 * 它验证的是「给定 props 会渲染出什么」，不验证样式与鼠标交互。
 */

import { readFile } from 'node:fs/promises'

const CLIENT_FILE = 'D:/program/dsh-mcmods-studio-plugin/client.js'

/**
 * 建一个可观察到状态更新的 React 替身。
 *
 * `useState` 返回的 setter 会写回内部槽位并记录调用，
 * 这样测试可以「调用 setter → 重新渲染 → 断言新结果」。
 */
function createReact() {
  /** 当前渲染周期的状态槽位。 */
  let slots = []
  /** useMemo 的缓存值，按调用序保存。 */
  let memoCache = []
  /** useRef 的稳定引用，按调用序保存。 */
  let refCache = []
  let cursor = 0
  const updates = []

  const React = {
    createElement: (type, props, ...children) => ({
      type,
      props: props ?? {},
      children: children.flat(Infinity).filter((child) => child !== null && child !== undefined && child !== false),
    }),
    useState(initial) {
      const index = cursor
      cursor += 1
      if (slots[index] === undefined) {
        slots[index] = typeof initial === 'function' ? initial() : initial
      }
      const setter = (next) => {
        const value = typeof next === 'function' ? next(slots[index]) : next
        slots[index] = value
        updates.push({ index, value })
      }
      return [slots[index], setter]
    },
    useEffect(effect) {
      // 渲染期间同步执行，测试里可直接断言副作用结果
      const cleanup = effect()
      return cleanup
    },
    useMemo: (factory, deps) => {
      const index = cursor
      cursor += 1
      // 首次或依赖变化时重算，否则复用缓存；模拟 React 的语义
      const cached = memoCache[index]
      if (!cached) {
        const value = factory()
        memoCache[index] = { value, deps }
        return value
      }
      const changed = !Array.isArray(deps) || !Array.isArray(cached.deps)
        || deps.length !== cached.deps.length
        || deps.some((dep, i) => dep !== cached.deps[i])
      if (changed) {
        const value = factory()
        memoCache[index] = { value, deps }
        return value
      }
      return cached.value
    },
    useCallback: (fn) => fn,
    useRef(initial) {
      const index = cursor
      cursor += 1
      // ref 与 memo 分槽存放，避免索引互相污染
      if (!refCache[index]) refCache[index] = { current: initial }
      return refCache[index]
    },
    default: {},
  }
  React.useId = () => 'test-id'

  return {
    React,
    /**
     * 开始一次新的渲染周期。
     *
     * 只把游标归零，保留 state 与缓存——这与 React 的重新渲染一致：
     * 状态留存，hook 按调用序重新取用。
     */
    reset() {
      cursor = 0
      return slots
    },
    /** 开始一次全新挂载（清空状态与缓存）。 */
    unmount() {
      slots = []
      memoCache = []
      refCache = []
      cursor = 0
      return slots
    },
    /** 取当前状态快照。 */
    snapshot: () => [...slots],
    updates,
  }
}

/**
 * 加载 client.js，返回组件与测试工具。
 *
 * @param overrides.fetch  自定义 fetch，用于模拟 Host 响应
 */
export async function loadClient(overrides = {}) {
  const reactEnv = createReact()
  const source = await readFile(CLIENT_FILE, 'utf8')

  const calls = []
  const fetchImpl = overrides.fetch ?? (async (url, init) => {
    const body = JSON.parse(init?.body ?? '{}')
    calls.push(body)
    const handler = overrides.handler
    const data = handler ? await handler(body.action, body.payload) : {}
    return { json: async () => ({ ok: true, data }) }
  })

  const fakeWindow = {
    __MCMODS_TEST__: true,
    __ModuleLoader__: {
      load(definition) {
        fakeWindow.__definition = definition
      },
    },
  }

  const fakeDocument = {
    getElementById: () => null,
    createElement: () => ({ id: '', textContent: '', setAttribute() {} }),
    head: { appendChild() {} },
  }

  const run = new Function('window', 'document', 'fetch', 'setTimeout', 'console', source)
  run(fakeWindow, fakeDocument, fetchImpl, (fn) => fn(), { log() {}, warn() {}, error() {} })

  const definition = fakeWindow.__definition
  if (!definition) throw new Error('client.js 没有调用 __ModuleLoader__.load')

  const module = definition.factory((name) => {
    if (name === 'react') return reactEnv.React
    throw new Error(`未模拟的模块：${name}`)
  })

  if (!module.components) {
    throw new Error('测试钩子未生效：__MCMODS_TEST__ 未被识别')
  }

  return {
    components: module.components,
    helpers: module.helpers,
    constants: module.constants,
    module,
    reactEnv,
    calls,
    /** 渲染组件并返回元素树。 */
    render(Component, props = {}) {
      reactEnv.unmount()
      return Component(props)
    },
    /**
     * 渲染并等待副作用（useEffect 里的异步请求）落地后重新渲染。
     *
     * 组件的 useEffect 常写成 `call(...).then(setState)`，第一次渲染拿不到数据。
     * 这里把微任务与宏任务都放行一轮，再重渲染一次，得到数据回来后的结构。
     */
    async renderSettled(Component, props = {}) {
      reactEnv.unmount()
      const first = Component(props)
      await drain()
      reactEnv.reset()
      const second = Component(props)
      return second ?? first
    },
  }
}

/** 放行待处理的微任务与一个宏任务轮次。 */
async function drain() {
  await Promise.resolve()
  await new Promise((resolve) => setTimeout(resolve, 0))
  await Promise.resolve()
}

/* ── 元素树查询 ──────────────────────────────────────────── */

/** 深度优先遍历元素树。 */
export function walk(node, visit) {
  if (node === null || node === undefined || node === false) return
  if (Array.isArray(node)) {
    for (const child of node) walk(child, visit)
    return
  }
  if (typeof node === 'string' || typeof node === 'number') {
    visit({ type: '#text', text: String(node), props: {}, children: [] })
    return
  }
  visit(node)
  if (node.children) for (const child of node.children) walk(child, visit)
}

/** 收集元素树里所有文本片段（含 props 里的字符串，如 Markdown 的 text）。 */
export function texts(node) {
  const out = []
  walk(node, (entry) => {
    if (entry.type === '#text') {
      out.push(entry.text)
      return
    }
    // 组件把待渲染文本放在 props 上（例如 Markdown 的 text、InfoRow 的 label/value）
    for (const [key, value] of Object.entries(entry.props ?? {})) {
      if (key === 'children') continue
      if (typeof value === 'string' && value.trim()) out.push(value)
    }
  })
  return out
}

/** 判断元素树里是否包含某段文本。 */
export function hasText(node, needle) {
  return texts(node).some((text) => text.includes(needle))
}

/** 按文本查找最近的元素节点。 */
export function findByText(node, needle) {
  let found = null
  walk(node, (entry) => {
    if (found || entry.type === '#text') return
    if (texts(entry).some((text) => text.includes(needle))) found = entry
  })
  return found
}

/** 收集所有原生标签名（div、button…）。 */
export function tags(node) {
  const out = []
  walk(node, (entry) => {
    if (typeof entry.type === 'string' && entry.type !== '#text') out.push(entry.type)
  })
  return out
}

/** 统计某标签出现次数。 */
export function countTag(node, tag) {
  return tags(node).filter((name) => name === tag).length
}

/** 找出所有按钮（含文本）。 */
export function buttons(node) {
  const out = []
  walk(node, (entry) => {
    if (typeof entry.type === 'string' && entry.type === 'button') {
      out.push({ node: entry, text: texts(entry).join('') })
    }
  })
  return out
}
