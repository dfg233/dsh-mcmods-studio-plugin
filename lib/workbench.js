/**
 * 工作台计划：模块、阶段与任务包。
 *
 * 这里只存“意图与工作单”，不存代码事实；代码事实仍在 structure.json。
 * 文件位于 `.mcstudio/modules.json`、`.mcstudio/stages.json`、`.mcstudio/tasks.json`；
 * 旧的 `.mcstudio/systems.json` 作为模块的回退兼容。
 */

import { readJson, writeJson } from './registry.js'
import { assertRevision, bumpRevision, runExclusive } from './transaction.js'
import { createHash, randomUUID } from 'node:crypto'
import { promises as fsp } from 'node:fs'
import { join } from 'node:path'
import { modulesFile, stagesFile, systemsFile, tasksFile } from './paths.js'
import { readProjectMeta, touchMeta } from './meta.js'
import { listFeatures } from './entries.js'

export const SYSTEM_STATUS = ['planned', 'implementing', 'stable', 'deprecated']
export const TASK_STATUS = ['todo', 'doing', 'review', 'done', 'blocked']
export const STAGE_STATUS = ['planned', 'doing', 'done']

const SYSTEM_ID_RE = /^[a-z0-9][a-z0-9-]{1,63}$/
const TASK_ID_RE = /^[a-z0-9][a-z0-9_-]{1,63}$/
const STAGE_ID_RE = /^[a-z0-9][a-z0-9_-]{1,63}$/

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

