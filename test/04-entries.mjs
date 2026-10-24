/**
 * 用例 04：构想与物品的增删改查、字段纠偏、画布坐标。
 */

import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { equal, must, rejects, runSuite } from './helpers.mjs'

async function newProject(ws, modid = 'entrymod') {
  const dir = ws.path(modid)
  await ws.call('project.create', { path: dir, name: '条目测试', modid, loader: 'neoforge' })
  return dir
}

const cases = [
  {
    name: '构想新增、修改、删除',
    async run(ws) {
      const dir = await newProject(ws)

      const created = await ws.call('features.save', {
        path: dir, feature: { name: '宝石挖掘', description: '挖矿获得宝石', status: 'idea', priority: 'high' },
      })
      must(created.feature.id, '应生成 id')
      equal(created.feature.status, 'idea', '状态应保存')

      const updated = await ws.call('features.save', {
        path: dir, feature: { ...created.feature, status: 'done', name: '宝石挖掘（完成）' },
      })
      equal(updated.feature.id, created.feature.id, '同 id 应更新而非新增')
      equal(updated.feature.status, 'done', '状态应更新')

      const listed = await ws.call('features.list', { path: dir })
      equal(listed.features.length, 1, '更新后仍应只有 1 条')

      const removed = await ws.call('features.delete', { path: dir, id: created.feature.id })
      equal(removed.features.length, 0, '删除后应为空')
    },
  },
  {
    name: '构想列表按更新时间倒序',
    async run(ws) {
      const dir = await newProject(ws)
      const first = await ws.call('features.save', { path: dir, feature: { name: '第一条' } })
      await new Promise((resolve) => setTimeout(resolve, 5))
      await ws.call('features.save', { path: dir, feature: { name: '第二条' } })

      const listed = await ws.call('features.list', { path: dir })
      equal(listed.features[0].name, '第二条', '最新的应排在最前')
      must(listed.features.some((item) => item.id === first.feature.id), '应包含第一条')
    },
  },
  {
    name: '物品保存补全默认字段',
    async run(ws) {
      const dir = await newProject(ws)
      const saved = await ws.call('items.save', {
        path: dir, item: { id: 'ruby', displayName: '红宝石', type: 'material' },
      })

      equal(saved.item.properties.maxStackSize, 64, '默认堆叠应为 64')
      equal(saved.item.properties.rarity, 'common', '默认稀有度应为 common')
      equal(saved.item.canvas.x, 0, '默认画布 x 应为 0')
      must(saved.item.createdAt, '应带创建时间')
    },
  },
  {
    name: '物品 id 非法时拒绝保存',
    async run(ws) {
      const dir = await newProject(ws)
      await rejects(
        () => ws.call('items.save', { path: dir, item: { id: 'Ruby Sword', displayName: 'x' } }),
        '物品 id',
        '含空格与大写应被拒绝',
      )
    },
  },
  {
    name: '物品属性类型纠偏',
    async run(ws) {
      const dir = await newProject(ws)
      const saved = await ws.call('items.save', {
        path: dir,
        item: {
          id: 'coerce', displayName: '纠偏',
          properties: { maxStackSize: '16', maxDamage: '250', glint: 'true', itemTags: ['a', 'b'] },
        },
      })

      equal(saved.item.properties.maxStackSize, 16, '字符串数字应转 number')
      equal(saved.item.properties.maxDamage, 250, '字符串数字应转 number')
      equal(saved.item.properties.glint, true, '字符串 true 应转 boolean')
      equal(saved.item.properties.itemTags.length, 2, '标签数组应保留')
    },
  },
  {
    name: '画布坐标持久化',
    async run(ws) {
      const dir = await newProject(ws)
      await ws.call('items.save', {
        path: dir, item: { id: 'placed', displayName: '已放置', canvas: { x: 344, y: 152 } },
      })

      const reopened = await ws.call('project.open', { path: dir })
      const item = reopened.items.find((entry) => entry.id === 'placed')
      equal(item.canvas.x, 344, 'x 坐标应持久化')
      equal(item.canvas.y, 152, 'y 坐标应持久化')

      const raw = JSON.parse(await readFile(join(dir, '.mcstudio', 'items', 'placed.json'), 'utf8'))
      equal(raw.canvas.y, 152, '磁盘文件应保留坐标')
    },
  },
  {
    name: '保存物品自动补模型',
    async run(ws) {
      const dir = await newProject(ws)
      await ws.call('items.save', { path: dir, item: { id: 'auto', displayName: '自动模型' } })

      const assets = await ws.call('assets.list', { path: dir })
      must(assets.models.some((model) => model.id === 'auto'), '应自动生成模型')
    },
  },
  {
    name: 'ensureModel 可关闭',
    async run(ws) {
      const dir = await newProject(ws)
      await ws.call('items.save', {
        path: dir, item: { id: 'nofile', displayName: '不建模型' }, ensureModel: false,
      })

      const assets = await ws.call('assets.list', { path: dir })
      must(!assets.models.some((model) => model.id === 'nofile'), '不应生成模型')
    },
  },
  {
    name: '删除物品同时清理素材',
    async run(ws) {
      const dir = await newProject(ws)
      await ws.call('items.save', { path: dir, item: { id: 'gone', displayName: '待删' } })
      await ws.call('items.delete', { path: dir, id: 'gone' })

      const project = await ws.call('project.open', { path: dir })
      equal(project.items.length, 0, '物品应被删除')

      const assets = await ws.call('assets.list', { path: dir })
      must(!assets.models.some((model) => model.id === 'gone'), '模型应被清理')
    },
  },
  {
    name: '未打开项目时操作报错',
    async run(ws) {
      await rejects(
        () => ws.call('items.list', { path: ws.path('not-a-project') }),
        '不存在',
        '不存在的项目应报错',
      )
    },
  },
]

process.exitCode = await runSuite('04 · 构想与物品', cases)
