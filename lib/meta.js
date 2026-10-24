/**
 * 项目元数据与工坊标记
 *
 * 读写 project.json 与 studio.json，创建项目，判断项目状态。
 */

import { promises as fsp } from 'node:fs'
import { basename, join } from 'node:path'

import { expandPath, isDirectory, isFile, readJson, readRegistry, writeJson, writeText } from './registry.js'
import { LOADERS, defaultProperties } from './schema.js'
import {
  DATA_DIR,
  MC_VERSION,
  docsDir,
  featuresFile,
  isValidModId,
  projectDataDir,
  projectMetaFile,
  studioMarkerFile,
} from './paths.js'

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
      '> 本项目的设计数据（构想、物品属性、贴图模型）由「模组工坊」DSH 插件管理，',
      `> 存放于 \`.mcstudio/\` 目录；导出的文档在 \`docs/\` 目录。`,
      '',
      '## 目录说明',
      '',
      '| 路径 | 说明 |',
      '| --- | --- |',
      '| `.mcstudio/project.json` | 项目元数据 |',
      '| `.mcstudio/features.json` | 模组构想清单 |',
      '| `.mcstudio/items/*.json` | 物品属性文档（每物品一份） |',
      '| `docs/` | 插件导出的 Markdown 文档 |',
      '',
    ].join('\n'),
  )

  // 新建项目时条目一定是空的，直接组装返回值，
  // 避免 meta → entries 的反向依赖（entries 依赖 meta 的 touchMeta）。
  return {
    path,
    meta,
    features: [],
    items: [],
  }
}

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
