/**
 * 客户端半的静态加载检查。
 *
 * client.js 是浏览器模块，正常要靠 `window.__ModuleLoader__.load` 加载。
 * 这里在 Node 里模拟最小环境（假 React + 假 window），验证：
 *   1. 文件能被解析并执行（语法与顶层代码无误）
 *   2. factory 返回的对象结构正确（inject / apply）
 *   3. 模块 id 与包名一致
 *   4. 注册时会访问哪些槽位
 *
 * 注意：它不能验证渲染结果，只能拦「加载即崩」这类问题。
 */

import { readFile } from 'node:fs/promises'

const FILE = 'D:/program/dsh-mcmods-studio-plugin/client.js'
const EXPECTED_ID = 'dsh-mcmods-studio-plugin'

/** 极简 React 替身：只需要让组件定义阶段不报错。 */
function createFakeReact() {
  const createElement = (type, props, ...children) => ({ type, props, children })
  const useState = (initial) => [typeof initial === 'function' ? initial() : initial, () => {}]
  const useEffect = () => {}
  const useMemo = (factory) => factory()
  const useRef = (initial) => ({ current: initial })
  const useCallback = (fn) => fn
  return { createElement, useState, useEffect, useMemo, useRef, useCallback, default: {} }
}

const source = await readFile(FILE, 'utf8')

const loaded = []
let factoryResult = null
let factoryError = null

const fakeWindow = {
  __ModuleLoader__: {
    load(definition) {
      loaded.push(definition)
      try {
        factoryResult = definition.factory((name) => {
          if (name === 'react') return createFakeReact()
          throw new Error(`未模拟的模块：${name}`)
        })
      } catch (error) {
        factoryError = error
      }
    },
  },
}

// 用 Function 构造器执行，避免污染当前模块作用域
const run = new Function('window', 'document', 'fetch', 'setTimeout', 'console', source)
const fakeDocument = {
  getElementById: () => null,
  createElement: () => ({ id: '', textContent: '', setAttribute() {} }),
  head: { appendChild() {} },
}

try {
  run(fakeWindow, fakeDocument, async () => ({ json: async () => ({ ok: false }) }), setTimeout, console)
} catch (error) {
  console.error('✗ 执行 client.js 时抛错')
  console.error(error)
  process.exit(1)
}

let problems = 0
const fail = (message) => { problems += 1; console.error(`✗ ${message}`) }
const ok = (message) => console.log(`✓ ${message}`)

if (factoryError) {
  fail(`factory 执行抛错：${factoryError.message}`)
} else {
  ok('factory 执行无异常')
}

if (loaded.length !== 1) {
  fail(`应调用一次 __ModuleLoader__.load，实际 ${loaded.length} 次`)
} else {
  ok('调用了 __ModuleLoader__.load')
}

const definition = loaded[0]
if (!definition) {
  console.error('没有拿到模块定义，后续检查跳过')
  process.exit(1)
}

if (definition.id === EXPECTED_ID) ok(`模块 id 正确：${definition.id}`)
else fail(`模块 id 应为 ${EXPECTED_ID}，实际 ${definition.id}`)

if (typeof definition.factory === 'function') ok('factory 是函数')
else fail('factory 不是函数')

if (!factoryResult) {
  fail('factory 没有返回模块对象')
} else {
  if (Array.isArray(factoryResult.inject) && factoryResult.inject.includes('slots')) {
    ok('inject 声明包含 slots')
  } else {
    fail(`inject 声明不正确：${JSON.stringify(factoryResult.inject)}`)
  }

  if (typeof factoryResult.apply === 'function') ok('apply 是函数')
  else fail('apply 不是函数')

  // 模拟 apply，统计注册了哪些槽位
  if (typeof factoryResult.apply === 'function') {
    const registrations = []
    const makeSlots = () => ({
      inject(name, callback) {
        registrations.push(name)
        try { callback() } catch { /* 假环境里注册回调可忽略失败 */ }
        return () => {}
      },
      register(options, _component) {
        registrations.push(`register:${options?.name ?? '?'}`)
        return () => {}
      },
    })
    const fakeCtx = {
      slots: makeSlots(),
      get: (name) => (name === 'slots' ? makeSlots() : null),
      inject: (deps, callback) => {
        if (deps.includes('sidebarRightTabs')) {
          try {
            callback({
              sidebarRightTabs: { register: () => () => {} },
              slots: makeSlots(),
            })
          } catch (error) {
            fail(`右侧栏注册回调抛错：${error.message}`)
          }
        }
        return () => {}
      },
    }
    try {
      factoryResult.apply(fakeCtx)
      ok('apply 在最小上下文下可执行')
      const unique = [...new Set(registrations)]
      ok(`注册的槽位：${unique.join(', ')}`)
      for (const expected of ['main', 'sidebar.panellist', 'register:main', 'register:sidebar.panellist']) {
        if (!unique.includes(expected)) fail(`缺少注册：${expected}`)
      }
    } catch (error) {
      fail(`apply 抛错：${error.message}`)
    }
  }
}

console.log(problems === 0 ? '\n客户端加载检查通过' : `\n客户端加载检查失败：${problems} 项`)
process.exit(problems === 0 ? 0 : 1)
