/**
 * 用例 35：生物/实体资料与模板。
 */

import { equal, must, runSuite } from './helpers.mjs'

async function newProject(ws, modid = 'm35') {
  const dir = ws.path(modid)
  await ws.call('project.create', { path: dir, name: '实体测试', modid, loader: 'forge' })
  return dir
}

const cases = [
  {
    name: '实体保存与默认值',
    async run(ws) {
      const dir = await newProject(ws, 'entitysave')
      const result = await ws.call('content.entity.save', {
        path: dir,
        entity: { id: 'ruby_golem', name: '红宝石傀儡', category: 'monster', health: 40, attack: 6, biomes: ['ruby_cave'] },
      })
      equal(result.entity.health, 40, '生命保存')
      equal(result.entity.category, 'monster', '类别保存')
      equal(result.entity.spawnEgg.primary, '#5e3a1e', '刷怪蛋默认主色')
      equal(result.entity.biomes.length, 1, '生成群系保存')
      const list = await ws.call('content.entity.list', { path: dir })
      equal(list.entities.length, 1, '列表读回')
    },
  },
  {
    name: '实体 id 校验与删除',
    async run(ws) {
      const dir = await newProject(ws, 'entitybad')
      let message = ''
      try {
        await ws.call('content.entity.save', { path: dir, entity: { id: 'Bad ID' } })
      } catch (error) { message = error.message }
      must(message.includes('实体 id'), `应拒绝非法 id，实际「${message}」`)
      await ws.call('content.entity.save', { path: dir, entity: { id: 'zombie_x' } })
      const deleted = await ws.call('content.entity.delete', { path: dir, id: 'zombie_x' })
      equal(deleted.entities.length, 0, '删除后为空')
    },
  },
  {
    name: '实体模板渲染',
    async run(ws) {
      const dir = await newProject(ws, 'entitytpl')
      const result = await ws.call('template.render', {
        path: dir,
        id: 'entity-basic',
        params: { id: 'ruby_golem', displayName: '红宝石傀儡' },
      })
      const paths = result.files.map((file) => file.path)
      must(paths.some((path) => path.includes('entity/RubyGolem.java')), '应生成实体类')
      must(paths.some((path) => path.includes('lang/zh_cn.json')), '应生成语言文件')
      const java = result.files.find((file) => file.path.includes('entity/'))
      must(java.content.includes('extends Mob'), '实体骨架应继承 Mob')
    },
  },
  {
    name: 'catalog 计入实体',
    async run(ws) {
      const dir = await newProject(ws, 'entitycatalog')
      await ws.call('content.entity.save', { path: dir, entity: { id: 'golem' } })
      const catalog = await ws.call('content.catalog', { path: dir })
      equal(catalog.categories.find((item) => item.id === 'entity').count, 1, '实体计数')
    },
  },
]

process.exitCode = await runSuite('35 · 生物/实体', cases)
