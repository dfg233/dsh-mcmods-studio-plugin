/**
 * 生物/实体资料（`.mcstudio/entities.json`）。
 *
 * P2 只存「意图与生成参数」，Java 骨架由模板生成。
 */

import { readJson, writeJson } from './registry.js'
import { catalogFile } from './paths.js'
import { touchMeta } from './meta.js'

export const ENTITY_CATEGORIES = ['monster', 'animal', 'ambient', 'water', 'other']
export const ENTITY_STATUS = ['planned', 'implementing', 'stable']

const ENTITY_ID_RE = /^[a-z0-9_]{2,64}$/

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

function color(value, fallback) {
  return /^#[0-9a-fA-F]{6}$/.test(text(value)) ? text(value) : fallback
}

export function normalizeEntity(raw = {}) {
  const id = text(raw.id).trim()
  if (!ENTITY_ID_RE.test(id)) throw new Error('实体 id 只能使用小写字母、数字和下划线（2-64）')
  return {
    schemaVersion: 1,
    id,
    name: text(raw.name).trim() || id,
    category: ENTITY_CATEGORIES.includes(raw.category) ? raw.category : 'monster',
    width: number(raw.width, 0.6, 0.05),
    height: number(raw.height, 1.8, 0.05),
    health: number(raw.health, 20, 1),
    attack: number(raw.attack, 2, 0),
    spawnEgg: {
      primary: color(raw.spawnEgg?.primary, '#5e3a1e'),
      secondary: color(raw.spawnEgg?.secondary, '#c8a06a'),
    },
    biomes: lines(raw.biomes),
    status: ENTITY_STATUS.includes(raw.status) ? raw.status : 'planned',
    notes: text(raw.notes),
    createdAt: text(raw.createdAt),
    updatedAt: text(raw.updatedAt),
  }
}

export async function listEntities(projectPath) {
  const raw = await readJson(catalogFile(projectPath, 'entities'), { entities: [] })
  return Array.isArray(raw.entities) ? raw.entities.map((item) => normalizeEntity(item)) : []
}

export async function saveEntity(projectPath, entity = {}) {
  const entry = normalizeEntity(entity)
  const entities = await listEntities(projectPath)
  const index = entities.findIndex((item) => item.id === entry.id)
  const stamp = now()
  if (index >= 0) {
    entry.createdAt = entities[index].createdAt ?? stamp
    entities[index] = { ...entry, createdAt: entry.createdAt, updatedAt: stamp }
  } else {
    entry.createdAt = stamp
    entry.updatedAt = stamp
    entities.push(entry)
  }
  await writeJson(catalogFile(projectPath, 'entities'), { schemaVersion: 1, entities })
  await touchMeta(projectPath)
  return entities.find((item) => item.id === entry.id)
}

export async function deleteEntity(projectPath, id) {
  const entities = await listEntities(projectPath)
  const next = entities.filter((item) => item.id !== id)
  await writeJson(catalogFile(projectPath, 'entities'), { schemaVersion: 1, entities: next })
  await touchMeta(projectPath)
  return next
}
