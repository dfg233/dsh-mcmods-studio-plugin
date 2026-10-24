/**
 * 项目路径与校验
 *
 * 所有 `.mcstudio/` 相关路径、modid / 物品 id 校验、路径归属判断。
 * 不依赖其它项目内模块（只依赖 registry 的路径工具）。
 */

import { join, resolve } from 'node:path'

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

