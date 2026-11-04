/**
 * 用例 24：检查器（允许/保护路径、结构差异、资源、注册配对、语言、未注册检查）。
 */

import { join } from 'node:path'

import { equal, must, runSuite } from './helpers.mjs'
import { matchesPath, runChecks, writeStructureSnapshot } from '../lib/checks.js'

async function newProject(ws, modid = 'chkmod') {
  const dir = ws.path(modid)
  await ws.call('project.create', { path: dir, name: '检查测试', modid, loader: 'forge' })
  return dir
}

function byId(results, id) {
  return results.find((item) => item.id === id)
}

const cases = [
  {
    name: 'allowed-paths：通过',
    async run(ws) {
      const dir = await newProject(ws)
      const results = await runChecks(dir, {
        verify: ['allowed-paths'],
        allowedPaths: ['src/main/java/com/example/chkmod/item/**'],
        result: { files: [{ path: 'src/main/java/com/example/chkmod/item/Ruby.java', action: 'create' }] },
      })
      equal(byId(results, 'allowed-paths').status, 'pass', '应通过')
    },
  },
  {
    name: 'allowed-paths：越界失败',
    async run(ws) {
      const dir = await newProject(ws)
      const results = await runChecks(dir, {
        verify: ['allowed-paths'],
        allowedPaths: ['src/main/java/com/example/chkmod/item/**'],
        result: { files: [{ path: 'src/main/java/com/example/chkmod/Other.java' }] },
      })
      const check = byId(results, 'allowed-paths')
      equal(check.status, 'fail', '应失败')
      must(check.details.violations.includes('src/main/java/com/example/chkmod/Other.java'), '应列出越界文件')
    },
  },
  {
    name: 'guard-paths：修改保护路径失败',
    async run(ws) {
      const dir = await newProject(ws)
      const results = await runChecks(dir, {
        verify: ['guard-paths'],
        guardPaths: ['src/main/java/com/example/chkmod/lock/**'],
        result: { files: [{ path: 'src/main/java/com/example/chkmod/lock/Key.java' }] },
      })
      equal(byId(results, 'guard-paths').status, 'fail', '应失败')
    },
  },
  {
    name: 'structure-diff：新增未声明文件失败',
    async run(ws) {
      const dir = await newProject(ws)
      await ws.write(join(dir, 'src/main/java/com/example/chkmod/A.java'), 'package com.example.chkmod;\npublic class A {}\n')
      await ws.call('structure.refresh', { path: dir })
      const hash = await writeStructureSnapshot(dir)

      await ws.write(join(dir, 'src/main/java/com/example/chkmod/B.java'), 'package com.example.chkmod;\npublic class B {}\n')
      const results = await runChecks(dir, {
        verify: ['structure-diff'],
        baseStructureHash: hash,
        allowedPaths: ['src/main/java/com/example/chkmod/A.java'],
      })
      equal(byId(results, 'structure-diff').status, 'fail', '未声明新增应失败')

      const allowed = await runChecks(dir, {
        verify: ['structure-diff'],
        baseStructureHash: hash,
        allowedPaths: ['src/main/java/com/example/chkmod/A.java', 'src/main/java/com/example/chkmod/B.java'],
      })
      equal(byId(allowed, 'structure-diff').status, 'pass', '声明后应通过')
    },
  },
  {
    name: 'resource-exists：缺失资源失败',
    async run(ws) {
      const dir = await newProject(ws)
      const failed = await runChecks(dir, {
        verify: ['resource-exists'],
        result: { files: [{ path: 'src/main/resources/assets/chkmod/models/item/ruby.json' }] },
      })
      equal(byId(failed, 'resource-exists').status, 'fail', '缺失应失败')

      await ws.write(
        join(dir, 'src/main/resources/assets/chkmod/models/item/ruby.json'),
        '{"parent":"minecraft:item/generated"}\n',
      )
      const passed = await runChecks(dir, {
        verify: ['resource-exists'],
        result: { files: [{ path: 'src/main/resources/assets/chkmod/models/item/ruby.json' }] },
      })
      equal(byId(passed, 'resource-exists').status, 'pass', '存在应通过')
    },
  },
  {
    name: 'registration-pair：物品缺模型失败',
    async run(ws) {
      const dir = await newProject(ws, 'chkpair')
      await ws.call('items.save', { path: dir, item: { id: 'ruby', displayName: 'Ruby', type: 'material' } })
      const failed = await runChecks(dir, { verify: ['registration-pair'] })
      equal(byId(failed, 'registration-pair').status, 'fail', '缺模型应失败')

      await ws.write(
        join(dir, 'src/main/resources/assets/chkpair/models/item/ruby.json'),
        '{"parent":"minecraft:item/generated"}\n',
      )
      const passed = await runChecks(dir, { verify: ['registration-pair'] })
      equal(byId(passed, 'registration-pair').status, 'pass', '补齐模型后应通过')
    },
  },
  {
    name: 'lang-key：缺键失败',
    async run(ws) {
      const dir = await newProject(ws, 'chklang')
      await ws.call('items.save', { path: dir, item: { id: 'ruby', displayName: 'Ruby', type: 'material' } })
      const passed = await runChecks(dir, { verify: ['lang-key'] })
      equal(byId(passed, 'lang-key').status, 'pass', 'items.save 应连带建键')

      await ws.write(
        join(dir, '.mcstudio/items/old.json'),
        JSON.stringify({ id: 'old', displayName: '旧物品', type: 'item' }),
      )
      const failed = await runChecks(dir, { verify: ['lang-key'] })
      equal(byId(failed, 'lang-key').status, 'fail', '缺键应失败')
    },
  },
  {
    name: '未注册检查与无 gradlew 时跳过',
    async run(ws) {
      const dir = await newProject(ws)
      const results = await runChecks(dir, { verify: ['unknown-check', 'compile-java'] })
      equal(byId(results, 'unknown-check').status, 'skip', '未注册检查应跳过')
      equal(byId(results, 'compile-java').status, 'skip', '无 gradlew 应跳过')
      equal(matchesPath('src/**/*.java', 'src/a/b/Ruby.java'), true, '通配符应匹配')
    },
  },
]

process.exitCode = await runSuite('24 · 检查器', cases)
