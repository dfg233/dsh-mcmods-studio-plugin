/**
 * 世界生成、维度与多方块资料（`.mcstudio/worldgen.json` / `dimensions.json` / `multiblocks.json`）。
 *
 * P3 只存意图与生成参数；JSON/Java 骨架由模板生成。
 */

import { readJson, writeJson } from './registry.js'
import { catalogFile } from './paths.js'
import { touchMeta } from './meta.js'

export const WORLDGEN_KINDS = ['structure', 'feature', 'jigsaw']
export const WORLDGEN_STATUS = ['planned', 'implementing', 'stable']

const ID_RE = /^[a-z0-9_]{2,64}$/

function text(value, fallback = '') {
  return typeof value === 'string' ? value : fallback
}

function lines(value) {
  return Array.isArray(value) ? value.map((item) => String(item).trim()).filter(Boolean) : []
}

function number(value, fallback, min = 0) {
  return Number.isFinite(value) && value >= min ? value : fallback
}

function now() {
  return new Date().toISOString()
}

function requireId(raw, label) {
  const id = text(raw.id).trim()
  if (!ID_RE.test(id)) throw new Error(`${label} id 只能使用小写字母、数字和下划线（2-64）`)
  return id
}

export function normalizeWorldgen(raw = {}) {
  const id = requireId(raw, '自然生成')
  return {
    schemaVersion: 1,
    id,
    kind: WORLDGEN_KINDS.includes(raw.kind) ? raw.kind : 'structure',
    name: text(raw.name).trim() || id,
    biomes: lines(raw.biomes),
    status: WORLDGEN_STATUS.includes(raw.status) ? raw.status : 'planned',
    notes: text(raw.notes),
    createdAt: text(raw.createdAt),
    updatedAt: text(raw.updatedAt),
  }
}

export function normalizeDimension(raw = {}) {
  const id = requireId(raw, '维度')
  const effects = raw.effects && typeof raw.effects === 'object' ? raw.effects : {}
  return {
    schemaVersion: 1,
    id,
    name: text(raw.name).trim() || id,
    effects: {
      sky: number(effects.sky, 7907327),
      fog: number(effects.fog, 12638463),
      water: number(effects.water, 4159204),
    },
    portalBlock: text(raw.portalBlock).trim(),
    status: WORLDGEN_STATUS.includes(raw.status) ? raw.status : 'planned',
    notes: text(raw.notes),
    createdAt: text(raw.createdAt),
    updatedAt: text(raw.updatedAt),
  }
}

export function normalizeMultiblock(raw = {}) {
  const id = requireId(raw, '多方块结构')
  const size = raw.size && typeof raw.size === 'object' ? raw.size : {}
  return {
    schemaVersion: 1,
    id,
    name: text(raw.name).trim() || id,
    size: {
      width: number(size.width, 3, 1),
      height: number(size.height, 3, 1),
      depth: number(size.depth, 3, 1),
    },
    trigger: text(raw.trigger).trim(),
    effect: text(raw.effect),
    status: WORLDGEN_STATUS.includes(raw.status) ? raw.status : 'planned',
    notes: text(raw.notes),
    createdAt: text(raw.createdAt),
    updatedAt: text(raw.updatedAt),
  }
}

function listOf(list, name, normalize) {
  const raw = list?.[name]
  return Array.isArray(raw) ? raw.map((item) => normalize(item)) : []
}

export async function listWorldgen(projectPath) {
  return listOf(await readJson(catalogFile(projectPath, 'worldgen'), { worldgen: [] }), 'worldgen', normalizeWorldgen)
}

export async function listDimensions(projectPath) {
  return listOf(await readJson(catalogFile(projectPath, 'dimensions'), { dimensions: [] }), 'dimensions', normalizeDimension)
}

export async function listMultiblocks(projectPath) {
  return listOf(await readJson(catalogFile(projectPath, 'multiblocks'), { multiblocks: [] }), 'multiblocks', normalizeMultiblock)
}

async function saveEntry(projectPath, file, key, list, entry) {
  const index = list.findIndex((item) => item.id === entry.id)
  const stamp = now()
  if (index >= 0) {
    entry.createdAt = list[index].createdAt ?? stamp
    list[index] = { ...entry, createdAt: entry.createdAt, updatedAt: stamp }
  } else {
    entry.createdAt = stamp
    entry.updatedAt = stamp
    list.push(entry)
  }
  await writeJson(catalogFile(projectPath, file), { schemaVersion: 1, [key]: list })
  await touchMeta(projectPath)
  return list.find((item) => item.id === entry.id)
}

async function deleteEntry(projectPath, file, key, list, id) {
  const next = list.filter((item) => item.id !== id)
  await writeJson(catalogFile(projectPath, file), { schemaVersion: 1, [key]: next })
  await touchMeta(projectPath)
  return next
}

export async function saveWorldgen(projectPath, entry = {}) {
  return saveEntry(projectPath, 'worldgen', 'worldgen', await listWorldgen(projectPath), normalizeWorldgen(entry))
}

export async function deleteWorldgen(projectPath, id) {
  return deleteEntry(projectPath, 'worldgen', 'worldgen', await listWorldgen(projectPath), id)
}

export async function saveDimension(projectPath, entry = {}) {
  return saveEntry(projectPath, 'dimensions', 'dimensions', await listDimensions(projectPath), normalizeDimension(entry))
}

export async function deleteDimension(projectPath, id) {
  return deleteEntry(projectPath, 'dimensions', 'dimensions', await listDimensions(projectPath), id)
}

export async function saveMultiblock(projectPath, entry = {}) {
  return saveEntry(projectPath, 'multiblocks', 'multiblocks', await listMultiblocks(projectPath), normalizeMultiblock(entry))
}

export async function deleteMultiblock(projectPath, id) {
  return deleteEntry(projectPath, 'multiblocks', 'multiblocks', await listMultiblocks(projectPath), id)
}
