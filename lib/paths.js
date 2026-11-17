/**
 * 项目路径与校验
 *
 * 所有 `.mcstudio/` 相关路径、modid / 物品 id 校验、路径归属判断。
 * 不依赖其它项目内模块（只依赖 registry 的路径工具）。
 */

import { promises as fsp } from 'node:fs'
import { join, relative, resolve } from 'node:path'

import { expandPath, isDirectory, isInside } from './registry.js'

export const DATA_DIR = '.mcstudio'

export const MC_VERSION = '1.20.1'

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

/** 构想清单文件。 */
export function featuresFile(projectPath) {
  return join(projectDataDir(projectPath), 'features.json')
}

/** mod 资料数据文件（按分类名，如 entities / biomes / settings）。 */
export function catalogFile(projectPath, name) {
  return join(projectDataDir(projectPath), `${name}.json`)
}

/** 系统卡文件。 */
export function systemsFile(projectPath) {
  return join(projectDataDir(projectPath), 'systems.json')
}

/** 模块文件（v0.4.5；旧 systems.json 作为回退）。 */
export function modulesFile(projectPath) {
  return join(projectDataDir(projectPath), 'modules.json')
}

/** 阶段文件（v0.4.5）。 */
export function stagesFile(projectPath) {
  return join(projectDataDir(projectPath), 'stages.json')
}

/** 任务包文件。 */
export function tasksFile(projectPath) {
  return join(projectDataDir(projectPath), 'tasks.json')
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

export function assertInside(root, target) {
  if (!isInside(root, target)) throw new Error(`路径不在允许的根目录内：${target}`)
  return target
}

/** 文本层面的路径规范化：统一分隔符并折叠 `.`/`..`（不访问磁盘）。 */
export function normalizePathText(input) {
  const text = String(input ?? '').replace(/\\/g, '/').trim()
  if (!text) return ''
  const segments = []
  for (const part of text.split('/')) {
    if (!part || part === '.') continue
    if (part === '..') {
      segments.pop()
      continue
    }
    segments.push(part)
  }
  return segments.join('/')
}

function pathError(message) {
  const error = new Error(message)
  error.code = 'PATH_OUTSIDE'
  return error
}

/**
 * 把相对路径规范化并限制在项目根内（Q01 / D6）。
 *
 * 拒绝：空路径、绝对路径、父级跳转、resolve 后越界、符号链接指向真实根之外。
 * 返回 posix 风格的相对路径。
 */
export async function normalizeProjectPath(projectPath, input) {
  const raw = String(input ?? '').trim()
  if (!raw) throw pathError('路径为空')
  const text = raw.replace(/\\/g, '/')
  if (text.startsWith('/') || /^[a-zA-Z]:\//.test(text)) throw pathError(`不允许绝对路径：${raw}`)
  if (text.split('/').some((part) => part === '..')) throw pathError(`路径不允许包含父级跳转：${raw}`)
  const root = resolve(projectPath)
  const full = resolve(root, text)
  if (!isInside(root, full)) throw pathError(`路径越出项目根：${raw}`)
  const realRoot = await fsp.realpath(root).catch(() => root)
  const realFull = await fsp.realpath(full).catch(() => full)
  if (!isInside(realRoot, realFull)) throw pathError(`路径越出项目真实根（符号链接）：${raw}`)
  return relative(root, full).replace(/\\/g, '/') || '.'
}

