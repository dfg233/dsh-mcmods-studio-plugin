/**
 * 构想与物品条目
 *
 * 两类条目的增删改查、字段补全与类型纠偏。
 */

import { promises as fsp } from 'node:fs'
import { join } from 'node:path'

import { isDirectory, readJson, writeJson } from './registry.js'
import { ITEM_FIELDS, ITEM_TYPES, FEATURE_STATUS, FEATURE_PRIORITY, defaultProperties } from './schema.js'
import { itemsDir, featuresFile, projectDataDir, isValidItemId } from './paths.js'
import { readProjectMeta, touchMeta } from './meta.js'

export async function listFeatures(projectPath) {
  const raw = await readJson(featuresFile(projectPath), { features: [] })
  const list = Array.isArray(raw.features) ? raw.features : []
  return [...list].sort((a, b) => String(b?.updatedAt ?? '').localeCompare(String(a?.updatedAt ?? '')))
}

/** 保存（新增或更新）一条功能。 */
export async function saveFeature(projectPath, feature) {
  const list = await listFeatures(projectPath)
  const now = new Date().toISOString()
  const entry = {
    id: typeof feature.id === 'string' && feature.id.trim() ? feature.id.trim() : `f_${Date.now()}`,
    name: String(feature.name ?? '').trim() || '未命名功能',
    description: String(feature.description ?? ''),
    status: FEATURE_STATUS.some((s) => s.id === feature.status) ? feature.status : 'idea',
    priority: FEATURE_PRIORITY.some((p) => p.id === feature.priority) ? feature.priority : 'medium',
    version: String(feature.version ?? ''),
    items: Array.isArray(feature.items) ? feature.items.map(String) : [],
    notes: String(feature.notes ?? ''),
    createdAt: '',
    updatedAt: now,
  }
  const idx = list.findIndex((f) => f.id === entry.id)
  if (idx >= 0) {
    entry.createdAt = list[idx].createdAt ?? now
    list[idx] = entry
  } else {
    entry.createdAt = now
    list.push(entry)
  }
  await writeJson(featuresFile(projectPath), { schemaVersion: 1, features: list })
  await touchMeta(projectPath)
  return entry
}

/** 删除一条功能。 */
export async function deleteFeature(projectPath, id) {
  const list = await listFeatures(projectPath)
  const next = list.filter((f) => f.id !== id)
  await writeJson(featuresFile(projectPath), { schemaVersion: 1, features: next })
  await touchMeta(projectPath)
  return next
}

export async function listItems(projectPath) {
  const dir = itemsDir(projectPath)
  const names = await fsp.readdir(dir).catch(() => [])
  const items = []
  for (const name of names) {
    if (!name.endsWith('.json')) continue
    const raw = await readJson(join(dir, name), null)
    if (!raw || typeof raw !== 'object') continue
    items.push(normalizeItem(raw, name.replace(/\.json$/, '')))
  }
  return items.sort((a, b) => a.id.localeCompare(b.id))
}

/** 统一物品结构。 */
export function normalizeItem(raw, fallbackId) {
  const properties = { ...defaultProperties() }
  if (raw.properties && typeof raw.properties === 'object') {
    for (const [key, value] of Object.entries(raw.properties)) {
      properties[key] = value
    }
  }
  return {
    schemaVersion: 1,
    id: typeof raw.id === 'string' && raw.id ? raw.id : fallbackId,
    displayName: typeof raw.displayName === 'string' && raw.displayName ? raw.displayName : fallbackId,
    type: ITEM_TYPES.some((t) => t.id === raw.type) ? raw.type : 'item',
    properties,
    tags: Array.isArray(raw.tags) ? raw.tags.map(String) : [],
    description: typeof raw.description === 'string' ? raw.description : '',
    notes: typeof raw.notes === 'string' ? raw.notes : '',
    canvas: {
      x: Number(raw.canvas?.x) || 0,
      y: Number(raw.canvas?.y) || 0,
    },
    createdAt: typeof raw.createdAt === 'string' ? raw.createdAt : '',
    updatedAt: typeof raw.updatedAt === 'string' ? raw.updatedAt : '',
  }
}

