/**
 * 用例 65：结构增量扫描（P6/Q13）。
 */

import { promises as fsp } from 'node:fs'
import { join } from 'node:path'

import { equal, must, runSuite } from './helpers.mjs'
import { getParseCallCount } from '../lib/structure.js'

async function writeJava(dir, rel, className) {
  const file = join(dir, 'src/main/java/com/besson/incrmod', rel)
  await fsp.mkdir(join(file, '..'), { recursive: true })
  await fsp.writeFile(file, `package com.besson.incrmod;\npublic class ${className} {}\n`, 'utf8')
}

async function makeProject(ws, modid) {
  const dir = ws.path(modid)
  await ws.call('project.create', { path: dir, name: 'Incremental', modid, loader: 'forge', authors: 'Besson' })
  await ws.call('structure.refresh', { path: dir })
  await writeJava(dir, 'Alpha.java', 'Alpha')
  await writeJava(dir, 'Beta.java', 'Beta')
  return dir
}

const cases = [
  {
    name: '第二次刷新不再解析',
    async run(ws) {
      const dir = await makeProject(ws, 'm65incr')
      const before = getParseCallCount()
      await ws.call('structure.refresh', { path: dir })
      const first = getParseCallCount() - before
      must(first >= 2, '首次应解析新增文件')
      const mid = getParseCallCount()
      await ws.call('structure.refresh', { path: dir })
      equal(getParseCallCount() - mid, 0, '第二次不应再解析')
    },
  },
  {
    name: '只改一个文件只解析一个',
    async run(ws) {
      const dir = await makeProject(ws, 'm65one')
      await ws.call('structure.refresh', { path: dir })
      await fsp.writeFile(join(dir, 'src/main/java/com/besson/incrmod/Alpha.java'), 'package com.besson.incrmod;\npublic class Alpha { int x; }\n', 'utf8')
      const before = getParseCallCount()
      await ws.call('structure.refresh', { path: dir })
      equal(getParseCallCount() - before, 1, '只解析变更文件')
    },
  },
  {
    name: '删除文件从文档移除',
    async run(ws) {
      const dir = await makeProject(ws, 'm65del')
      await ws.call('structure.refresh', { path: dir })
      await fsp.rm(join(dir, 'src/main/java/com/besson/incrmod/Beta.java'), { force: true })
      await ws.call('structure.refresh', { path: dir })
      const result = await ws.call('structure.get', { path: dir })
      must(!result.structure.files.some((file) => file.path.endsWith('Beta.java')), '删除文件应移除')
    },
  },
]

process.exitCode = await runSuite('65 · 结构增量扫描', cases)
