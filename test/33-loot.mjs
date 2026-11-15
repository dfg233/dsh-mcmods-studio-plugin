/**
 * 用例 33：战利品表（方块常规掉落）。
 */

import { equal, must, runSuite } from './helpers.mjs'

async function newProject(ws, modid = 'm33') {
  const dir = ws.path(modid)
  await ws.call('project.create', { path: dir, name: '战利品测试', modid, loader: 'forge' })
  return dir
}

const cases = [
  {
    name: '预览与保存战利品表',
    async run(ws) {
      const dir = await newProject(ws, 'loot_save')
      const preview = await ws.call('content.loot.preview', {
        path: dir,
        id: 'ruby_block',
        options: { min: 1, max: 3, chance: 0.5 },
      })
      equal(preview.action, 'create', '首次为 create')
      equal(preview.content.pools[0].entries[0].functions[0].count.max, 3, '最大数量')
      const saved = await ws.call('content.loot.save', { path: dir, id: 'ruby_block', options: { min: 1, max: 3, chance: 0.5 } })
      must(saved.path.includes('ruby_block.json'), '路径正确')
      const read = await ws.call('content.loot.get', { path: dir, id: 'ruby_block' })
      equal(read.exists, true, '文件存在')
      equal(read.max, 3, '读回最大数量')
      equal(read.chance, 0.5, '读回几率')
    },
  },
  {
    name: '固定掉落与覆盖',
    async run(ws) {
      const dir = await newProject(ws, 'loot_fixed')
      await ws.call('content.loot.save', { path: dir, id: 'ruby_block' })
      const read = await ws.call('content.loot.get', { path: dir, id: 'ruby_block' })
      equal(read.min, 1, '最小数量默认')
      equal(read.max, 1, '最大数量默认')
      equal(read.chance, 1, '几率默认')
      const second = await ws.call('content.loot.preview', { path: dir, id: 'ruby_block', options: { min: 2, max: 2 } })
      equal(second.action, 'update', '已存在为 update')
    },
  },
  {
    name: '战利品表模板渲染',
    async run(ws) {
      const dir = await newProject(ws, 'loot_tpl')
      const result = await ws.call('template.render', {
        path: dir,
        id: 'loot-table',
        params: { id: 'ruby_block', min: 1, max: 3 },
      })
      const file = result.files[0]
      must(file.path.includes('loot_tables/blocks/ruby_block.json'), '模板路径')
      must(file.content.includes('minecraft:survives_explosion'), '含爆炸条件')
    },
  },
]

process.exitCode = await runSuite('33 · 战利品表', cases)
