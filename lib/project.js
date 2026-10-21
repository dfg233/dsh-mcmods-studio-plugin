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
  writeJson,
  writeText,
} from './registry.js'

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
  return {
    schemaVersion: 1,
    name: typeof raw.name === 'string' ? raw.name : basename(projectPath),
    modid: typeof raw.modid === 'string' ? raw.modid : '',
    version: typeof raw.version === 'string' ? raw.version : '0.1.0',
    description: typeof raw.description === 'string' ? raw.description : '',
    loader: LOADERS.some((l) => l.id === raw.loader) ? raw.loader : 'neoforge',
    minecraft: MC_VERSION,
    createdAt: typeof raw.createdAt === 'string' ? raw.createdAt : '',
    updatedAt: typeof raw.updatedAt === 'string' ? raw.updatedAt : '',
  }
}

/** 判断一个目录是否是工坊项目。 */
export async function isStudioProject(projectPath) {
  return (await readProjectMeta(projectPath)) !== null
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
    })
  }
  return out.sort((a, b) => a.name.localeCompare(b.name, 'zh-CN'))
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

  for (const [file, loader] of [
    [join(resources, 'META-INF', 'mods.toml'), 'forge'],
    [join(resources, 'META-INF', 'neoforge.mods.toml'), 'neoforge'],
  ]) {
    if (!(await isFile(file))) continue
    const text = await fsp.readFile(file, 'utf8').catch(() => '')
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

/** 扫描工程中的物品资产与注册名。 */
async function scanProjectAssets(projectPath, modid) {
  const resources = join(projectPath, 'src', 'main', 'resources')
  const assetsRoot = modid ? join(resources, 'assets', modid) : ''
  const textures = []
  const models = []
  if (assetsRoot && (await isDirectory(assetsRoot))) {
    const textureDir = join(assetsRoot, 'textures', 'item')
    for (const name of await fsp.readdir(textureDir).catch(() => [])) {
      if (/\.(png)$/i.test(name)) textures.push(name.replace(/\.png$/i, ''))
    }
    const modelDir = join(assetsRoot, 'models', 'item')
    for (const name of await fsp.readdir(modelDir).catch(() => [])) {
      if (/\.json$/i.test(name)) models.push(name.replace(/\.json$/i, ''))
    }
  }
  return { textures, models }
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
 * 读取工程描述文件（fabric.mod.json / mods.toml）、扫描贴图与模型、
 * 从 Java 源码中提取注册名，生成本插件的数据文件，并写出项目快照文档。
 */
export async function importProject(input) {
  const path = await requireProjectPath(input.path)
  const existing = await readProjectMeta(path)
  if (existing) throw new Error('该目录已经是工坊项目，可直接打开')

  const detected = await detectDescriptor(path)
  if (!detected) throw new Error('未能识别工程类型：未找到 fabric.mod.json、mods.toml 或构建脚本')

  const modid = String(input.modid ?? detected.modid ?? '').trim().toLowerCase()
  if (!isValidModId(modid)) throw new Error('无法确定合法的 modid，请在导入时手动填写')

  const meta = {
    schemaVersion: 1,
    name: String(input.name ?? detected.name ?? '').trim() || modid,
    modid,
    version: String(input.version ?? detected.version ?? '').trim() || '0.1.0',
    description: String(detected.description ?? ''),
    loader: detected.loader,
    minecraft: MC_VERSION,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  }

  await fsp.mkdir(itemsDir(path), { recursive: true })
  await writeJson(projectMetaFile(path), meta)

  const { textures, models } = await scanProjectAssets(path, modid)
  const registryNames = await scanRegistryNames(path)
  const known = new Set([...textures, ...models, ...registryNames])

  const existingItems = await listItems(path)
  const existingIds = new Set(existingItems.map((i) => i.id))
  const created = []
  for (const id of [...known].sort()) {
    if (existingIds.has(id)) continue
    const item = normalizeItem(
      {
        id,
        displayName: id,
        type: 'item',
        properties: defaultProperties(),
        description: '',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
      id,
    )
    await writeJson(join(itemsDir(path), `${id}.json`), item)
    created.push(id)
  }

  if (!(await isFile(featuresFile(path)))) {
    await writeJson(featuresFile(path), { schemaVersion: 1, features: [] })
  }
  await fsp.mkdir(docsDir(path), { recursive: true })

  const snapshot = await writeSnapshot(path, {
    detected,
    textures,
    models,
    registryNames,
    created,
  })

  return {
    ...(await readProject(path)),
    imported: { textures, models, registryNames, created, snapshot },
  }
}

/** 写出项目快照文档，返回相对路径。 */
export async function writeSnapshot(projectPath, info) {
  const meta = await readProjectMeta(projectPath)
  const { textures, models, registryNames, created } = info
  const file = join(docsDir(projectPath), 'mcstudio-snapshot.md')
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
    `| 版本 | ${meta?.version ?? ''} |`,
    `| 加载器 | ${meta?.loader ?? ''} |`,
    `| 目标版本 | Minecraft ${meta?.minecraft ?? MC_VERSION} |`,
    '',
    '## 资产扫描',
    '',
    `- 贴图：${textures.length} 个`,
    `- 模型：${models.length} 个`,
    `- Java 注册名：${registryNames.length} 个`,
    `- 本次新建物品条目：${created.length} 个`,
    '',
  ]
  if (textures.length) {
    lines.push('### 贴图清单', '', ...textures.map((t) => `- \`textures/item/${t}.png\``), '')
  }
  if (models.length) {
    lines.push('### 模型清单', '', ...models.map((m) => `- \`models/item/${m}.json\``), '')
  }
  if (registryNames.length) {
    lines.push('### 注册名清单', '', ...registryNames.map((r) => `- \`${r}\``), '')
  }
  await writeText(file, lines.join('\n'))
  return relative(projectPath, file).replace(/\\/g, '/')
}

/** 校验路径是否位于给定根目录内（导入/打开时的边界检查）。 */
export function assertInside(root, target) {
  if (!isInside(root, target)) throw new Error(`路径不在允许的根目录内：${target}`)
  return target
}
