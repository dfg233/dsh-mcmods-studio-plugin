/**
 * 战利品表（方块常规掉落）：`data/<modid>/loot_tables/blocks/<id>.json`。
 */

import { promises as fsp } from 'node:fs'
import { dirname, join } from 'node:path'

import { readJson, writeJson } from './registry.js'
import { readProjectMeta } from './meta.js'

function lootFile(projectPath, modid, id) {
  return join(projectPath, 'src/main/resources/data', modid, 'loot_tables/blocks', `${id}.json`)
}

export function buildLoot(modid, id, options = {}) {
  const min = Math.max(1, Number(options.min) || 1)
  const max = Math.max(min, Number(options.max) || min)
  const chance = Math.min(1, Math.max(0, Number.isFinite(Number(options.chance)) ? Number(options.chance) : 1))
  const entry = { type: 'minecraft:item', name: `${modid}:${id}` }
  if (min !== 1 || max !== 1) entry.functions = [{ function: 'minecraft:set_count', count: { min, max } }]
  const conditions = []
  if (chance < 1) conditions.push({ condition: 'minecraft:random_chance', chance })
  conditions.push({ condition: 'minecraft:survives_explosion' })
  return { type: 'minecraft:block', pools: [{ rolls: 1, entries: [entry], conditions }] }
}

export async function readLoot(projectPath, id) {
  const meta = await readProjectMeta(projectPath)
  if (!meta) throw new Error('项目不存在')
  const raw = await readJson(lootFile(projectPath, meta.modid, id), null)
  const entry = raw?.pools?.[0]?.entries?.[0]
  const fn = entry?.functions?.find((item) => item.function === 'minecraft:set_count')
  const chance = raw?.pools?.[0]?.conditions?.find((item) => item.condition === 'minecraft:random_chance')
  return {
    id,
    exists: Boolean(raw),
    min: fn?.count?.min ?? 1,
    max: fn?.count?.max ?? 1,
    chance: chance?.chance ?? 1,
    content: raw,
  }
}

export async function previewLoot(projectPath, id, options = {}) {
  const meta = await readProjectMeta(projectPath)
  if (!meta) throw new Error('项目不存在')
  const path = lootFile(projectPath, meta.modid, id)
  const current = await readJson(path, null)
  return { path, action: current ? 'update' : 'create', content: buildLoot(meta.modid, id, options) }
}

export async function saveLoot(projectPath, id, options = {}) {
  const preview = await previewLoot(projectPath, id, options)
  await fsp.mkdir(dirname(preview.path), { recursive: true })
  await writeJson(preview.path, preview.content)
  return { ...preview, saved: true }
}