function normalizeStage(raw = {}, moduleIds = null) {
  const id = text(raw.id).trim() || `st_${Date.now()}`
  if (!STAGE_ID_RE.test(id)) throw new Error('阶段 id 只能包含小写字母、数字、下划线和连字符，长度 2-64')
  const moduleId = text(raw.moduleId).trim()
  if (!moduleId) throw new Error('阶段缺少所属模块（moduleId）')
  if (moduleIds && !moduleIds.has(moduleId)) throw new Error(`阶段所属模块不存在：${moduleId}`)
  const status = STAGE_STATUS.includes(raw.status) ? raw.status : 'planned'
  return {
    schemaVersion: 1,
    id,
    moduleId,
    name: text(raw.name).trim() || id,
    goal: text(raw.goal),
    order: Number.isSafeInteger(raw.order) ? raw.order : 0,
    status,
    acceptance: lines(raw.acceptance),
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

function normalizeTask(raw = {}, moduleIds = new Set(), stages = []) {
  const id = text(raw.id).trim() || `t_${Date.now()}`
  if (!TASK_ID_RE.test(id)) {
    throw new Error('任务 id 只能包含小写字母、数字、下划线和连字符，长度 2-64')
  }
  const moduleId = text(raw.moduleId).trim() || text(raw.systemId).trim()
  if (!moduleId) throw new Error('任务缺少所属模块（moduleId）')
  if (!moduleIds.has(moduleId)) throw new Error(`任务所属模块不存在：${moduleId}`)
  const stageId = text(raw.stageId).trim()
  if (stageId) {
    const stage = stages.find((item) => item.id === stageId)
    if (!stage) throw new Error(`任务所属阶段不存在：${stageId}`)
    if (stage.moduleId !== moduleId) throw new Error('任务阶段不属于该模块')
  }
  const title = text(raw.title).trim() || '未命名任务'
  const status = TASK_STATUS.includes(raw.status) ? raw.status : 'todo'
  const allowedPaths = objects(raw.allowedPaths, normalizeAllowedPath)
  if (!allowedPaths.length) throw new Error('任务至少需要一个允许修改的路径')
  return {
    schemaVersion: 1,
    id,
    title,
    ideaId: text(raw.ideaId).trim(),
    moduleId,
    stageId,
    systemId: moduleId,
    confirmed: raw.confirmed === true,
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
    revision: Number.isSafeInteger(raw.revision) ? raw.revision : 1,
    confirmation: raw.confirmation && typeof raw.confirmation === 'object' ? raw.confirmation : undefined,
    result: raw.result && typeof raw.result === 'object' ? raw.result : {},
    createdAt: text(raw.createdAt),
    updatedAt: text(raw.updatedAt),
  }
}

/** 模块列表：优先 modules.json，回退旧 systems.json。 */
export async function listModules(projectPath) {
  const raw = await readJson(modulesFile(projectPath), null, { strict: true })
  if (raw && Array.isArray(raw.modules)) return raw.modules.map((item) => normalizeSystem(item))
  const legacy = await readJson(systemsFile(projectPath), { systems: [] }, { strict: true })
  return Array.isArray(legacy.systems) ? legacy.systems.map((item) => normalizeSystem(item)) : []
}

export async function saveModule(projectPath, module = {}) {
  const entry = normalizeSystem(module)
  const modules = await listModules(projectPath)
  const index = modules.findIndex((item) => item.id === entry.id)
  const stamp = now()
  if (index >= 0) {
    entry.createdAt = modules[index].createdAt ?? stamp
    modules[index] = { ...entry, createdAt: entry.createdAt, updatedAt: stamp }
  } else {
    entry.createdAt = stamp
    entry.updatedAt = stamp
    modules.push(entry)
  }
  await writeJson(modulesFile(projectPath), { schemaVersion: 1, modules })
  await touchMeta(projectPath)
  return modules.find((item) => item.id === entry.id)
}

export async function deleteModule(projectPath, id) {
  const modules = await listModules(projectPath)
  await writeJson(modulesFile(projectPath), { schemaVersion: 1, modules: modules.filter((item) => item.id !== id) })
  await touchMeta(projectPath)
  return modules.filter((item) => item.id !== id)
}

/** 旧名兼容：系统 = 模块。 */
export async function listSystems(projectPath) {
  return listModules(projectPath)
}

export async function saveSystem(projectPath, system = {}) {
  return saveModule(projectPath, system)
}

export async function deleteSystem(projectPath, id) {
  return deleteModule(projectPath, id)
}

export async function listStages(projectPath) {
  const raw = await readJson(stagesFile(projectPath), { stages: [] }, { strict: true })
  return Array.isArray(raw.stages) ? raw.stages.map((item) => normalizeStage(item, null)) : []
}

export async function saveStage(projectPath, stage = {}) {
  const modules = await listModules(projectPath)
  const entry = normalizeStage(stage, new Set(modules.map((item) => item.id)))
  const stages = await listStages(projectPath)
  const index = stages.findIndex((item) => item.id === entry.id)
  const stamp = now()
  if (index >= 0) {
    entry.createdAt = stages[index].createdAt ?? stamp
    stages[index] = { ...entry, createdAt: entry.createdAt, updatedAt: stamp }
  } else {
    entry.createdAt = stamp
    entry.updatedAt = stamp
    stages.push(entry)
  }
  await writeJson(stagesFile(projectPath), { schemaVersion: 1, stages })
  await touchMeta(projectPath)
  return stages.find((item) => item.id === entry.id)
}

export async function deleteStage(projectPath, id) {
  const stages = await listStages(projectPath)
  await writeJson(stagesFile(projectPath), { schemaVersion: 1, stages: stages.filter((item) => item.id !== id) })
  await touchMeta(projectPath)
  return stages.filter((item) => item.id !== id)
}

export async function listTasks(projectPath) {
  const raw = await readJson(tasksFile(projectPath), { tasks: [] }, { strict: true })
  return Array.isArray(raw.tasks) ? raw.tasks : []
}

export async function saveTask(projectPath, task = {}) {
  return runExclusive(projectPath, () => saveTaskInner(projectPath, task))
}

async function saveTaskInner(projectPath, task = {}) {
  const modules = await listModules(projectPath)
  const stages = await listStages(projectPath)
  const existingTasks = await listTasks(projectPath)
  const existing = existingTasks.find((item) => item.id === task?.id) ?? null
  // P2：并发写保护（传了 expectedRevision 时必须匹配）
  assertRevision(existing?.revision ?? 0, task.expectedRevision, '任务')
  // 局部更新：未提供的字段沿用旧任务（只改 goal / allowedPaths 不应被必填校验拒绝）。
  const merged = existing ? { ...existing, ...task } : { ...task }
  merged.revision = bumpRevision(existing?.revision ?? 0)
  if (task.result === undefined && existing) merged.result = existing.result
  if (!task.baseStructureHash && existing) merged.baseStructureHash = existing.baseStructureHash
  // 运行态不允许被普通保存降回 todo。
  if (existing && TASK_STATUS.includes(task.status) && task.status === 'todo' && existing.status !== 'todo') {
    merged.status = existing.status
  }
  const entry = normalizeTask(merged, new Set(modules.map((item) => item.id)), stages)
  const tasks = existingTasks
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
  return runExclusive(projectPath, async () => {
    const tasks = await listTasks(projectPath)
    await writeJson(tasksFile(projectPath), { schemaVersion: 1, tasks: tasks.filter((item) => item.id !== id) })
    await touchMeta(projectPath)
    return tasks.filter((item) => item.id !== id)
  })
}

/** 任务定义 hash（不含运行态字段），用于确认凭据。 */
export function taskDefinitionHash(task) {
  const { revision, result, confirmation, confirmed, acceptedAt, status, createdAt, updatedAt, ...rest } = task ?? {}
  return sha256(JSON.stringify(rest))
}

export function sha256(value) {
  return createHash('sha256').update(value).digest('hex')
}

/** 用户确认任务变更：生成绑定内容与文件基线的确认凭据（P3）；状态进入 review。 */
export function confirmTask(projectPath, id, options = {}) {
  return runExclusive(projectPath, async () => {
    const tasks = await listTasks(projectPath)
    const task = tasks.find((item) => item.id === id)
    if (!task) throw new Error(`任务不存在：${id}`)
    const files = Array.isArray(options.files) ? options.files : []
    const baselines = []
    for (const file of files) {
      const target = join(projectPath, String(file.path ?? ''))
      const stat = await fsp.stat(target).catch(() => null)
      if (!stat || !stat.isFile()) { baselines.push({ path: file.path, exists: false }); continue }
      const hash = sha256(await fsp.readFile(target))
      baselines.push({ path: file.path, exists: true, hash, size: stat.size })
    }
    const revision = bumpRevision(task.revision)
    const payloadHash = files.length
      ? sha256(JSON.stringify(files.map((file) => ({ path: file.path, content: file.content ?? '' }))))
      : taskDefinitionHash(task)
    const confirmation = {
      id: randomUUID(),
      revision,
      payloadHash,
      hasFiles: files.length > 0,
      fileBaselines: baselines,
      confirmedAt: now(),
      source: options.source === 'agent' ? 'agent' : 'user',
    }
    const next = tasks.map((item) => {
      if (item.id !== id) return item
      return { ...item, confirmed: true, confirmation, revision, status: 'review', updatedAt: now() }
    })
    await writeJson(tasksFile(projectPath), { schemaVersion: 1, tasks: next })
    await touchMeta(projectPath)
    return next.find((item) => item.id === id)
  })
}

/** 写后验收：记录 acceptedAt 并把状态置为 done。 */
export function acceptTask(projectPath, id) {
  return runExclusive(projectPath, async () => {
    const tasks = await listTasks(projectPath)
    const task = tasks.find((item) => item.id === id)
    if (!task) throw new Error(`任务不存在：${id}`)
    const next = tasks.map((item) => (
      item.id === id
        ? { ...item, acceptedAt: now(), status: 'done', revision: bumpRevision(item.revision), updatedAt: now() }
        : item
    ))
    await writeJson(tasksFile(projectPath), { schemaVersion: 1, tasks: next })
    await touchMeta(projectPath)
    return next.find((item) => item.id === id)
  })
}

/** 回滚后取消确认：confirmed=false，状态回到 doing。 */
export function unconfirmTask(projectPath, id) {
  return runExclusive(projectPath, async () => {
    const tasks = await listTasks(projectPath)
    const task = tasks.find((item) => item.id === id)
    if (!task) throw new Error(`任务不存在：${id}`)
    const stamp = now()
    const next = tasks.map((item) => (item.id === id
      ? { ...item, confirmed: false, confirmation: undefined, status: 'doing', revision: bumpRevision(item.revision), updatedAt: stamp }
      : item))
    await writeJson(tasksFile(projectPath), { schemaVersion: 1, tasks: next })
    await touchMeta(projectPath)
    return next.find((item) => item.id === id)
  })
}

/** 计划页一次读全：构想、模块、阶段、任务。 */
export async function readPlan(projectPath) {
  const [ideas, modules, stages, tasks] = await Promise.all([
    listFeatures(projectPath),
    listModules(projectPath),
    listStages(projectPath),
    listTasks(projectPath),
  ])
  return { ideas, modules, stages, tasks, systems: modules }
}

/** 导出计划简报（Markdown）。 */
export async function exportPlan(projectPath) {
  const [meta, plan] = await Promise.all([readProjectMeta(projectPath), readPlan(projectPath)])
  const lines = [`# ${meta?.name || '项目'} 计划简报`, '', `> 生成时间：${now()}`, '']
  for (const module of plan.modules) {
    lines.push(`## 模块：${module.name}（${module.id}）`)
    if (module.responsibility) lines.push('', module.responsibility)
    if (module.invariants?.length) lines.push('', `不变量：${module.invariants.join('；')}`)
    const stages = plan.stages.filter((stage) => stage.moduleId === module.id).sort((a, b) => a.order - b.order)
    for (const stage of stages) {
      lines.push('', `### 阶段 ${stage.order + 1}：${stage.name}（${stage.status}）`)
      const tasks = plan.tasks.filter((task) => (task.moduleId ?? task.systemId) === module.id && task.stageId === stage.id)
      for (const task of tasks) {
        lines.push(`- [${task.confirmed ? 'x' : ' '}] ${task.title}（${task.id}，${task.status}）`)
        if (task.goal) lines.push(`  - 目标：${task.goal}`)
        if (task.acceptance?.length) lines.push(`  - 验收：${task.acceptance.join('；')}`)
      }
    }
    const ungrouped = plan.tasks.filter((task) => (task.moduleId ?? task.systemId) === module.id && !task.stageId)
    if (ungrouped.length) {
      lines.push('', '### 未分组任务')
      for (const task of ungrouped) {
        lines.push(`- [${task.confirmed ? 'x' : ' '}] ${task.title}（${task.id}，${task.status}）`)
      }
    }
    lines.push('')
  }
  return `${lines.join('\n')}\n`
}

/** 项目接手指南：项目元数据 + 计划摘要，供新 agent 快速接手。 */
export async function buildHandoff(projectPath) {
  const [meta, plan] = await Promise.all([readProjectMeta(projectPath), readPlan(projectPath)])
  const pending = plan.tasks.filter((task) => !task.confirmed && task.status !== 'done')
  return {
    project: {
      name: meta?.name ?? '',
      modid: meta?.modid ?? '',
      loader: meta?.loader ?? '',
      minecraft: meta?.minecraft ?? '',
    },
    plan: {
      modules: plan.modules.length,
      stages: plan.stages.length,
      tasks: plan.tasks.length,
      pending: pending.length,
      items: plan.tasks.map((task) => ({
        id: task.id,
        title: task.title,
        status: task.status,
        confirmed: task.confirmed === true,
        moduleId: task.moduleId ?? task.systemId,
        stageId: task.stageId ?? '',
      })),
    },
  }
}
