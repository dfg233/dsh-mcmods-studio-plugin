/**
 * 用例 27：标记区块（解析、替换、追加、幂等、重复/嵌套/未闭合检测）。
 */

import { equal, must, runSuite } from './helpers.mjs'
import {
  appendMarker,
  findMarkers,
  hasMarker,
  removeMarker,
  replaceMarker,
  upsertMarker,
  validateMarkers,
} from '../lib/markers.js'

const SAMPLE = `package com.example;

public class ModItems {
    // <mcstudio:generated items>
    public static final String RUBY = "ruby";
    // </mcstudio:generated>

    public static void main(String[] args) {}
}
`

const cases = [
  {
    name: '解析单个标记块',
    async run() {
      const parsed = findMarkers(SAMPLE)
      equal(parsed.blocks.length, 1, '应解析出一个块')
      equal(parsed.blocks[0].id, 'items', 'id 正确')
      equal(parsed.blocks[0].startLine, 3, 'open 行号（0-based）')
      equal(parsed.blocks[0].endLine, 5, 'close 行号')
      must(parsed.blocks[0].content.includes('RUBY'), '内容应包含标记之间文本')
      equal(parsed.errors.length, 0, '合法文本不应有错误')
    },
  },
  {
    name: '解析多个标记块',
    async run() {
      const text = `${SAMPLE}
// <mcstudio:generated blocks>
public static final String BLOCK = "block";
// </mcstudio:generated>
`
      const parsed = findMarkers(text)
      equal(parsed.blocks.length, 2, '应解析两个块')
      equal(parsed.blocks[1].id, 'blocks', '第二个块 id 正确')
      equal(hasMarker(text, 'blocks'), true, 'hasMarker 应命中')
      equal(hasMarker(text, 'items'), true, 'hasMarker 应命中 items')
      equal(hasMarker(text, 'missing'), false, '不存在的 id 返回 false')
    },
  },
  {
    name: '重复 id 报错',
    async run() {
      const text = `// <mcstudio:generated items>
a
// </mcstudio:generated>
// <mcstudio:generated items>
b
// </mcstudio:generated>
`
      const errors = validateMarkers(text)
      must(errors.some((error) => error.type === 'duplicate' && error.id === 'items'), '应报告重复 id')
    },
  },
  {
    name: '嵌套标记报错',
    async run() {
      const text = `// <mcstudio:generated items>
// <mcstudio:generated blocks>
a
// </mcstudio:generated>
// </mcstudio:generated>
`
      const errors = validateMarkers(text)
      must(errors.some((error) => error.type === 'nested'), '应报告嵌套')
    },
  },
  {
    name: '未闭合与孤立 close 报错',
    async run() {
      const unclosed = `// <mcstudio:generated items>\na\n`
      must(validateMarkers(unclosed).some((error) => error.type === 'unclosed'), '应报告未闭合')
      const orphan = `// </mcstudio:generated>\n`
      must(validateMarkers(orphan).some((error) => error.type === 'orphan-close'), '应报告孤立 close')
    },
  },
  {
    name: '替换块内容保留标记与外部代码',
    async run() {
      const replaced = replaceMarker(SAMPLE, 'items', '    public static final String SAPPHIRE = "sapphire";')
      must(replaced.includes('// <mcstudio:generated items>'), '保留 open 标记')
      must(replaced.includes('// </mcstudio:generated>'), '保留 close 标记')
      must(replaced.includes('SAPPHIRE'), '写入新内容')
      must(!replaced.includes('RUBY'), '旧内容被替换')
      must(replaced.includes('public static void main'), '标记外内容保留')
      equal(replaceMarker(SAMPLE, 'missing', 'x'), null, '不存在的块返回 null')
    },
  },
  {
    name: '追加标记块',
    async run() {
      const appended = appendMarker('class A {}\n', 'items', 'static final String X = "x";')
      must(appended.includes('// <mcstudio:generated items>'), '应写入 open 标记')
      const parsed = findMarkers(appended)
      equal(parsed.blocks.length, 1, '追加后应可解析')
      must(parsed.blocks[0].content.includes('X = "x"'), '内容正确')
      must(appended.startsWith('class A {}'), '原内容保留')
    },
  },
  {
    name: 'upsert 幂等与删除',
    async run() {
      const once = upsertMarker('class A {}\n', 'items', 'a')
      const twice = upsertMarker(once, 'items', 'a')
      equal(twice, once, '重复 upsert 应幂等')
      const updated = upsertMarker(twice, 'items', 'b')
      must(updated.includes('b'), '应更新内容')
      const removed = removeMarker(updated, 'items')
      must(!removed.includes('mcstudio:generated'), '删除后无标记')
      equal(removeMarker(updated, 'missing'), null, '删除不存在的块返回 null')
    },
  },
]

process.exitCode = await runSuite('27 · 标记区块', cases)
