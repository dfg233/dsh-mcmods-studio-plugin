/**
 * 模组项目的数据层。
 *
 * 一个「模组项目」就是一个目录。插件数据放在项目根下的 `.mcstudio/` 隐藏目录里，
 * 这样导入已有的 gradle 工程时不会打乱它的目录结构：
 *
 *   <project>/
 *     .mcstudio/
 *       project.json     # 项目元数据（名称、modid、版本、目标加载器）
 *       features.json    # 模组功能列表
 *       items/<id>.json  # 每个物品一份属性文档
 *     docs/              # 插件导出的 markdown 文档
 *
 * 目标平台固定为 Minecraft 1.20.1，加载器支持 Forge / NeoForge / Fabric。
 */

import { promises as fsp } from 'node:fs'
import { basename, join, relative, resolve } from 'node:path'

import {
  expandPath,
  isDirectory,
  isFile,
  isInside,
  readJson,
  readRegistry,
  writeJson,
  writeText,
} from './registry.js'
import { readGradleProperties } from './gradle.js'

/** 插件数据目录名（项目根下）。 */
export const DATA_DIR = '.mcstudio'

/** 首版固定支持的 Minecraft 版本。 */
export const MC_VERSION = '1.20.1'

/** 支持的模组加载器。 */
export const LOADERS = [
  { id: 'forge', label: 'Forge', note: 'MinecraftForge 47.x（1.20.1）' },
  { id: 'neoforge', label: 'NeoForge', note: 'NeoForge 47.1.x（1.20.1）' },
  { id: 'fabric', label: 'Fabric', note: 'Fabric Loader 0.15.x + Fabric API' },
]

/** 功能状态。 */
export const FEATURE_STATUS = [
  { id: 'idea', label: '构思', tone: 'idle' },
  { id: 'planning', label: '规划中', tone: 'warn' },
  { id: 'implementing', label: '实现中', tone: 'brand' },
  { id: 'done', label: '已完成', tone: 'success' },
]

/** 优先级。 */
export const FEATURE_PRIORITY = [
  { id: 'high', label: '高' },
  { id: 'medium', label: '中' },
  { id: 'low', label: '低' },
]

/** 物品类型。 */
export const ITEM_TYPES = [
  { id: 'item', label: '普通物品' },
  { id: 'block', label: '方块' },
  { id: 'tool', label: '工具' },
  { id: 'weapon', label: '武器' },
  { id: 'armor', label: '盔甲' },
  { id: 'food', label: '食物' },
  { id: 'material', label: '材料' },
]

/**
 * 物品属性字段定义。
 *
 * Host 侧用于生成默认值与校验，Client 侧通过 `schema` 动作获取同一份定义来渲染表单，
 * 保证两边字段永远一致。
 */
export const ITEM_FIELDS = [
  // ── 基础属性 ──────────────────────────────────────────────
  {
    key: 'maxStackSize', label: '最大堆叠', type: 'number', group: '基础属性',
    default: 64, min: 1, max: 64, unit: '个',
    hint: '同一格中最多堆叠的数量。工具/盔甲通常为 1。',
  },
  {
    key: 'rarity', label: '稀有度', type: 'select', group: '基础属性', default: 'common',
    options: [
      { value: 'common', label: '普通' },
      { value: 'uncommon', label: '少见（黄字）' },
      { value: 'rare', label: '稀有（蓝字）' },
      { value: 'epic', label: '史诗（紫字）' },
    ],
    hint: '决定物品名称颜色与掉落修饰。',
  },
  {
    key: 'creativeTab', label: '创造模式分类', type: 'text', group: '基础属性', default: '',
    hint: '例如 mymod.items；留空表示不进入创造模式物品栏。',
  },
  {
    key: 'renderType', label: '渲染模型', type: 'select', group: '基础属性', default: 'generated',
    options: [
      { value: 'generated', label: 'item/generated（平面贴图）' },
      { value: 'handheld', label: 'item/handheld（手持工具）' },
      { value: 'block', label: '方块模型' },
      { value: 'custom', label: '自定义 JSON' },
    ],
    hint: '决定 models/item/<id>.json 使用的父模型。',
  },
  {
    key: 'glint', label: '附魔光效', type: 'boolean', group: '基础属性', default: false,
    hint: '是否始终带有附魔光效。',
  },
  // ── 数值属性 ──────────────────────────────────────────────
  {
    key: 'maxDamage', label: '最大耐久', type: 'number', group: '数值属性',
    default: 0, min: 0, max: 100000, unit: '点',
    hint: '0 表示不可损坏。工具/武器/盔甲通常大于 0。',
  },
  {
    key: 'enchantability', label: '附魔能力', type: 'number', group: '数值属性',
    default: 0, min: 0, max: 100,
    hint: '越高越容易获得好附魔。0 表示不可附魔。',
  },
  {
    key: 'repairMaterial', label: '修复材料', type: 'text', group: '数值属性', default: '',
    hint: '例如 minecraft:iron_ingot。留空表示不可修复。',
  },
  {
    key: 'burnTime', label: '燃烧时间', type: 'number', group: '数值属性',
    default: 0, min: 0, max: 100000, unit: 'tick',
    hint: '作为燃料时的燃烧时长（20 tick = 1 秒）。0 表示不可燃烧。',
  },
  // ── 行为属性 ──────────────────────────────────────────────
  {
    key: 'toolTier', label: '工具等级', type: 'select', group: '行为属性', default: 'none',
    options: [
      { value: 'none', label: '无' },
      { value: 'wood', label: '木' },
      { value: 'stone', label: '石' },
      { value: 'iron', label: '铁' },
      { value: 'gold', label: '金' },
      { value: 'diamond', label: '钻石' },
      { value: 'netherite', label: '下界合金' },
    ],
    hint: '决定采集等级与工具耐久倍率。',
  },
  {
    key: 'miningLevel', label: '采集等级', type: 'number', group: '行为属性',
    default: 0, min: 0, max: 5,
    hint: '0=木 1=石 2=铁 3=钻石 4=下界合金。',
  },
  {
    key: 'attackDamage', label: '攻击伤害', type: 'number', group: '行为属性',
    default: 0, min: 0, max: 100, unit: '点',
    hint: '作为武器时的额外攻击力。',
  },
  {
    key: 'attackSpeed', label: '攻击速度', type: 'number', group: '行为属性',
    default: 0, step: 0.1, unit: '倍',
    hint: '例如 1.6 表示剑的标准攻速；0 表示不加成。',
  },
  {
    key: 'armor', label: '护甲值', type: 'number', group: '行为属性',
    default: 0, min: 0, max: 30, unit: '点',
    hint: '作为盔甲时提供的护甲点数。',
  },
  {
    key: 'foodNutrition', label: '食物恢复值', type: 'number', group: '行为属性',
    default: 0, min: 0, max: 20, unit: '点',
    hint: '每口恢复的饥饿值（鸡腿）。0 表示不可食用。',
  },
  {
    key: 'foodSaturation', label: '食物饱和度', type: 'number', group: '行为属性',
    default: 0, min: 0, step: 0.1,
    hint: '每口恢复的饱和度修正值。',
  },
  // ── 标签 ──────────────────────────────────────────────────
  {
    key: 'itemTags', label: '物品标签', type: 'tags', group: '标签属性', default: [],
    hint: '例如 minecraft:planks、c:gems。用于配方与模组联动。',
  },
  {
    key: 'blockTags', label: '方块标签', type: 'tags', group: '标签属性', default: [],
    hint: '仅方块类物品使用，例如 minecraft:mineable/pickaxe。',
  },
  // ── 兼容 ──────────────────────────────────────────────────
  {
    key: 'loaderNotes', label: '加载器差异备注', type: 'textarea', group: '兼容性', default: '',
    hint: '记录 Forge / NeoForge / Fabric 之间的注册方式或 API 差异。',
  },
]

