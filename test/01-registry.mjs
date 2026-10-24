/**
 * 用例 01：注册表、扫描根目录、项目登记。
 */

import { equal, must, rejects, runSuite } from './helpers.mjs'

const cases = [
  {
    name: '首次启动使用默认扫描根目录',
    async run(ws) {
      const boot = await ws.call('boot', {})
      equal(boot.registry.projects.length, 0, '初始项目列表应为空')
      equal(boot.registry.root, 'D:\\program', '默认根目录应为 D:\\program')
      equal(boot.mcVersion, '1.20.1', '目标版本应为 1.20.1')
      equal(boot.schema.fields.length, 19, '物品字段应为 19 个')
    },
  },
  {
    name: '修改扫描根目录后持久化',
    async run(ws) {
      const result = await ws.call('registry.setRoot', { root: ws.root })
      equal(result.root, ws.root, '应返回新根目录')

      const boot = await ws.call('boot', {})
      equal(boot.registry.root, ws.root, '重新读取应保持新根目录')
      must(boot.registry.root !== 'D:\\program', '不应回落到默认值')
    },
  },
  {
    name: 'registry.setRoot 支持正斜杠路径',
    async run(ws) {
      const forward = ws.root.replace(/\\/g, '/')
      await ws.call('registry.setRoot', { root: forward })
      const boot = await ws.call('boot', {})
      must(boot.registry.root.includes('projects'), '应解析为绝对路径')
    },
  },
  {
    name: '项目登记后出现在列表中',
    async run(ws) {
      await ws.call('project.create', {
        path: ws.path('reg'), name: '登记测试', modid: 'regmod', loader: 'neoforge',
      })
      const boot = await ws.call('boot', {})
      equal(boot.registry.projects.length, 1, '应有 1 个项目')
      equal(boot.registry.projects[0].modid, 'regmod', 'modid 应被记录')
      equal(boot.registry.projects[0].isStudio, true, '应识别为工坊项目')
      equal(boot.registry.projects[0].missing, false, '目录应存在')
    },
  },
  {
    name: '移除登记不删除文件',
    async run(ws) {
      const dir = ws.path('gone')
      await ws.call('project.create', { path: dir, name: '移除测试', modid: 'gonemod', loader: 'forge' })
      await ws.call('projects.remove', { path: dir })

      const boot = await ws.call('boot', {})
      equal(boot.registry.projects.length, 0, '列表应清空')

      // 目录仍在，仍可被识别为工坊项目
      const info = await ws.call('project.analyzeImport', { path: dir })
      equal(info.kind, 'orphan', '应识别为已移除但保留数据的项目')
    },
  },
  {
    name: '目录被删后标记为 missing',
    async run(ws) {
      const dir = ws.path('deleted')
      await ws.call('project.create', { path: dir, name: '待删', modid: 'deletemod', loader: 'forge' })
      const { rm } = await import('node:fs/promises')
      await rm(dir, { recursive: true, force: true })

      const boot = await ws.call('boot', {})
      equal(boot.registry.projects[0].missing, true, '应标记目录缺失')
      equal(boot.registry.projects[0].isStudio, false, '缺失时不应识别为工坊项目')
    },
  },
  {
    name: '未知动作报错而非静默失败',
    async run(ws) {
      await rejects(() => ws.call('not.an.action', {}), '未知动作', '未知动作应抛错')
    },
  },
  {
    name: '注册表损坏时回退为空列表',
    async run(ws) {
      const { mkdir, writeFile } = await import('node:fs/promises')
      const { join } = await import('node:path')
      await mkdir(join(ws.home, 'mcmods-studio'), { recursive: true })
      await writeFile(join(ws.home, 'mcmods-studio', 'registry.json'), '{ 这不是合法 JSON')

      const boot = await ws.call('boot', {})
      equal(boot.registry.projects.length, 0, '应回退为空列表')
      must(typeof boot.registry.root === 'string', '应仍返回字符串根目录')
    },
  },
]

process.exitCode = await runSuite('01 · 注册表与路径', cases)
