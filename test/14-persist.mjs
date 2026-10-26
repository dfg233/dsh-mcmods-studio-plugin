/**
 * 用例 14：项目切换持久化。
 *
 * 进入插件时应恢复上次打开的项目，而不是总打开列表第一个。
 * 这里验证：记住、恢复、失效路径、关闭清除、移除时清理。
 */

import { readFile } from 'node:fs/promises'
import { equal, must, runSuite } from './helpers.mjs'

/** 建若干项目。 */
async function makeProjects(ws, modids) {
  const out = []
  for (const modid of modids) {
    const dir = ws.path(modid)
    await ws.call('project.create', { path: dir, name: modid, modid, loader: 'neoforge' })
    out.push(dir)
  }
  return out
}

/** 读注册表原文。 */
async function readRegistryRaw(ws) {
  const { join } = await import('node:path')
  const raw = await readFile(join(ws.home, 'mcmods-studio', 'registry.json'), 'utf8')
  return JSON.parse(raw)
}

const cases = [
  {
    name: '首次启动 lastProject 为空',
    async run(ws) {
      const data = await ws.call('boot', {})
      equal(data.registry.lastProject, '', '没有记录时应为空')
    },
  },
  {
    name: '记住项目后 boot 能读回',
    async run(ws) {
      const [first, second] = await makeProjects(ws, ['modaa', 'modbb'])
      await ws.call('projects.remember', { path: second })

      const data = await ws.call('boot', {})
      equal(data.registry.lastProject, second, '应记住第二个项目')
      must(data.registry.lastProject !== first, '不应是第一个项目')
    },
  },
  {
    name: 'lastProject 写入注册表文件',
    async run(ws) {
      const [, second] = await makeProjects(ws, ['modcc', 'moddd'])
      await ws.call('projects.remember', { path: second })

      const raw = await readRegistryRaw(ws)
      must(typeof raw.lastProject === 'string', '注册表应含 lastProject 字段')
      must(raw.lastProject.endsWith('moddd'), '应写入第二个项目路径')
    },
  },
  {
    name: '切换到另一个项目会更新记录',
    async run(ws) {
      const [first, second] = await makeProjects(ws, ['modee', 'modff'])
      await ws.call('projects.remember', { path: first })
      equal((await ws.call('boot', {})).registry.lastProject, first, '应为第一个')

      await ws.call('projects.remember', { path: second })
      equal((await ws.call('boot', {})).registry.lastProject, second, '应切换为第二个')
    },
  },
  {
    name: '未登记的项目不会被记住',
    async run(ws) {
      await makeProjects(ws, ['modgg'])
      const stray = ws.path('not-registered')

      const result = await ws.call('projects.remember', { path: stray })
      equal(result.lastProject, '', '未登记路径应被忽略')
      equal((await ws.call('boot', {})).registry.lastProject, '', '不应写入注册表')
    },
  },
  {
    name: '传空字符串清除记录',
    async run(ws) {
      const [first] = await makeProjects(ws, ['modhh'])
      await ws.call('projects.remember', { path: first })
      equal((await ws.call('boot', {})).registry.lastProject, first, '先确认已记住')

      await ws.call('projects.remember', { path: '' })
      equal((await ws.call('boot', {})).registry.lastProject, '', '应被清除')
    },
  },
  {
    name: '移除项目时清理 lastProject',
    async run(ws) {
      const [first, second] = await makeProjects(ws, ['modii', 'modjj'])
      await ws.call('projects.remember', { path: second })

      await ws.call('projects.remove', { path: second })
      const data = await ws.call('boot', {})
      equal(data.registry.lastProject, '', '移除当前项目后应清空')
      must(
        data.registry.projects.some((project) => project.path === first),
        '其它项目不应受影响',
      )
    },
  },
  {
    name: '移除其它项目不影响记录',
    async run(ws) {
      const [first, second] = await makeProjects(ws, ['modkk', 'modll'])
      await ws.call('projects.remember', { path: first })

      await ws.call('projects.remove', { path: second })
      equal((await ws.call('boot', {})).registry.lastProject, first, '记录应保留')
    },
  },
  {
    name: '注册表里残留的无效路径被忽略',
    async run(ws) {
      const [first] = await makeProjects(ws, ['modmm'])
      // 手工写入一个不在列表里的 lastProject，模拟外部误改
      const { join } = await import('node:path')
      const regPath = join(ws.home, 'mcmods-studio', 'registry.json')
      const raw = JSON.parse(await readFile(regPath, 'utf8'))
      raw.lastProject = 'D:/nowhere/gone'
      await ws.write(regPath, JSON.stringify(raw, null, 2))

      const data = await ws.call('boot', {})
      equal(data.registry.lastProject, '', '无效路径应被视为空')
    },
  },
  {
    name: '旧注册表没有该字段也能正常读取',
    async run(ws) {
      const { join } = await import('node:path')
      await makeProjects(ws, ['modnn'])
      const regPath = join(ws.home, 'mcmods-studio', 'registry.json')
      const raw = JSON.parse(await readFile(regPath, 'utf8'))
      delete raw.lastProject
      await ws.write(regPath, JSON.stringify(raw, null, 2))

      const data = await ws.call('boot', {})
      equal(data.registry.lastProject, '', '缺字段应按空处理')
      equal(data.registry.projects.length, 1, '项目列表不应受影响')
    },
  },
]

process.exitCode = await runSuite('14 · 项目持久化', cases)