/** 取字段定义表（供 API 与导出使用）。 */
export function itemSchema() {
  return {
    fields: ITEM_FIELDS,
    types: ITEM_TYPES,
    statuses: FEATURE_STATUS,
    priorities: FEATURE_PRIORITY,
    loaders: LOADERS,
    mcVersion: MC_VERSION,
  }
}

/** 按字段定义生成一份默认属性。 */
export function defaultProperties() {
  const out = {}
  for (const field of ITEM_FIELDS) {
    out[field.key] = Array.isArray(field.default) ? [...field.default] : field.default
  }
  return out
}

/** 项目数据目录。 */
export function projectDataDir(projectPath) {
  return join(projectPath, DATA_DIR)
}

/** 项目元数据文件。 */
export function projectMetaFile(projectPath) {
  return join(projectDir(projectPath), 'project.json')
}

function projectDir(projectPath) {
  return projectDataDir(projectPath)
}

/** 物品目录。 */
export function itemsDir(projectPath) {
  return join(projectDataDir(projectPath), 'items')
}

/** 功能列表文件。 */
export function featuresFile(projectPath) {
  return join(projectDataDir(projectPath), 'features.json')
}

/** 项目文档目录。 */
export function docsDir(projectPath) {
  return join(projectPath, 'docs')
}

/** 工坊标记文件名（位于 `.mcstudio/` 下）。 */
export const STUDIO_MARKER = 'studio.json'

/** 工坊标记文件路径：存在即表示该项目已被本插件接管。 */
export function studioMarkerFile(projectPath) {
  return join(projectDataDir(projectPath), STUDIO_MARKER)
}

/** 读取工坊标记；不存在或损坏时返回 null。 */
export async function readStudioMarker(projectPath) {
  const raw = await readJson(studioMarkerFile(projectPath), null)
  if (!raw || typeof raw !== 'object') return null
  return {
    schemaVersion: Number(raw.schemaVersion) || 1,
    projectId: typeof raw.projectId === 'string' ? raw.projectId : '',
    importedAt: typeof raw.importedAt === 'string' ? raw.importedAt : '',
    importedBy: typeof raw.importedBy === 'string' ? raw.importedBy : '',
    source: typeof raw.source === 'string' ? raw.source : '',
    path: typeof raw.path === 'string' ? raw.path : '',
    mcVersion: typeof raw.mcVersion === 'string' ? raw.mcVersion : MC_VERSION,
  }
}

/**
 * 写入工坊标记。
 * 首次写入生成 projectId 与 importedAt，之后只更新传入的字段，不覆盖首次导入时间。
 */
export async function writeStudioMarker(projectPath, patch = {}) {
  const previous = await readStudioMarker(projectPath)
  const now = new Date().toISOString()
  const marker = {
    schemaVersion: 1,
    projectId: previous?.projectId || `p_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`,
    importedAt: previous?.importedAt || now,
    importedBy: previous?.importedBy || 'dsh-mcmods-studio-plugin',
    source: previous?.source || String(patch.source ?? ''),
    path: projectPath,
    mcVersion: MC_VERSION,
    ...patch,
  }
  await writeJson(studioMarkerFile(projectPath), marker)
  return marker
}

/** 确保标记存在（老项目迁移用）；返回标记对象。 */
export async function ensureStudioMarker(projectPath, source = 'migrate') {
  const existing = await readStudioMarker(projectPath)
  if (existing) return existing
  return writeStudioMarker(projectPath, { source })
}

