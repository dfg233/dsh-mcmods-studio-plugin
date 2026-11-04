/**
 * 工作台计划：系统卡与任务包。
 *
 * 这里只存“意图与工作单”，不存代码事实；代码事实仍在 structure.json。
 * 文件位于 `.mcstudio/systems.json`、`.mcstudio/tasks.json`，缺失时按空处理。
 */

import { readJson, writeJson } from './registry.js'
import { systemsFile, tasksFile } from './paths.js'
import { touchMeta } from './meta.js'
import { listFeatures } from './entries.js'

export const SYSTEM_STATUS = ['planned', 'implementing', 'stable', 'deprecated']
export const TASK_STATUS = ['todo', 'doing', 'review', 'done', 'blocked']

const SYSTEM_ID_RE = /^[a-z0-9][a-z0-9-]{1,63}$/
const TASK_ID_RE = /^[a-z0-9][a-z0-9_-]{1,63}$/

function now() {
  return new Date().toISOString()
}

function text(value, fallback = '') {
  return typeof value === 'string' ? value : fallback
}

function lines(value) {
  if (!Array.isArray(value)) return []
  return value.map((item) => String(item).trim()).filter(Boolean)
}

function objects(value, normalize) {
  if (!Array.isArray(value)) return []
  return value.map(normalize).filter(Boolean)
}

function normalizeSystem(raw = {}) {
  const id = text(raw.id).trim()
  if (!SYSTEM_ID_RE.test(id)) {
    throw new Error('系统 id 只能包含小写字母、数字和连字符，长度 2-64')
  }
  const name = text(raw.name).trim() || id
  const status = SYSTEM_STATUS.includes(raw.status) ? raw.status : 'planned'
  return {
    schemaVersion: 1,
    id,
    name,
    responsibility: text(raw.responsibility),
    nonGoals: lines(raw.nonGoals),
    invariants: lines(raw.invariants),
    entryPoints: objects(raw.entryPoints, (item) => (
      typeof item === 'string' ? { kind: 'class', path: item } : (item && typeof item === 'object' ? item : null)
    )),
    resources: objects(raw.resources, (item) => (
      typeof item === 'string'
        ? { kind: 'other', path: item, required: true }
        : (item && typeof item === 'object' ? { kind: text(item.kind, 'other'), path: text(item.path), required: item.required !== false } : null)
    )),
    dependsOn: lines(raw.dependsOn),
    checks: lines(raw.checks),
    status,
    notes: text(raw.notes),
    createdAt: text(raw.createdAt),
    updatedAt: text(raw.updatedAt),
  }
}

function normalizeAllowedPath(item) {
  if (typeof item === 'string' && item.trim()) return { path: item.trim(), mode: 'modify' }
  if (item && typeof item === 'object' && text(item.path).trim()) {
    return { path: item.path.trim(), mode: item.mode === 'create' ? 'create' : 'modify' }
  }
  return null
}

function normalizeVerify(item) {
  if (typeof item === 'string' && item.trim()) return { id: item.trim(), runner: 'host' }
  if (item && typeof item === 'object' && text(item.id).trim()) {
    const out = {
      id: item.id.trim(),
      runner: ['host', 'agent', 'manual'].includes(item.runner) ? item.runner : 'host',
    }
    if (Number.isSafeInteger(item.timeoutMs) && item.timeoutMs > 0) out.timeoutMs = item.timeoutMs
    if (typeof item.evidence === 'string' && item.evidence.trim()) out.evidence = item.evidence.trim()
    if (typeof item.baseline === 'string' && item.baseline.trim()) out.baseline = item.baseline.trim()
    return out
  }
  return null
}

