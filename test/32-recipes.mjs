/**
 * 用例 32：配方扩展（切石 / 锻造 / 烟熏 / 营火）。
 */

import { equal, must, runSuite } from './helpers.mjs'

async function newProject(ws, modid = 'm32') {
  const dir = ws.path(modid)
  await ws.call('project.create', { path: dir, name: '配方测试', modid, loader: 'forge' })
  return dir
}

async function applyRecipe(ws, dir, id, recipe) {
  await ws.call('items.save', { path: dir, item: { id, displayName: id, type: 'item' } })
  await ws.call('content.apply', { path: dir, id, content: { recipe } })
  const read = await ws.call('content.get', { path: dir, id })
  return read.recipe
}

const cases = [
  {
    name: '石头切割配方',
    async run(ws) {
      const dir = await newProject(ws, 'recipe_stone')
      const recipe = await applyRecipe(ws, dir, 'ruby_stone', { type: 'stonecutting', ingredients: ['minecraft:stone'], count: 2 })
      equal(recipe.type, 'stonecutting', '类型')
      equal(recipe.count, 2, '产出数量')
      equal(recipe.ingredients[0], 'minecraft:stone', '材料')
    },
  },
  {
    name: '锻造配方',
    async run(ws) {
      const dir = await newProject(ws, 'recipe_smith')
      const recipe = await applyRecipe(ws, dir, 'ruby_smith', {
        type: 'smithing',
        ingredients: ['minecraft:netherite_upgrade_smithing_template', 'minecraft:diamond_sword', 'mymod:ruby'],
      })
      equal(recipe.type, 'smithing', '类型')
      equal(recipe.ingredients.length, 3, '三段材料')
    },
  },
  {
    name: '烟熏与营火配方',
    async run(ws) {
      const dir = await newProject(ws, 'recipe_cook')
      const smoking = await applyRecipe(ws, dir, 'ruby_smoke', { type: 'smoking', ingredients: ['minecraft:porkchop'], cookingTime: 100 })
      equal(smoking.type, 'smoking', '烟熏类型')
      equal(smoking.cookingTime, 100, '烟熏时间')
      const campfire = await applyRecipe(ws, dir, 'ruby_fire', { type: 'campfire', ingredients: ['minecraft:porkchop'], cookingTime: 600 })
      equal(campfire.type, 'campfire', '营火类型')
      equal(campfire.cookingTime, 600, '营火时间')
    },
  },
  {
    name: '配方模板渲染',
    async run(ws) {
      const dir = await newProject(ws, 'recipe_tpl')
      const result = await ws.call('template.render', {
        path: dir,
        id: 'stonecutting-recipe',
        params: { id: 'ruby_stone', result: 'ruby_stone', ingredient: 'minecraft:stone', count: 2 },
      })
      const file = result.files[0]
      must(file.path.includes('recipes/ruby_stone.json'), '配方文件路径')
      must(file.content.includes('minecraft:stonecutting'), '模板类型')
    },
  },
]

process.exitCode = await runSuite('32 · 配方扩展', cases)
