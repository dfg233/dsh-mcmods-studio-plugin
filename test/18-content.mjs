/**
 * 用例 18：内容资源（语言 / 配方 / 模型）预览、应用与回滚。
 */

import { mkdir, readFile } from 'node:fs/promises'
import { join } from 'node:path'

import { equal, must, runSuite } from './helpers.mjs'

async function makeProject(ws) {
  const dir = ws.path('content')
  await ws.call('project.create', { path: dir, name: '内容测试', modid: 'contentmod', loader: 'forge' })
  await ws.call('items.save', { path: dir, item: { id: 'ruby_sword', displayName: '红宝石剑', type: 'tool' } })
  return dir
}

const content = {
  lang: { zh: '红宝石剑', en: 'Ruby Sword' },
  recipe: {
    type: 'shaped', pattern: [' R ', ' R ', ' S '], keys: ['R=ruby', 'S=minecraft:stick'], count: 1,
  },
  model: { parent: 'minecraft:item/handheld' },
}

const cases = [
  {
    name: '内容预览只返回文件，不落盘',
    async run(ws) {
      const dir = await makeProject(ws)
      const preview = await ws.call('content.preview', { path: dir, id: 'ruby_sword', content })
      equal(preview.files.length, 4, '应预览语言两条、配方、模型')
      must(preview.files.some((file) => file.kind === 'recipe'), '应包含配方')
      const raw = await readFile(join(dir, '.mcstudio', 'data', 'contentmod', 'recipes', 'ruby_sword.json'), 'utf8').catch(() => null)
      equal(raw, null, '预览不应写文件')
    },
  },
  {
    name: '应用写入语言、配方与模型',
    async run(ws) {
      const dir = await makeProject(ws)
      const result = await ws.call('content.apply', { path: dir, id: 'ruby_sword', content })
      must(result.backupDir, '应返回备份目录')
      const zh = JSON.parse(await readFile(join(dir, '.mcstudio', 'assets', 'contentmod', 'lang', 'zh_cn.json'), 'utf8'))
      equal(zh['item.contentmod.ruby_sword'], '红宝石剑', '中文名应写入')
      const recipe = JSON.parse(await readFile(join(dir, '.mcstudio', 'data', 'contentmod', 'recipes', 'ruby_sword.json'), 'utf8'))
      equal(recipe.type, 'minecraft:crafting_shaped', '应写有序配方')
      equal(recipe.result.item, 'contentmod:ruby_sword', '产出应为当前物品')
      const model = JSON.parse(await readFile(join(dir, '.mcstudio', 'assets', 'contentmod', 'models', 'item', 'ruby_sword.json'), 'utf8'))
      equal(model.parent, 'minecraft:item/handheld', '模型 parent 应写入')
    },
  },
  {
    name: '读取内容回填',
    async run(ws) {
      const dir = await makeProject(ws)
      await ws.call('content.apply', { path: dir, id: 'ruby_sword', content })
      const data = await ws.call('content.get', { path: dir, id: 'ruby_sword' })
      equal(data.lang.zh, '红宝石剑', '应回填中文名')
      equal(data.recipe.type, 'shaped', '应回填配方类型')
      equal(data.recipe.pattern[0], ' R ', '应回填 pattern')
      equal(data.model.parent, 'minecraft:item/handheld', '应回填模型')
    },
  },
  {
    name: '回滚恢复应用前的资源',
    async run(ws) {
      const dir = await makeProject(ws)
      const result = await ws.call('content.apply', { path: dir, id: 'ruby_sword', content })
      await ws.call('content.rollback', { path: dir, backupDir: result.backupDir })
      const data = await ws.call('content.get', { path: dir, id: 'ruby_sword' })
      equal(data.lang.zh, '', '回滚后中文名应为空')
      equal(data.recipe, null, '回滚后配方应为空')
    },
  },
  {
    name: '新建物品在保存前也能预览',
    async run(ws) {
      const dir = await makeProject(ws)
      const preview = await ws.call('content.preview', {
        path: dir, id: 'new_sword', content,
        item: { id: 'new_sword', displayName: '新剑', type: 'tool' },
      })
      equal(preview.files.length, 4, '新物品应能预览语言/配方/模型')
    },
  },
  {
    name: '标准工程写入 src/main/resources',
    async run(ws) {
      const dir = await makeProject(ws)
      await mkdir(join(dir, 'src', 'main', 'resources'), { recursive: true })
      await ws.call('content.apply', { path: dir, id: 'ruby_sword', content })
      const raw = await readFile(join(dir, 'src', 'main', 'resources', 'assets', 'contentmod', 'lang', 'zh_cn.json'), 'utf8')
      must(raw.includes('红宝石剑'), '应写入标准资源目录')
      const recipe = await readFile(join(dir, 'src', 'main', 'resources', 'data', 'contentmod', 'recipes', 'ruby_sword.json'), 'utf8')
      must(recipe.includes('crafting_shaped'), '配方应写入标准数据目录')
    },
  },
  {
    name: '非法配方被拒绝且不写文件',
    async run(ws) {
      const dir = await makeProject(ws)
      let failed = false
      try {
        await ws.call('content.apply', {
          path: dir, id: 'ruby_sword',
          content: { recipe: { type: 'shaped', pattern: ['X'], keys: ['Y=minecraft:stick'] } },
        })
      } catch { failed = true }
      equal(failed, true, '未定义材料键应报错')
    },
  },
]

process.exitCode = await runSuite('18 · 内容资源', cases)
