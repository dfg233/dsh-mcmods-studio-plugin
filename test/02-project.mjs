/**
 * 用例 02：项目创建、打开、元数据、工坊标记。
 */

import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { equal, must, rejects, runSuite } from './helpers.mjs'

const cases = [
  {
    name: '新建项目生成完整骨架',
    async run(ws) {
      const dir = ws.path('fresh')
      const project = await ws.call('project.create', {
        path: dir, name: '全新项目', modid: 'freshmod', version: '0.2.0', loader: 'neoforge',
      })

      equal(project.meta.modid, 'freshmod', 'modid 应写入')
      equal(project.meta.version, '0.2.0', '版本应写入')
      equal(project.meta.minecraft, '1.20.1', '目标版本应为 1.20.1')
      equal(project.meta.loader, 'neoforge', '加载器应写入')

      const meta = JSON.parse(await readFile(join(dir, '.mcstudio', 'project.json'), 'utf8'))
      equal(meta.schemaVersion, 1, '应带 schemaVersion')

      const marker = JSON.parse(await readFile(join(dir, '.mcstudio', 'studio.json'), 'utf8'))
      equal(marker.source, 'create', '标记来源应为 create')
      must(marker.projectId, '应生成 projectId')
      must(marker.importedAt, '应记录导入时间')

      const features = JSON.parse(await readFile(join(dir, '.mcstudio', 'features.json'), 'utf8'))
      equal(features.features.length, 0, '构想列表应为空')

      const readme = await readFile(join(dir, 'README.md'), 'utf8')
      must(readme.includes('freshmod'), 'README 应包含 modid')
    },
  },
  {
    name: '新建项目允许任意目录',
    async run(ws) {
      const outside = join(ws.base, 'outside-root', 'anywhere')
      const project = await ws.call('project.create', {
        path: outside, name: '任意目录', modid: 'anymod', loader: 'fabric',
      })
      must(project.path.includes('outside-root'), '应允许扫描根目录之外的位置')
      equal(project.meta.loader, 'fabric', '加载器应为 fabric')
    },
  },
  {
    name: '目标目录非空时拒绝创建',
    async run(ws) {
      const dir = ws.path('not-empty')
      await ws.write(join(dir, 'somefile.txt'), 'hi')
      await rejects(
        () => ws.call('project.create', { path: dir, name: 'x', modid: 'xxmod', loader: 'forge' }),
        '非空',
        '非空目录应拒绝',
      )
    },
  },
  {
    name: 'modid 非法时拒绝创建',
    async run(ws) {
      await rejects(
        () => ws.call('project.create', { path: ws.path('bad-id'), name: 'x', modid: 'Bad-Mod', loader: 'forge' }),
        'modid',
        '大写与连字符应被拒绝',
      )
    },
  },
  {
    name: '加载器不支持时拒绝创建',
    async run(ws) {
      await rejects(
        () => ws.call('project.create', { path: ws.path('bad-loader'), name: 'x', modid: 'badmod', loader: 'bukkit' }),
        '不支持的加载器',
        '未知加载器应拒绝',
      )
    },
  },
  {
    name: '打开项目返回完整数据',
    async run(ws) {
      const dir = ws.path('openable')
      await ws.call('project.create', { path: dir, name: '可打开', modid: 'openmod', loader: 'forge' })
      await ws.call('items.save', { path: dir, item: { id: 'gem', displayName: '宝石', type: 'material' } })

      const project = await ws.call('project.open', { path: dir })
      equal(project.path, dir, '应返回项目路径')
      equal(project.items.length, 1, '应带 1 个物品')
      equal(project.features.length, 0, '应带 0 条构想')
    },
  },
  {
    name: '打开不存在的目录报错',
    async run(ws) {
      await rejects(() => ws.call('project.open', { path: ws.path('nope') }), '不存在', '目录不存在应报错')
    },
  },
  {
    name: '打开非工坊目录报错',
    async run(ws) {
      const dir = ws.path('plain')
      await ws.write(join(dir, 'file.txt'), 'x')
      await rejects(() => ws.call('project.open', { path: dir }), '不是', '非工坊项目应报错')
    },
  },
  {
    name: 'saveMeta 合并字段而不覆盖',
    async run(ws) {
      const dir = ws.path('meta')
      await ws.call('project.create', { path: dir, name: '原始名', modid: 'metamod', version: '1.0.0', loader: 'neoforge' })
      const meta = await ws.call('project.saveMeta', { path: dir, patch: { version: '2.0.0' } })

      equal(meta.version, '2.0.0', '版本应更新')
      equal(meta.name, '原始名', '未传的字段应保留')
      equal(meta.modid, 'metamod', 'modid 应保留')
    },
  },
  {
    name: '老项目（无 studio.json）打开时自动补标记',
    async run(ws) {
      const dir = ws.path('legacy')
      await ws.call('project.create', { path: dir, name: '老项目', modid: 'legacymod', loader: 'forge' })

      const { rm } = await import('node:fs/promises')
      await rm(join(dir, '.mcstudio', 'studio.json'))

      await ws.call('projects.remove', { path: dir })
      const before = await ws.call('project.analyzeImport', { path: dir })
      equal(before.kind, 'orphan', '缺少标记且未登记时应为 orphan')

      await ws.call('project.open', { path: dir })
      const marker = JSON.parse(await readFile(join(dir, '.mcstudio', 'studio.json'), 'utf8'))
      equal(marker.source, 'open', '打开时应补写标记')
    },
  },
  {
    name: '重复创建同一目录被拒绝',
    async run(ws) {
      const dir = ws.path('dup')
      await ws.call('project.create', { path: dir, name: '第一次', modid: 'dupa', loader: 'forge' })
      await rejects(
        () => ws.call('project.create', { path: dir, name: '第二次', modid: 'dupb', loader: 'forge' }),
        '已经是工坊项目',
        '重复创建应拒绝',
      )
    },
  },
]

process.exitCode = await runSuite('02 · 项目管理', cases)
