/**
 * 项目注册表：记录「模组工坊」管理过的模组项目目录，以及默认扫描根目录。
 *
 * 注册表存放在 `$DSH_HOME/mcmods-studio/registry.json`，属于插件自身的运行数据，
 * 不写进任何模组工程目录，避免污染用户的 gradle 工程。
 *
 * 所有被记录的项目路径都是绝对路径；读取时做一次存在性校验，
 * 目录被移动或删除的项目会被标记为 missing，而不是直接丢弃。
 */

import { promises as fsp } from 'node:fs'
import { homedir } from 'node:os'
import { dirname, join, resolve } from 'node:path'

/** 注册表结构版本，升级时用于迁移。 */
const SCHEMA_VERSION = 1

/** 默认扫描根目录：本机所有项目文件的根目录。 */
export const DEFAULT_ROOT = 'D:\\program'

/** 插件运行数据目录。 */
export function dataDir() {
  const home = process.env.DSH_HOME && process.env.DSH_HOME.trim()
    ? process.env.DSH_HOME.trim()
    : join(homedir(), '.dsh')
  return join(home, 'mcmods-studio')
}

/** 注册表文件路径。 */
export function registryPath() {
  return join(dataDir(), 'registry.json')
}

/** 展开 `~` 前缀并解析为绝对路径。 */
export function expandPath(input) {
  if (typeof input !== 'string' || input.trim() === '') return ''
  let p = input.trim()
  if (p === '~') return homedir()
  if (p.startsWith('~/') || p.startsWith('~\\')) p = join(homedir(), p.slice(2))
  return resolve(p)
}

/** 判断 child 是否位于 parent 之内（含相等）。 */
export function isInside(parent, child) {
  const a = resolve(parent)
  const b = resolve(child)
  if (a === b) return true
  const sep = a.endsWith('\\') || a.endsWith('/') ? '' : (a.includes('\\') ? '\\' : '/')
  return b.startsWith(a + sep)
}

/**
 * 读取 JSON。
 *
 * 文件不存在或内容损坏时返回 fallback —— 数据文件由插件自己写，
 * 出现损坏通常意味着外部误改，此时应按"没有数据"处理，
 * 而不是让整个插件崩掉。
 */
export async function readJson(file, fallback) {
  let text
  try {
    text = await fsp.readFile(file, 'utf8')
  } catch (error) {
    if (error?.code === 'ENOENT') return fallback
    throw error
  }
  try {
    return JSON.parse(text)
  } catch {
    return fallback
  }
}

/** 原子写入 JSON（先写临时文件再 rename）。 */
export async function writeJson(file, value) {
  await fsp.mkdir(dirname(file), { recursive: true })
  const temp = `${file}.${process.pid}.${Date.now()}.tmp`
  await fsp.writeFile(temp, JSON.stringify(value, null, 2) + '\n', 'utf8')
  await fsp.rename(temp, file)
}

/** 原子写入文本。 */
export async function writeText(file, text) {
  await fsp.mkdir(dirname(file), { recursive: true })
  const temp = `${file}.${process.pid}.${Date.now()}.tmp`
  await fsp.writeFile(temp, text, 'utf8')
  await fsp.rename(temp, file)
}

/** 路径是否存在且为目录。 */
export async function isDirectory(p) {
  try {
    const stat = await fsp.stat(p)
    return stat.isDirectory()
  } catch {
    return false
  }
}

/** 路径是否存在且为文件。 */
export async function isFile(p) {
  try {
    const stat = await fsp.stat(p)
    return stat.isFile()
  } catch {
    return false
  }
}

/** 读取注册表（缺失时返回空注册表）。 */
export async function readRegistry() {
  const raw = await readJson(registryPath(), null)
  const base = {
    schemaVersion: SCHEMA_VERSION,
    root: DEFAULT_ROOT,
    projects: [],
    lastProject: '',
  }
  if (!raw || typeof raw !== 'object') return base

  const projects = Array.isArray(raw.projects)
    ? raw.projects
        .filter((p) => p && typeof p.path === 'string' && p.path.trim())
        .map((p) => ({
          path: expandPath(p.path),
          name: typeof p.name === 'string' ? p.name : '',
          modid: typeof p.modid === 'string' ? p.modid : '',
          createdAt: typeof p.createdAt === 'string' ? p.createdAt : '',
          updatedAt: typeof p.updatedAt === 'string' ? p.updatedAt : '',
        }))
    : []

  // lastProject 只在此前打开过项目时有效；路径已不在列表里则视为空，
  // 避免界面去打开一个已被移除的项目。
  const last = typeof raw.lastProject === 'string' ? expandPath(raw.lastProject) : ''
  const valid = last && projects.some((p) => p.path === last)

  return {
    schemaVersion: typeof raw.schemaVersion === 'number' ? raw.schemaVersion : SCHEMA_VERSION,
    root: typeof raw.root === 'string' && raw.root.trim() ? expandPath(raw.root) : DEFAULT_ROOT,
    projects,
    lastProject: valid ? last : '',
  }
}

/** 写回注册表，并附带各项目的目录存在性。 */
export async function saveRegistry(registry) {
  const normalized = {
    schemaVersion: SCHEMA_VERSION,
    root: expandPath(registry.root) || DEFAULT_ROOT,
    projects: registry.projects.map((p) => ({
      path: expandPath(p.path),
      name: p.name ?? '',
      modid: p.modid ?? '',
      createdAt: p.createdAt ?? '',
      updatedAt: p.updatedAt ?? '',
    })),
    lastProject: registry.lastProject ? expandPath(registry.lastProject) : '',
  }
  await writeJson(registryPath(), normalized)
  return normalized
}

/** 在注册表中登记或更新一个项目。 */
export async function touchProject(path, patch = {}) {
  const registry = await readRegistry()
  const target = expandPath(path)
  const now = new Date().toISOString()
  const idx = registry.projects.findIndex((p) => p.path === target)
  if (idx >= 0) {
    registry.projects[idx] = {
      ...registry.projects[idx],
      ...patch,
      path: target,
      updatedAt: now,
    }
  } else {
    registry.projects.push({
      path: target,
      name: patch.name ?? '',
      modid: patch.modid ?? '',
      createdAt: now,
      updatedAt: now,
    })
  }
  return saveRegistry(registry)
}

/** 从注册表移除一个项目。 */
export async function forgetProject(path) {
  const registry = await readRegistry()
  const target = expandPath(path)
  const next = {
    ...registry,
    projects: registry.projects.filter((p) => p.path !== target),
  }
  // 移除的正是「上次打开」时一并清掉，避免留下无效路径
  if (next.lastProject === target) next.lastProject = ''
  return saveRegistry(next)
}

/** 更新默认扫描根目录。 */
export async function setRegistryRoot(root) {
  const registry = await readRegistry()
  registry.root = expandPath(root) || DEFAULT_ROOT
  return saveRegistry(registry)
}