/** 校验 modid 是否合法（小写字母、数字、下划线）。 */
export function isValidModId(id) {
  return typeof id === 'string' && /^[a-z0-9_]{2,64}$/.test(id)
}

/** 校验物品 id 是否合法。 */
export function isValidItemId(id) {
  return typeof id === 'string' && /^[a-z0-9_]{1,64}$/.test(id)
}

/** 规范化项目路径：绝对路径且必须存在。 */
export async function requireProjectPath(input) {
  const path = expandPath(input)
  if (!path) throw new Error('项目路径为空')
  if (!(await isDirectory(path))) throw new Error(`项目目录不存在：${path}`)
  return path
}

/** 读取项目元数据；不是工坊项目时返回 null。 */
export async function readProjectMeta(projectPath) {
  const file = projectMetaFile(projectPath)
  const raw = await readJson(file, null)
  if (!raw || typeof raw !== 'object') return null
  const str = (key, fallback = '') => (typeof raw[key] === 'string' ? raw[key] : fallback)
  return {
    schemaVersion: 1,
    name: str('name', basename(projectPath)),
    modid: str('modid'),
    version: str('version', '0.1.0'),
    description: str('description'),
    loader: LOADERS.some((l) => l.id === raw.loader) ? raw.loader : 'neoforge',
    minecraft: str('minecraft', MC_VERSION),
    // 以下字段来自 gradle.properties 或描述文件，可留空
    authors: str('authors'),
    license: str('license'),
    group: str('group'),
    minecraftRange: str('minecraftRange'),
    loaderVersion: str('loaderVersion'),
    loaderRange: str('loaderRange'),
    source: str('source'),
    createdAt: str('createdAt'),
    updatedAt: str('updatedAt'),
  }
}

/** 判断一个目录是否是工坊项目。 */
export async function isStudioProject(projectPath) {
  return (await readProjectMeta(projectPath)) !== null
}

/**
 * 判断一个目录是否已在项目列表（注册表）中。
 *
 * 与 `isStudioProject` 的区别：后者看目录里有没有 `project.json`，
 * 前者看插件是否登记了它。用户从列表移除后，目录仍是工坊项目，
 * 但不再「已登记」——导入时要走添加流程而不是报错。
 */
export async function isRegisteredProject(projectPath) {
  const registry = await readRegistry()
  const normalize = (value) => String(value || '').replace(/[\\/]+$/, '').toLowerCase()
  const target = normalize(expandPath(projectPath))
  return registry.projects.some((item) => normalize(item.path) === target)
}

/** 读取项目完整数据。 */
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

// ── 项目创建 ────────────────────────────────────────────────

/**
 * 创建一个新的工坊项目目录。
 *
 * 只创建 `.mcstudio/` 数据目录与 `docs/`，不生成任何 gradle 或 Java 代码：
 * 首版定位是设计工作台，工程构建交给用户的 IDE。
 */
export async function createProject(input) {
  const path = expandPath(input.path)
  if (!path) throw new Error('项目路径为空')
  const name = String(input.name ?? '').trim() || basename(path)
  const modid = String(input.modid ?? '').trim().toLowerCase()
  const loader = String(input.loader ?? 'neoforge')
  if (!isValidModId(modid)) throw new Error('modid 只能包含小写字母、数字和下划线，长度 2-64')
  if (!LOADERS.some((l) => l.id === loader)) throw new Error(`不支持的加载器：${loader}`)

  const existed = await isDirectory(path)
  if (existed) {
    const meta = await readProjectMeta(path)
    if (meta) throw new Error(`该目录已经是工坊项目：${meta.name}`)
    const entries = await fsp.readdir(path).catch(() => [])
    if (entries.length > 0) {
      throw new Error('目标目录非空。新建项目请选择一个空目录或尚不存在的路径。')
    }
  }

  await fsp.mkdir(projectDataDir(path), { recursive: true })
  await fsp.mkdir(join(projectDataDir(path), 'items'), { recursive: true })
  await fsp.mkdir(docsDir(path), { recursive: true })

  const now = new Date().toISOString()
  const meta = {
    schemaVersion: 1,
    name,
    modid,
    version: String(input.version ?? '').trim() || '0.1.0',
    description: String(input.description ?? '').trim(),
    loader,
    minecraft: MC_VERSION,
    createdAt: now,
    updatedAt: now,
  }
  await writeJson(projectMetaFile(path), meta)
  await writeJson(featuresFile(path), { schemaVersion: 1, features: [] })
  await writeStudioMarker(path, { source: 'create' })

  await writeText(
    join(path, 'README.md'),
    [
      `# ${name}`,
      '',
      `- modid：\`${modid}\``,
      `- 目标版本：Minecraft ${MC_VERSION} / ${loader}`,
      `- 版本：${meta.version}`,
      '',
      '> 本项目的设计数据（功能列表、物品属性、贴图模型）由「模组工坊」DSH 插件管理，',
      `> 存放于 \`.mcstudio/\` 目录；导出的文档在 \`docs/\` 目录。`,
      '',
      '## 目录说明',
      '',
      '| 路径 | 说明 |',
      '| --- | --- |',
      '| `.mcstudio/project.json` | 项目元数据 |',
      '| `.mcstudio/features.json` | 模组功能列表 |',
      '| `.mcstudio/items/*.json` | 物品属性文档（每物品一份） |',
      '| `docs/` | 插件导出的 Markdown 文档 |',
      '',
    ].join('\n'),
  )

  return readProject(path)
}

// ── 功能列表 ────────────────────────────────────────────────

