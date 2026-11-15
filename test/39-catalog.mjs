/**
 * 用例 39：mod 资料分类与计数（content.catalog）。
 */

import { join } from 'node:path'

import { equal, must, runSuite } from './helpers.mjs'

async function newProject(ws, modid = 'm39') {
  const dir = ws.path(modid)
  await ws.call('project.create', { path: dir, name: '分类测试', modid, loader: 'forge' })
  return dir
}

const CATEGORY_IDS = ['item-block', 'entity', 'multiblock', 'setting', 'biome', 'enchantment', 'worldgen', 'dimension', 'effect', 'keybind']

const cases = [
  {
    name: '空项目返回 10 类且计数为 0',
    async run(ws) {
      const dir = await newProject(ws, 'catalog0')
      const catalog = await ws.call('content.catalog', { path: dir })
      equal(catalog.categories.length, 10, '应有 10 个分类')
      equal(catalog.total, 0, '总数应为 0')
      for (const id of CATEGORY_IDS) {
        const category = catalog.categories.find((item) => item.id === id)
        must(category, `应包含分类 ${id}`)
        equal(category.count, 0, `${id} 计数应为 0`)
      }
    },
  },
  {
    name: '物品计入物品/方块分类',
    async run(ws) {
      const dir = await newProject(ws, 'catalogitems')
      await ws.call('items.save', { path: dir, item: { id: 'ruby', displayName: 'Ruby', type: 'item' } })
      await ws.call('items.save', { path: dir, item: { id: 'ruby_sword', displayName: 'Ruby Sword', type: 'sword' } })
      const catalog = await ws.call('content.catalog', { path: dir })
      equal(catalog.categories.find((item) => item.id === 'item-block').count, 2, '物品计数应为 2')
      equal(catalog.total, 2, '总数应为 2')
    },
  },
  {
    name: '分类数据文件计入对应分类',
    async run(ws) {
      const dir = await newProject(ws, 'catalagentities')
      await ws.write(join(dir, '.mcstudio', 'entities.json'), JSON.stringify({ entities: [{ id: 'a' }, { id: 'b' }] }))
      await ws.write(join(dir, '.mcstudio', 'biomes.json'), JSON.stringify({ entries: [{ id: 'c' }] }))
      const catalog = await ws.call('content.catalog', { path: dir })
      equal(catalog.categories.find((item) => item.id === 'entity').count, 2, '实体计数应为 2')
      equal(catalog.categories.find((item) => item.id === 'biome').count, 1, '群系计数应为 1（entries 形态）')
      equal(catalog.total, 3, '总数应为 3')
    },
  },
  {
    name: 'content 工具支持 catalog',
    async run(ws) {
      const dir = await newProject(ws, 'catalogtool')
      const result = await ws.call('agent.call', { tool: 'content', args: { action: 'catalog', project: dir } })
      equal(result.categories.length, 10, '工具返回 10 类')
      equal(result.total, 0, '工具返回总数')
    },
  },
]

process.exitCode = await runSuite('39 · 资料分类', cases)
