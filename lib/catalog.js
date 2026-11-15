/**
 * mod 资料分类与计数。
 *
 * 分类与客户端 MOD_CATEGORIES 保持一致；计数来自各分类的数据文件
 * （`.mcstudio/<分类>.json`，P1 只读，写入在各分类阶段实现）。
 */

import { readJson } from './registry.js'
import { catalogFile } from './paths.js'
import { listItems } from './entries.js'

export const MOD_CATEGORIES = [
  { id: 'item-block', label: '物品/方块', file: null },
  { id: 'entity', label: '生物/实体', file: 'entities' },
  { id: 'multiblock', label: '多方块结构', file: 'multiblocks' },
  { id: 'setting', label: '游戏设定', file: 'settings' },
  { id: 'biome', label: '群系/群落', file: 'biomes' },
  { id: 'enchantment', label: '附魔/魔咒', file: 'enchantments' },
  { id: 'worldgen', label: '自然生成', file: 'worldgen' },
  { id: 'dimension', label: '世界/维度', file: 'dimensions' },
  { id: 'effect', label: 'BUFF/DEBUFF', file: 'effects' },
  { id: 'keybind', label: '绑定热键', file: 'keybinds' },
]

async function countEntries(projectPath, name) {
  if (!name) return 0
  const raw = await readJson(catalogFile(projectPath, name), {})
  const list = Array.isArray(raw?.[name]) ? raw[name]
    : Array.isArray(raw?.entries) ? raw.entries
      : Array.isArray(raw?.items) ? raw.items
        : Object.values(raw ?? {}).find((value) => Array.isArray(value)) ?? []
  return list.length
}

/** 读取全部分类与计数。 */
export async function readCatalog(projectPath) {
  const items = await listItems(projectPath)
  const categories = []
  for (const category of MOD_CATEGORIES) {
    const count = category.id === 'item-block'
      ? items.length
      : await countEntries(projectPath, category.file)
    categories.push({ ...category, count })
  }
  return {
    categories,
    total: categories.reduce((sum, category) => sum + category.count, 0),
  }
}
