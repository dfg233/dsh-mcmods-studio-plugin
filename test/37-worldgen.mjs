/**
 * 用例 37：自然生成、世界/维度与多方块。
 */

import { equal, must, runSuite } from './helpers.mjs'

async function newProject(ws, modid = 'm37') {
  const dir = ws.path(modid)
  await ws.call('project.create', { path: dir, name: '世界生成测试', modid, loader: 'forge' })
  return dir
}

const cases = [
  {
    name: '自然生成保存与删除',
    async run(ws) {
      const dir = await newProject(ws, 'worldgensave')
      const result = await ws.call('content.worldgen.save', {
        path: dir,
        worldgen: { id: 'ruby_ruins', name: '红宝石遗迹', kind: 'structure', biomes: ['ruby_cave'] },
      })
      equal(result.worldgen.kind, 'structure', '类型保存')
      equal(result.worldgen.biomes.length, 1, '生成群系保存')
      equal(result.worldgen.status, 'planned', '默认状态')
      const list = await ws.call('content.worldgen.list', { path: dir })
      equal(list.worldgen.length, 1, '列表读回')
      const deleted = await ws.call('content.worldgen.delete', { path: dir, id: 'ruby_ruins' })
      equal(deleted.worldgen.length, 0, '删除后为空')
    },
  },
  {
    name: '维度与多方块保存',
    async run(ws) {
      const dir = await newProject(ws, 'dimmulti')
      const dimension = await ws.call('content.dimension.save', {
        path: dir,
        dimension: { id: 'ruby_dim', name: '红宝石维度', portalBlock: 'ruby_block' },
      })
      equal(dimension.dimension.effects.sky, 7907327, '天空颜色默认')
      equal(dimension.dimension.portalBlock, 'ruby_block', '传送门方块')
      const multiblock = await ws.call('content.multiblock.save', {
        path: dir,
        multiblock: { id: 'ruby_altar', name: '红宝石祭坛', size: { width: 5 } },
      })
      equal(multiblock.multiblock.size.width, 5, '宽度保存')
      equal(multiblock.multiblock.size.height, 3, '高度默认')
      const list = await ws.call('content.multiblock.list', { path: dir })
      equal(list.multiblocks.length, 1, '多方块列表')
    },
  },
  {
    name: '世界生成模板渲染',
    async run(ws) {
      const dir = await newProject(ws, 'worldgentpl')
      const structure = await ws.call('template.render', {
        path: dir,
        id: 'structure-basic',
        params: { id: 'ruby_ruins', displayName: '红宝石遗迹' },
      })
      const structurePaths = structure.files.map((file) => file.path)
      must(structurePaths.some((path) => path.includes('worldgen/structure/ruby_ruins.json')), '应生成结构 JSON')
      must(structurePaths.some((path) => path.includes('template_pool/ruby_ruins_start.json')), '应生成拼图池')
      const dimension = await ws.call('template.render', {
        path: dir,
        id: 'dimension-basic',
        params: { id: 'ruby_dim', displayName: '红宝石维度', biome: 'ruby_cave' },
      })
      const dimensionPaths = dimension.files.map((file) => file.path)
      must(dimensionPaths.some((path) => path.includes('dimension_type/ruby_dim.json')), '应生成维度类型')
      const multiblock = await ws.call('template.render', {
        path: dir,
        id: 'multiblock-basic',
        params: { id: 'ruby_altar', displayName: '红宝石祭坛' },
      })
      const java = multiblock.files.find((file) => file.path.includes('Multiblock.java'))
      must(java.content.includes('isFormed'), '多方块骨架应含检测方法')
    },
  },
  {
    name: 'catalog 计入世界生成与维度',
    async run(ws) {
      const dir = await newProject(ws, 'worldgencatalog')
      await ws.call('content.worldgen.save', { path: dir, worldgen: { id: 'ruins' } })
      await ws.call('content.dimension.save', { path: dir, dimension: { id: 'dim' } })
      await ws.call('content.multiblock.save', { path: dir, multiblock: { id: 'altar' } })
      const catalog = await ws.call('content.catalog', { path: dir })
      equal(catalog.categories.find((item) => item.id === 'worldgen').count, 1, '自然生成计数')
      equal(catalog.categories.find((item) => item.id === 'dimension').count, 1, '维度计数')
      equal(catalog.categories.find((item) => item.id === 'multiblock').count, 1, '多方块计数')
    },
  },
]

process.exitCode = await runSuite('37 · 世界生成与维度', cases)