/** 读取功能列表。 */
export async function listFeatures(projectPath) {
  const raw = await readJson(featuresFile(projectPath), { features: [] })
  return Array.isArray(raw.features) ? raw.features : []
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

// ── 物品 ────────────────────────────────────────────────────

/** 读取全部物品（按 id 排序）。 */
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

/** 删除物品。 */
export async function deleteItem(projectPath, id) {
  const file = join(itemsDir(projectPath), `${id}.json`)
  await fsp.rm(file, { force: true })
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

/** 触达项目元数据的 updatedAt。 */
export async function touchMeta(projectPath) {
  const meta = await readProjectMeta(projectPath)
  if (!meta) return
  meta.updatedAt = new Date().toISOString()
  await writeJson(projectMetaFile(projectPath), meta)
}

/** 更新项目元数据。 */
export async function saveProjectMeta(projectPath, patch) {
  const meta = await readProjectMeta(projectPath)
  if (!meta) throw new Error('项目不存在')
  if (patch.name !== undefined) meta.name = String(patch.name)
  if (patch.version !== undefined) meta.version = String(patch.version)
  if (patch.description !== undefined) meta.description = String(patch.description)
  if (patch.loader !== undefined) {
    if (!LOADERS.some((l) => l.id === patch.loader)) throw new Error('不支持的加载器')
    meta.loader = patch.loader
  }
  if (patch.modid !== undefined) {
    if (!isValidModId(patch.modid)) throw new Error('modid 非法')
    meta.modid = String(patch.modid)
  }
  meta.updatedAt = new Date().toISOString()
  await writeJson(projectMetaFile(projectPath), meta)
  return meta
}

// ── 工程扫描与导入 ──────────────────────────────────────────

/** 扫描根目录下的候选项目（一级子目录）。 */
export async function scanCandidates(root) {
  const base = expandPath(root)
  if (!(await isDirectory(base))) throw new Error(`根目录不存在：${base}`)
  const names = await fsp.readdir(base, { withFileTypes: true })
  const out = []
  for (const entry of names) {
    if (!entry.isDirectory()) continue
    const path = join(base, entry.name)
    const studio = await isStudioProject(path)
    const marker = await readStudioMarker(path)
    const gradle = (await isFile(join(path, 'build.gradle'))) || (await isFile(join(path, 'build.gradle.kts')))
    const detected = await detectDescriptor(path)
    if (!studio && !gradle && !detected) continue
    out.push({
      path,
      name: detected?.name || (studio ? (await readProjectMeta(path))?.name : '') || entry.name,
      modid: detected?.modid || '',
      loader: detected?.loader || '',
      kind: studio ? 'studio' : detected ? 'mod' : 'gradle',
      isStudio: studio,
      // 已导入 = 目录里有 .mcstudio/studio.json；老项目（只有 project.json）也视为已导入
      imported: Boolean(marker) || studio,
      legacy: !marker && studio,
      projectId: marker?.projectId || '',
      importedAt: marker?.importedAt || '',
    })
  }
  return out.sort((a, b) => a.name.localeCompare(b.name, 'zh-CN'))
}

/** 读取构建脚本与 gradle.properties 的合并文本，用于判断加载器。 */
async function readBuildText(projectPath) {
  const parts = []
  for (const name of ['build.gradle', 'build.gradle.kts', 'gradle.properties', 'settings.gradle']) {
    const file = join(projectPath, name)
    if (await isFile(file)) parts.push(await fsp.readFile(file, 'utf8').catch(() => ''))
  }
  return parts.join('\n')
}

/** 识别模组工程的描述文件。 */
async function detectDescriptor(projectPath) {
  const resources = join(projectPath, 'src', 'main', 'resources')

  const fabricFile = join(resources, 'fabric.mod.json')
  if (await isFile(fabricFile)) {
    const json = await readJson(fabricFile, null)
    return {
      loader: 'fabric',
      modid: typeof json?.id === 'string' ? json.id : '',
      name: typeof json?.name === 'string' ? json.name : '',
      version: typeof json?.version === 'string' ? json.version : '',
      description: typeof json?.description === 'string' ? json.description : '',
      file: fabricFile,
    }
  }

  const buildText = await readBuildText(projectPath)
  const looksNeoForge = /net\.neoforged|neoforged[\w.]*gradle|neo_version/i.test(buildText)

  for (const [file, baseLoader] of [
    [join(resources, 'META-INF', 'mods.toml'), 'forge'],
    [join(resources, 'META-INF', 'neoforge.mods.toml'), 'neoforge'],
  ]) {
    if (!(await isFile(file))) continue
    const text = await fsp.readFile(file, 'utf8').catch(() => '')
    // 1.20.1 的 NeoForge 与 Forge 共用 mods.toml，只能靠构建脚本区分
    const loader = baseLoader === 'forge' && looksNeoForge ? 'neoforge' : baseLoader
    return {
      loader,
      modid: matchToml(text, 'modId') || '',
      name: matchToml(text, 'displayName') || '',
      version: matchToml(text, 'version') || '',
      description: matchToml(text, 'description') || '',
      file,
    }
  }

  // gradle 兜底：只判断加载器类型
  const gradleFile = (await isFile(join(projectPath, 'build.gradle')))
    ? join(projectPath, 'build.gradle')
    : (await isFile(join(projectPath, 'build.gradle.kts')))
      ? join(projectPath, 'build.gradle.kts')
      : ''
  if (gradleFile) {
    const text = await fsp.readFile(gradleFile, 'utf8').catch(() => '')
    const loader = /fabric-loom/.test(text)
      ? 'fabric'
      : /net\.neoforged/.test(text)
        ? 'neoforge'
        : /net\.minecraftforge/.test(text)
          ? 'forge'
          : ''
    if (loader) return { loader, modid: '', name: '', version: '', description: '', file: gradleFile }
  }
  return null
}

/** 从 TOML 文本中取一个字符串值。 */
function matchToml(text, key) {
  const match = text.match(new RegExp(`^\\s*${key}\\s*=\\s*"([^"]*)"`, 'm'))
  return match ? match[1] : ''
}

/**
 * 扫描工程中的资源。
 *
 * 依据 docs/PROJECT-STRUCTURE.md 的固定位置：
 *   assets/<modid>/textures/item|block、models/item|block、blockstates、lang
 *   data/<modid>/recipes、loot_tables/blocks、tags/items|blocks、advancements
 */
async function scanProjectAssets(projectPath, modid) {
  const resources = join(projectPath, 'src', 'main', 'resources')
  const empty = {
    textures: [], blockTextures: [], models: [], blockModels: [],
    blockstates: [], langs: [], recipes: [], lootTables: [], tags: [], advancements: [],
    namespaces: [],
  }
  if (!modid) return empty

  const assetsDir = join(resources, 'assets')
  const dataDir = join(resources, 'data')
  const assetsRoot = join(assetsDir, modid)

  /** 列出目录下的文件名（去掉扩展名），按扩展名过滤。 */
  const listIds = async (dir, ext) => {
    const out = []
    for (const name of await fsp.readdir(dir).catch(() => [])) {
      if (new RegExp(`\\.${ext}$`, 'i').test(name)) out.push(name.replace(new RegExp(`\\.${ext}$`, 'i'), ''))
    }
    return out.sort()
  }

  const emptyIf = async (path, values) => ((await isDirectory(path)) ? values : [])

  const textures = await listIds(join(assetsRoot, 'textures', 'item'), 'png')
  const blockTextures = await listIds(join(assetsRoot, 'textures', 'block'), 'png')
  const models = await listIds(join(assetsRoot, 'models', 'item'), 'json')
  const blockModels = await listIds(join(assetsRoot, 'models', 'block'), 'json')
  const blockstates = await listIds(join(assetsRoot, 'blockstates'), 'json')
  const langs = await emptyIf(join(assetsRoot, 'lang'), await listIds(join(assetsRoot, 'lang'), 'json'))

  const dataRoot = join(dataDir, modid)
  const recipes = await listIds(join(dataRoot, 'recipes'), 'json')
  const lootTables = await listIds(join(dataRoot, 'loot_tables', 'blocks'), 'json')
  const advancements = await listIds(join(dataRoot, 'advancements'), 'json')
  const tags = [
    ...(await listIds(join(dataRoot, 'tags', 'items'), 'json')).map((id) => `items/${id}`),
    ...(await listIds(join(dataRoot, 'tags', 'blocks'), 'json')).map((id) => `blocks/${id}`),
  ].sort()

  // 工程里实际存在的命名空间（assets/ 与 data/ 下的子目录名）
  const namespaces = [
    ...new Set([
      ...(await fsp.readdir(assetsDir, { withFileTypes: true }).catch(() => []))
        .filter((e) => e.isDirectory()).map((e) => e.name),
      ...(await fsp.readdir(dataDir, { withFileTypes: true }).catch(() => []))
        .filter((e) => e.isDirectory()).map((e) => e.name),
    ]),
  ].sort()

  return {
    textures, blockTextures, models, blockModels, blockstates, langs,
    recipes, lootTables, tags, advancements, namespaces,
  }
}

/** 扫描 Java 源码中的物品注册名。 */
async function scanRegistryNames(projectPath) {
  const javaRoot = join(projectPath, 'src', 'main', 'java')
  const names = new Set()
  async function walk(dir, depth) {
    if (depth > 12) return
    const entries = await fsp.readdir(dir, { withFileTypes: true }).catch(() => [])
    for (const entry of entries) {
      const full = join(dir, entry.name)
      if (entry.isDirectory()) {
        await walk(full, depth + 1)
      } else if (entry.isFile() && entry.name.endsWith('.java')) {
        const stat = await fsp.stat(full).catch(() => null)
        if (!stat || stat.size > 512 * 1024) continue
        const text = await fsp.readFile(full, 'utf8').catch(() => '')
        for (const match of text.matchAll(/register\s*\(\s*"([a-z0-9_]+)"\s*,/g)) names.add(match[1])
        for (const match of text.matchAll(/register\s*\(\s*"([a-z0-9_]+)"\s*\)/g)) names.add(match[1])
      }
    }
  }
  if (await isDirectory(javaRoot)) await walk(javaRoot, 0)
  return [...names].sort()
}

/**
 * 导入一个已有模组工程。
 *
 * 流程（见 docs/plans/IMPORT-PLAN.md）：
 *   1. 校验目录
 *   2. 读 gradle.properties 补全信息（缺失必需项 → 抛异常）
 *   3. 判定是否已在工坊中（注册表 / 工坊标记）
 *   4. 扫描资源并创建条目
 *   5. 写元数据、标记与快照
 */
export async function importProject(input) {
  const path = await requireProjectPath(input.path)

  // ── 步骤 2：解析身份信息 ────────────────────────────────
  const identity = await resolveIdentity(path, input)

  // ── 步骤 3：重复判定 ────────────────────────────────────
  // 已在项目列表中 → 报错，引导直接打开
  // 有工坊数据但不在列表（曾移除）→ 继续走添加流程，并补登记
  const existing = await readProjectMeta(path)
  const registered = await isRegisteredProject(path)
  if (registered && !input.force) {
    throw new Error('该目录已经是工坊项目，可直接打开')
  }

  const meta = {
    schemaVersion: 1,
    name: identity.name,
    modid: identity.modid,
    version: identity.version,
    description: identity.description,
    loader: identity.loader,
    minecraft: identity.minecraft,
    authors: identity.authors,
    license: identity.license,
    group: identity.group,
    minecraftRange: identity.minecraftRange,
    loaderVersion: identity.loaderVersion,
    loaderRange: identity.loaderRange,
    source: identity.source,
    createdAt: existing?.createdAt || new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  }

  await fsp.mkdir(itemsDir(path), { recursive: true })
  await writeJson(projectMetaFile(path), meta)

  // ── 步骤 4：扫描并创建条目 ──────────────────────────────
  const result = await syncEntries(path, identity.modid, { mode: 'merge' })

  if (!(await isFile(featuresFile(path)))) {
    await writeJson(featuresFile(path), { schemaVersion: 1, features: [] })
  }
  await writeStudioMarker(path, { source: existing ? 'reimport' : 'import' })
  await fsp.mkdir(docsDir(path), { recursive: true })

  const snapshot = await writeSnapshot(path, result)

  return {
    ...(await readProject(path)),
    imported: { ...result, snapshot },
  }
}

/**
 * 重新导入：保留用户改过的字段，只同步新增条目与指定冲突项。
 *
 * mode:
 *   'merge'     新增条目，保留现有（默认）
 *   'overwrite' 新增条目，并把类型冲突项改成扫描结果
 */
export async function reimportProject(input) {
  const path = await requireProjectPath(input.path)
  const meta = await readProjectMeta(path)
  if (!meta) throw new Error('该目录还不是工坊项目，请先「导入已有工程」')

  const identity = await resolveIdentity(path, {})

  const patched = {
    ...meta,
    name: identity.name || meta.name,
    modid: identity.modid || meta.modid,
    version: identity.version || meta.version,
    loader: identity.loader || meta.loader,
    minecraft: identity.minecraft || meta.minecraft,
    authors: identity.authors || meta.authors,
    license: identity.license || meta.license,
    group: identity.group || meta.group,
    minecraftRange: identity.minecraftRange || meta.minecraftRange,
    loaderVersion: identity.loaderVersion || meta.loaderVersion,
    loaderRange: identity.loaderRange || meta.loaderRange,
    updatedAt: new Date().toISOString(),
  }
  await writeJson(projectMetaFile(path), patched)

  const mode = input.mode === 'overwrite' ? 'overwrite' : 'merge'
  const result = await syncEntries(path, patched.modid, { mode })

  await writeStudioMarker(path, { source: 'reimport' })
  await fsp.mkdir(docsDir(path), { recursive: true })
  const snapshot = await writeSnapshot(path, result)

  return {
    ...(await readProject(path)),
    imported: { ...result, snapshot },
  }
}

/**
 * 分析导入/重新导入会产生什么变化，不写任何文件。
 *
 * 用于界面上的「确认差异」步骤：先算清楚再让用户决定。
 */
export async function analyzeImport(input) {
  const path = await requireProjectPath(input.path)
  const meta = await readProjectMeta(path)
  const marker = await readStudioMarker(path)

  // 身份解析失败时不让整个分析崩掉，把错误带回前端展示
  let identity = null
  let identityError = ''
  try {
    identity = await resolveIdentity(path, input)
  } catch (error) {
    identityError = error?.message || String(error)
  }

  const modid = identity?.modid || meta?.modid || ''
  const scan = modid ? await scanProjectAssets(path, modid) : null
  const registryNames = await scanRegistryNames(path)
  const existingItems = meta ? await listItems(path) : []

  const diff = scan
    ? diffEntries(scan, registryNames, existingItems)
    : { incoming: [], created: [], kept: [], typeConflicts: [], missing: [], blocks: [] }

  // 三分支判定（见 docs/plans/IMPORT-PLAN.md 步骤 3）：
  //   registered —— 在项目列表里（注册表），可直接打开
  //   orphan     —— 有工坊数据但不在列表（曾被移除），走添加流程
  //   new        —— 全新目录
  const registered = await isRegisteredProject(path)
  let kind = 'new'
  if (registered) kind = 'registered'
  else if (meta || marker) kind = 'orphan'

  return {
    path,
    kind,
    registered,
    hasStudioData: Boolean(meta || marker),
    marker: marker ? { projectId: marker.projectId, importedAt: marker.importedAt, source: marker.source } : null,
    identity,
    identityError,
    conflicts: identity?.conflicts ?? [],
    missing: identity?.missing ?? [],
    meta: meta ? {
      name: meta.name,
      modid: meta.modid,
      version: meta.version,
      loader: meta.loader,
      minecraft: meta.minecraft,
      authors: meta.authors,
      license: meta.license,
      group: meta.group,
      minecraftRange: meta.minecraftRange,
      loaderVersion: meta.loaderVersion,
      updatedAt: meta.updatedAt,
      items: existingItems.length,
    } : null,
    scan,
    diff,
  }
}

/** 逐条比对扫描结果与已有条目。 */
function diffEntries(assets, registryNames, existingItems) {
  const blockIds = new Set([...assets.blockstates, ...assets.blockModels, ...assets.blockTextures])
  const itemIds = new Set([...assets.textures, ...assets.models, ...registryNames])
  for (const id of blockIds) itemIds.delete(id)

  const incomingType = new Map()
  for (const id of [...blockIds].sort()) incomingType.set(id, 'block')
  for (const id of [...itemIds].sort()) incomingType.set(id, 'item')

  const existingById = new Map(existingItems.map((item) => [item.id, item]))
  const created = []
  const kept = []
  const typeConflicts = []

  for (const [id, type] of incomingType) {
    const current = existingById.get(id)
    if (!current) { created.push({ id, type }); continue }
    if (current.type !== type) typeConflicts.push({ id, from: current.type, to: type })
    else kept.push({ id, type })
  }

  const missing = existingItems
    .filter((item) => !incomingType.has(item.id))
    .map((item) => ({ id: item.id, type: item.type }))

  return {
    incoming: [...incomingType].map(([id, type]) => ({ id, type })),
    created,
    kept,
    typeConflicts,
    missing,
    blocks: [...blockIds].sort(),
  }
}

/** 按模式把扫描结果同步到 items/，返回统计。 */
async function syncEntries(path, modid, options = {}) {
  const mode = options.mode === 'overwrite' ? 'overwrite' : 'merge'
  const assets = await scanProjectAssets(path, modid)
  const registryNames = await scanRegistryNames(path)
  const existingItems = await listItems(path)
  const diff = diffEntries(assets, registryNames, existingItems)

  const now = new Date().toISOString()
  const existingById = new Map(existingItems.map((item) => [item.id, item]))
  const created = []
  const updated = []

  const buildDescription = (id) => {
    const hasTexture = assets.textures.includes(id) || assets.blockTextures.includes(id)
    const hasModel = assets.models.includes(id) || assets.blockModels.includes(id)
    return [hasTexture ? '贴图已存在' : '缺贴图', hasModel ? '模型已存在' : '缺模型'].join('；')
  }

  // 新增条目
  for (const entry of diff.created) {
    const item = normalizeItem(
      {
        id: entry.id,
        displayName: entry.id,
        type: entry.type,
        properties: defaultProperties(),
        description: buildDescription(entry.id),
        createdAt: now,
        updatedAt: now,
      },
      entry.id,
    )
    await writeJson(join(itemsDir(path), `${entry.id}.json`), item)
    created.push(entry.id)
  }

  // 类型冲突：仅在 overwrite 模式下改写 type，其余字段保留
  if (mode === 'overwrite') {
    for (const conflict of diff.typeConflicts) {
      const current = existingById.get(conflict.id)
      if (!current) continue
      const next = normalizeItem({ ...current, type: conflict.to, updatedAt: now }, conflict.id)
      await writeJson(join(itemsDir(path), `${conflict.id}.json`), next)
      updated.push(conflict.id)
    }
  }

  await touchMeta(path)

  return {
    assets,
    registryNames,
    created,
    updated,
    kept: diff.kept.map((entry) => entry.id),
    typeConflicts: diff.typeConflicts,
    missing: diff.missing,
    blocks: diff.blocks,
    mode,
  }
}

/**
 * 解析项目身份：gradle.properties 优先，描述文件兜底，表单输入最高优先。
 *
 * 规则：
 *   - modid / 名称 / 版本 在三处出现不同值时抛异常，要求人工介入；
 *   - modid、minecraft_version、加载器版本三者全缺失时抛异常；
 *   - 其余字段缺失留空。
 */
async function resolveIdentity(projectPath, input = {}) {
  const gradle = await readGradleProperties(projectPath).catch(() => ({ exists: false, meta: null, props: {} }))
  const detected = await detectDescriptor(projectPath).catch(() => null)

  const g = gradle?.meta ?? null
  const d = detected ?? null

  /** 合并单个字段，冲突时记录。 */
  const conflicts = []
  const merge = (label, { form, gradleValue, descriptorValue, normalize = (v) => String(v).trim() }) => {
    const candidates = []
    if (form) candidates.push({ value: normalize(form), from: '导入表单' })
    if (gradleValue) candidates.push({ value: normalize(gradleValue), from: 'gradle.properties' })
    if (descriptorValue) candidates.push({ value: normalize(descriptorValue), from: '工程描述文件' })
    if (!candidates.length) return ''
    const distinct = new Set(candidates.map((c) => c.value.toLowerCase()))
    if (distinct.size > 1) conflicts.push({ field: label, values: candidates.map((c) => `${c.value}（${c.from}）`) })
    return candidates[0].value
  }

  const modid = merge('modid', {
    form: input.modid,
    gradleValue: g?.modid,
    descriptorValue: d?.modid,
    normalize: (v) => String(v).trim().toLowerCase(),
  })
  const name = merge('项目名称', { form: input.name, gradleValue: g?.name, descriptorValue: d?.name })
  const version = merge('版本', { form: input.version, gradleValue: g?.version, descriptorValue: d?.version })

  // 加载器：gradle 可判定时以其为准，否则用描述文件
  const loader = g?.loader || d?.loader || ''
  if (g?.loader && d?.loader && g.loader !== d.loader) {
    conflicts.push({
      field: '加载器',
      values: [`${g.loader}（gradle.properties）`, `${d.loader}（工程描述文件）`],
    })
  }

  const minecraft = g?.minecraft || MC_VERSION
  const minecraftRange = g?.minecraftRange || ''

  const loaderVersion = g?.neoVersion
    ? `NeoForge ${g.neoVersion}`
    : g?.forgeVersion
      ? `Forge ${g.forgeVersion}`
      : g?.loaderVersion
        ? `Fabric Loader ${g.loaderVersion}`
        : ''

  const loaderRange = g?.neoVersion || g?.forgeVersion || g?.loaderVersion || ''

  const missing = []
  if (!modid) missing.push('modid（mod_id / archives_base_name）')
  if (!minecraft && !minecraftRange) missing.push('minecraft_version')
  if (!loaderRange) missing.push('加载器版本（neo_version / forge_version / loader_version）')
  if (!loader) missing.push('加载器类型')

  if (conflicts.length) {
    const detail = conflicts.map((c) => `${c.field}：${c.values.join(' ≠ ')}`).join('；')
    throw new Error(`项目信息存在冲突，请修正后重试 —— ${detail}`)
  }
  if (missing.length) {
    throw new Error(
      `gradle.properties 与工程描述文件都缺少必要信息：${missing.join('、')}。`
      + '请在导入表单中手动填写 modid，或补全 gradle.properties。',
    )
  }
  if (!isValidModId(modid)) {
    throw new Error('无法确定合法的 modid，请在导入时手动填写')
  }

  return {
    modid,
    name: name || modid,
    version: version || '0.1.0',
    description: g?.description || d?.description || '',
    loader,
    minecraft,
    minecraftRange,
    loaderVersion,
    loaderRange,
    authors: g?.authors || '',
    license: g?.license || '',
    group: g?.group || '',
    source: gradle?.exists ? 'gradle.properties' : 'descriptor',
    conflicts: [],
    missing: [],
  }
}

/** 写出项目快照文档，返回相对路径。 */
export async function writeSnapshot(projectPath, info) {
  const meta = await readProjectMeta(projectPath)
  const assets = info.assets ?? {}
  const registryNames = info.registryNames ?? []
  const created = info.created ?? []
  const blocks = info.blocks ?? []
  const file = join(docsDir(projectPath), 'mcstudio-snapshot.md')

  const list = (key) => (Array.isArray(assets[key]) ? assets[key] : [])
  const lines = [
    `# 项目快照：${meta?.name ?? basename(projectPath)}`,
    '',
    `> 由「模组工坊」导入时自动生成于 ${new Date().toLocaleString('zh-CN')}。`,
    '',
    '## 基本信息',
    '',
    '| 项目 | 值 |',
    '| --- | --- |',
    `| 目录 | \`${projectPath}\` |`,
    `| modid | \`${meta?.modid ?? ''}\` |`,
    `| 名称 | ${meta?.name ?? ''} |`,
    `| 版本 | \`${meta?.version ?? ''}\` |`,
    `| 加载器 | \`${meta?.loader ?? ''}\` |`,
    `| 目标版本 | Minecraft ${meta?.minecraft ?? MC_VERSION} |`,
    meta?.minecraftRange ? `| MC 版本范围 | \`${meta.minecraftRange}\` |` : '',
    meta?.loaderVersion ? `| 加载器版本 | \`${meta.loaderVersion}\` |` : '',
    meta?.authors ? `| 作者 | ${meta.authors} |` : '',
    meta?.license ? `| 许可证 | \`${meta.license}\` |` : '',
    meta?.group ? `| 包名 / group | \`${meta.group}\` |` : '',
    meta?.source ? `| 信息来源 | ${meta.source} |` : '',
    '',
    '## 资源扫描',
    '',
    '| 类型 | 路径 | 数量 |',
    '| --- | --- | --- |',
    `| 物品贴图 | \`assets/<modid>/textures/item/\` | ${list('textures').length} |`,
    `| 方块贴图 | \`assets/<modid>/textures/block/\` | ${list('blockTextures').length} |`,
    `| 物品模型 | \`assets/<modid>/models/item/\` | ${list('models').length} |`,
    `| 方块模型 | \`assets/<modid>/models/block/\` | ${list('blockModels').length} |`,
    `| 方块状态 | \`assets/<modid>/blockstates/\` | ${list('blockstates').length} |`,
    `| 语言文件 | \`assets/<modid>/lang/\` | ${list('langs').length} |`,
    `| 配方 | \`data/<modid>/recipes/\` | ${list('recipes').length} |`,
    `| 战利品表 | \`data/<modid>/loot_tables/blocks/\` | ${list('lootTables').length} |`,
    `| 标签 | \`data/<modid>/tags/\` | ${list('tags').length} |`,
    `| 进度 | \`data/<modid>/advancements/\` | ${list('advancements').length} |`,
    `| Java 注册名 | \`src/main/java/\` | ${registryNames.length} |`,
    '',
    `本次新建条目：${created.length} 个（方块 ${blocks.length} 个）。`,
    '',
  ]

  const section = (title, values, render) => {
    if (!values.length) return
    lines.push(`### ${title}`, '', ...values.map(render), '')
  }

  section('物品贴图', list('textures'), (t) => `- \`textures/item/${t}.png\``)
  section('方块贴图', list('blockTextures'), (t) => `- \`textures/block/${t}.png\``)
  section('物品模型', list('models'), (m) => `- \`models/item/${m}.json\``)
  section('方块模型', list('blockModels'), (m) => `- \`models/block/${m}.json\``)
  section('方块状态', list('blockstates'), (b) => `- \`blockstates/${b}.json\``)
  section('语言文件', list('langs'), (l) => `- \`lang/${l}.json\``)
  section('配方', list('recipes'), (r) => `- \`recipes/${r}.json\``)
  section('战利品表', list('lootTables'), (l) => `- \`loot_tables/blocks/${l}.json\``)
  section('标签', list('tags'), (t) => `- \`tags/${t}.json\``)
  section('进度', list('advancements'), (a) => `- \`advancements/${a}.json\``)
  section('注册名清单', registryNames, (r) => `- \`${r}\``)

  if (list('namespaces').length) {
    lines.push(
      '### 检测到的命名空间',
      '',
      ...list('namespaces').map((ns) => `- \`${ns}\`${ns === meta?.modid ? '（本项目）' : '（其他，未纳入）'}`),
      '',
    )
  }

  await writeText(file, lines.join('\n'))
  return relative(projectPath, file).replace(/\\/g, '/')
}

/** 校验路径是否位于给定根目录内（导入/打开时的边界检查）。 */
export function assertInside(root, target) {
  if (!isInside(root, target)) throw new Error(`路径不在允许的根目录内：${target}`)
  return target
}