/** 保存物品。 */
export async function saveItem(projectPath, item) {
  const id = String(item.id ?? '').trim().toLowerCase()
  if (!isValidItemId(id)) throw new Error('物品 id 只能包含小写字母、数字和下划线，长度 1-64')

  const dir = itemsDir(projectPath)
  await fsp.mkdir(dir, { recursive: true })
  const file = join(dir, `${id}.json`)
  const previous = await readJson(file, null)
  const now = new Date().toISOString()

  const entry = normalizeItem(
    {
      ...item,
      id,
      createdAt: previous?.createdAt ?? now,
      updatedAt: now,
    },
    id,
  )
  // 属性值类型纠偏
  entry.properties = coerceProperties(entry.properties)
  await writeJson(file, entry)
  await touchMeta(projectPath)
  return entry
}

/**
 * 删除物品，并尽力清理它的贴图与模型文件。
 *
 * 素材删除失败不阻断条目删除：素材可能被其他条目共用，
 * 或者用户手工删过，这些情况都不应让主操作失败。
 */
export async function deleteItem(projectPath, id) {
  const file = join(itemsDir(projectPath), `${id}.json`)
  await fsp.rm(file, { force: true })

  const meta = await readProjectMeta(projectPath)
  const modid = meta?.modid ?? ''
  if (modid) {
    const assetsRoot = join(projectPath, 'src', 'main', 'resources', 'assets', modid)
    const fallbackRoot = join(projectDataDir(projectPath), 'assets', modid)
    const hasStandard = await isDirectory(join(projectPath, 'src', 'main', 'resources'))
    const root = hasStandard ? assetsRoot : fallbackRoot
    await fsp.rm(join(root, 'textures', 'item', `${id}.png`), { force: true }).catch(() => {})
    await fsp.rm(join(root, 'textures', 'block', `${id}.png`), { force: true }).catch(() => {})
    await fsp.rm(join(root, 'models', 'item', `${id}.json`), { force: true }).catch(() => {})
    await fsp.rm(join(root, 'models', 'block', `${id}.json`), { force: true }).catch(() => {})
    await fsp.rm(join(root, 'blockstates', `${id}.json`), { force: true }).catch(() => {})
  }

  await touchMeta(projectPath)
  return true
}

/** 按字段类型纠正属性值。 */
function coerceProperties(properties) {
  const out = { ...properties }
  for (const field of ITEM_FIELDS) {
    const value = out[field.key]
    if (field.type === 'number') {
      const num = Number(value)
      let next = Number.isFinite(num) ? num : field.default
      if (typeof field.min === 'number') next = Math.max(field.min, next)
      if (typeof field.max === 'number') next = Math.min(field.max, next)
      out[field.key] = next
    } else if (field.type === 'boolean') {
      out[field.key] = Boolean(value)
    } else if (field.type === 'tags') {
      out[field.key] = Array.isArray(value) ? value.map(String).filter(Boolean) : []
    } else if (field.type === 'select') {
      const allowed = field.options.map((o) => o.value)
      out[field.key] = allowed.includes(value) ? value : field.default
    } else {
      out[field.key] = typeof value === 'string' ? value : String(value ?? '')
    }
  }
  return out
}

/**
 * 读取项目完整数据。
 *
 * 放在本文件而非 meta.js：它同时需要元数据与两类条目，
 * 若放在 meta.js 会与 entries → meta 的依赖形成循环。
 */
export async function readProject(projectPath) {
  const meta = await readProjectMeta(projectPath)
  if (!meta) throw new Error('该目录不是「模组工坊」项目（缺少 .mcstudio/project.json）')
  return {
    path: projectPath,
    meta,
    features: await listFeatures(projectPath),
    items: await listItems(projectPath),
  }
}

