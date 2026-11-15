/**
 * 用例 36：群系/群落资料与模板。
 */

import { equal, must, runSuite } from './helpers.mjs'

async function newProject(ws, modid = 'm36') {
  const dir = ws.path(modid)
  await ws.call('project.create', { path: dir, name: '群系测试', modid, loader: 'forge' })
  return dir
}

const cases = [
  {
    name: '群系保存与默认值',
    async run(ws) {
      const dir = await newProject(ws, 'biomesave')
      const result = await ws.call('content.biome.save', {
        path: dir,
        biome: { id: 'ruby_cave', name: '红宝石洞窟', temperature: 0.8, downfall: 0.2, features: ['ruby_ore'], spawns: [{ entity: 'ruby_golem', weight: 20 }] },
      })
      equal(result.biome.temperature, 0.8, '温度保存')
      equal(result.biome.downfall, 0.2, '降水保存')
      equal(result.biome.features.length, 1, '特征保存')
      equal(result.biome.spawns[0].max, 4, '生成数量默认值')
      const list = await ws.call('content.biome.list', { path: dir })
      equal(list.biomes.length, 1, '列表读回')
    },
  },
  {
    name: '群系 id 校验与删除',
    async run(ws) {
      const dir = await newProject(ws, 'biomebad')
      let message = ''
      try {
        await ws.call('content.biome.save', { path: dir, biome: { id: 'Bad Biome' } })
      } catch (error) { message = error.message }
      must(message.includes('群系 id'), `应拒绝非法 id，实际「${message}」`)
      await ws.call('content.biome.save', { path: dir, biome: { id: 'plain_x' } })
      const deleted = await ws.call('content.biome.delete', { path: dir, id: 'plain_x' })
      equal(deleted.biomes.length, 0, '删除后为空')
    },
  },
  {
    name: '群系模板渲染',
    async run(ws) {
      const dir = await newProject(ws, 'biometpl')
      const result = await ws.call('template.render', {
        path: dir,
        id: 'biome-basic',
        params: { id: 'ruby_cave', displayName: '红宝石洞窟', temperature: 0.8, downfall: 0.2 },
      })
      const paths = result.files.map((file) => file.path)
      must(paths.some((path) => path.includes('worldgen/biome/ruby_cave.json')), '应生成 biome JSON')
      const json = result.files.find((file) => file.path.includes('biome/'))
      must(json.content.includes('"temperature": 0.8'), '温度应写入')
    },
  },
  {
    name: 'catalog 计入群系',
    async run(ws) {
      const dir = await newProject(ws, 'biomecatalog')
      await ws.call('content.biome.save', { path: dir, biome: { id: 'cave_x' } })
      const catalog = await ws.call('content.catalog', { path: dir })
      equal(catalog.categories.find((item) => item.id === 'biome').count, 1, '群系计数')
    },
  },
]

process.exitCode = await runSuite('36 · 群系/群落', cases)