function normalizeTask(raw = {}, systemIds = new Set()) {
  const id = text(raw.id).trim() || `t_${Date.now()}`
  if (!TASK_ID_RE.test(id)) {
    throw new Error('任务 id 只能包含小写字母、数字、下划线和连字符，长度 2-64')
  }
  const systemId = text(raw.systemId).trim()
  if (!systemId) throw new Error('任务必须指定所属系统')
  if (!systemIds.has(systemId)) throw new Error(`任务所属系统不存在：${systemId}`)
  const title = text(raw.title).trim() || '未命名任务'
  const status = TASK_STATUS.includes(raw.status) ? raw.status : 'todo'
  const allowedPaths = objects(raw.allowedPaths, normalizeAllowedPath)
  if (!allowedPaths.length) throw new Error('任务至少需要一个允许修改的路径')
  return {
    schemaVersion: 1,
    id,
    title,
    ideaId: text(raw.ideaId).trim(),
    systemId,
    goal: text(raw.goal),
    nonGoals: lines(raw.nonGoals),
    templateRefs: objects(raw.templateRefs, (item) => {
      if (typeof item === 'string' && item.trim()) return { id: item.trim(), version: 1 }
      if (item && typeof item === 'object' && text(item.id).trim()) {
        return {
          id: item.id.trim(),
          version: Number.isSafeInteger(item.version) ? item.version : 1,
          ...(item.parameters && typeof item.parameters === 'object' && !Array.isArray(item.parameters)
            ? { parameters: item.parameters }
            : {}),
        }
      }
      return null
    }),
    allowedPaths,
    guardPaths: lines(raw.guardPaths),
    baseRevisions: objects(raw.baseRevisions, (item) => (
      item && typeof item === 'object' && text(item.path).trim()
        ? { path: item.path.trim(), ...(text(item.hash).trim() ? { hash: text(item.hash).trim() } : {}), ...(Number.isSafeInteger(item.revision) ? { revision: item.revision } : {}) }
        : null
    )),
    baseStructureHash: text(raw.baseStructureHash).trim(),
    contextRefs: lines(raw.contextRefs),
    apiRefs: lines(raw.apiRefs),
    codeRefs: lines(raw.codeRefs),
    acceptance: lines(raw.acceptance),
    verify: objects(raw.verify, normalizeVerify),
    status,
    result: raw.result && typeof raw.result === 'object' ? raw.result : {},
    createdAt: text(raw.createdAt),
    updatedAt: text(raw.updatedAt),
  }
}

export async function listSystems(projectPath) {
  const raw = await readJson(systemsFile(projectPath), { systems: [] })
  return Array.isArray(raw.systems) ? raw.systems.map((item) => normalizeSystem(item)) : []
}

export async function saveSystem(projectPath, system = {}) {
  const entry = normalizeSystem(system)
  const systems = await listSystems(projectPath)
  const index = systems.findIndex((item) => item.id === entry.id)
  const stamp = now()
  if (index >= 0) {
    entry.createdAt = systems[index].createdAt ?? stamp
    systems[index] = { ...entry, createdAt: entry.createdAt, updatedAt: stamp }
  } else {
    entry.createdAt = stamp
    entry.updatedAt = stamp
    systems.push(entry)
  }
  await writeJson(systemsFile(projectPath), { schemaVersion: 1, systems })
  await touchMeta(projectPath)
  return systems.find((item) => item.id === entry.id)
}

export async function deleteSystem(projectPath, id) {
  const systems = await listSystems(projectPath)
  await writeJson(systemsFile(projectPath), { schemaVersion: 1, systems: systems.filter((item) => item.id !== id) })
  await touchMeta(projectPath)
  return systems.filter((item) => item.id !== id)
}

export async function listTasks(projectPath) {
  const raw = await readJson(tasksFile(projectPath), { tasks: [] })
  return Array.isArray(raw.tasks) ? raw.tasks : []
}

export async function saveTask(projectPath, task = {}) {
  const systems = await listSystems(projectPath)
  const entry = normalizeTask(task, new Set(systems.map((item) => item.id)))
  const tasks = await listTasks(projectPath)
  const index = tasks.findIndex((item) => item.id === entry.id)
  const stamp = now()
  if (index >= 0) {
    entry.createdAt = tasks[index].createdAt ?? stamp
    tasks[index] = { ...entry, createdAt: entry.createdAt, updatedAt: stamp }
  } else {
    entry.createdAt = stamp
    entry.updatedAt = stamp
    tasks.push(entry)
  }
  await writeJson(tasksFile(projectPath), { schemaVersion: 1, tasks })
  await touchMeta(projectPath)
  return tasks.find((item) => item.id === entry.id)
}

export async function deleteTask(projectPath, id) {
  const tasks = await listTasks(projectPath)
  await writeJson(tasksFile(projectPath), { schemaVersion: 1, tasks: tasks.filter((item) => item.id !== id) })
  await touchMeta(projectPath)
  return tasks.filter((item) => item.id !== id)
}

/** 计划页一次读全：想法（沿用 features）、系统、任务。 */
export async function readPlan(projectPath) {
  const [ideas, systems, tasks] = await Promise.all([
    listFeatures(projectPath),
    listSystems(projectPath),
    listTasks(projectPath),
  ])
  return { ideas, systems, tasks }
}
