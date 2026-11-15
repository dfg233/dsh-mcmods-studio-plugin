/**
 * 群系/群落资料（`.mcstudio/biomes.json`）。
 *
 * P2 只存「意图与生成参数」，biome JSON 由模板生成。
 */

import { readJson, writeJson } from './registry.js'
import { catalogFile } from './paths.js'
import { touchMeta } from './meta.js'

export const BIOME_STATUS = ['planned', 'implementing', 'stable']

const BIOME_ID_RE = /^[a-z0-9_]{2,64}$/

function text(value, fallback = '') {
  return typeof value === 'string' ? value : fallback
}

function lines(value) {
  return Array.isArray(value) ? value.map((item) => String(item).trim()).filter(Boolean) : []
}

function number(value, fallback, min = 0, max = Number.MAX_SAFE_INTEGER) {
  return Number.isFinite(value) && value >= min && value <= max ? value : fallback
}

function now() {
  return new Date().toISOString()
}

export function normalizeBiome(raw = {}) {
  const id = text(raw.id).trim()
  if (!BIOME_ID_RE.test(id)) throw new Error('群系 id 只能使用小写字母、数字和下划线（2-64）')
  const spawns = Array.isArray(raw.spawns)
    ? raw.spawns
      .filter((item) => item && typeof item === 'object' && text(item.entity).trim())
      .map((item) => ({
        entity: text(item.entity).trim(),
        weight: number(item.weight, 10, 1),
        min: number(item.min, 1, 1),
        max: number(item.max, 4, 1),
      }))
    : []
  return {
    schemaVersion: 1,
    id,
    name: text(raw.name).trim() || id,
    temperature: number(raw.temperature, 0.5, -1, 2),
    downfall: number(raw.downfall, 0.5, 0, 1),
    features: lines(raw.features),
    spawns,
    status: BIOME_STATUS.includes(raw.status) ? raw.status : 'planned',
    notes: text(raw.notes),
    createdAt: text(raw.createdAt),
    updatedAt: text(raw.updatedAt),
  }
}

export async function listBiomes(projectPath) {
  const raw = await readJson(catalogFile(projectPath, 'biomes'), { biomes: [] })
  return Array.isArray(raw.biomes) ? raw.biomes.map((item) => normalizeBiome(item)) : []
}

export async function saveBiome(projectPath, biome = {}) {
  const entry = normalizeBiome(biome)
  const biomes = await listBiomes(projectPath)
  const index = biomes.findIndex((item) => item.id === entry.id)
  const stamp = now()
  if (index >= 0) {
    entry.createdAt = biomes[index].createdAt ?? stamp
    biomes[index] = { ...entry, createdAt: entry.createdAt, updatedAt: stamp }
  } else {
    entry.createdAt = stamp
    entry.updatedAt = stamp
    biomes.push(entry)
  }
  await writeJson(catalogFile(projectPath, 'biomes'), { schemaVersion: 1, biomes })
  await touchMeta(projectPath)
  return biomes.find((item) => item.id === entry.id)
}

export async function deleteBiome(projectPath, id) {
  const biomes = await listBiomes(projectPath)
  const next = biomes.filter((item) => item.id !== id)
  await writeJson(catalogFile(projectPath, 'biomes'), { schemaVersion: 1, biomes: next })
  await touchMeta(projectPath)
  return next
}
