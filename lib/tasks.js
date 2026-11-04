/**
 * 任务执行：开始（快照）→ 应用（备份/写入）→ 验证（检查）→ 回滚。
 *
 * 设计约束（见 docs/major/V0.3.0-PLAN.md 第 8 节）：
 *   - apply 只写 allowedPaths，guardPaths 一律拒绝；越界直接报错；
 *   - 写入前备份、写入后刷新结构，失败回滚；
 *   - 验证由任务 `verify` 声明的检查组成，全部通过进入 review，否则 blocked；
 *   - 同 requestId 的 apply 幂等。
 */

import { promises as fsp } from 'node:fs'
import { dirname, join, resolve, sep } from 'node:path'

import { listTasks, saveTask } from './workbench.js'
import { readProjectMeta } from './meta.js'
import { matchesPath, runChecks, writeStructureSnapshot } from './checks.js'
import { packContext } from './context.js'
import { backupContentFiles, restoreContent } from './content.js'
import { refreshStructure } from './structure.js'

async function findTask(projectPath, taskId) {
  const tasks = await listTasks(projectPath)
  const task = tasks.find((item) => item.id === taskId)
  if (!task) throw new Error(`任务不存在：${taskId}`)
  return task
}

function ensureInside(projectPath, target) {
  const root = resolve(projectPath)
  const full = resolve(root, target)
  if (full !== root && !full.startsWith(root + sep)) throw new Error(`写入路径越界：${target}`)
  return full
}

function normalizeAllowedPaths(list) {
  return (Array.isArray(list) ? list : []).map((item) => (
    typeof item === 'string' ? { path: item, mode: 'modify' } : { path: String(item?.path ?? ''), mode: 'modify' }
  )).filter((item) => item.path)
}

function normalizeApplyFiles(files) {
  return (Array.isArray(files) ? files : [])
    .map((file) => ({
      path: String(file?.path ?? '').replace(/\\/g, '/').trim(),
      content: typeof file?.content === 'string' ? file.content : '',
    }))
    .filter((file) => file.path)
}

/** 开始任务：校验引用、保存结构快照、状态转为 doing。 */
export async function startTask(projectPath, taskId) {
  const task = await findTask(projectPath, taskId)
  const meta = await readProjectMeta(projectPath)
  if (!meta) throw new Error('项目不存在')

  const context = await packContext(projectPath, taskId)
  if (context.missingRefs.length) {
    throw new Error(`codeRefs 无法解析：${context.missingRefs.join(', ')}`)
  }

  await refreshStructure(projectPath).catch(() => {})
  let baseStructureHash = task.baseStructureHash || ''
  if (!baseStructureHash) {
    baseStructureHash = await writeStructureSnapshot(projectPath).catch(() => '')
  }

  const saved = await saveTask(projectPath, {
    ...task,
    baseStructureHash,
    status: 'doing',
    result: { ...(task.result ?? {}), startedAt: new Date().toISOString() },
  })
  return {
    task: saved,
    context: {
      task: context.task,
      templates: context.templates,
      apiUnknown: context.apiUnknown,
      budget: context.budget,
      missingRefs: context.missingRefs,
    },
  }
}

/** 应用变更集：校验路径 → 备份 → 写入 → 刷新结构；失败回滚。 */
export async function applyTask(projectPath, taskId, files, options = {}) {
  const task = await findTask(projectPath, taskId)
  if (options.requestId && task.result?.appliedAt && task.result.requestId === options.requestId) {
    return {
      task,
      files: task.result.files ?? [],
      backupDir: task.result.backupDir,
      cached: true,
    }
  }

  const list = normalizeApplyFiles(files)
  if (!list.length) throw new Error('变更集为空')

  const allowed = normalizeAllowedPaths(task.allowedPaths)
  const guard = (task.guardPaths ?? []).map(String)
  const violations = list.filter((file) => !allowed.some((spec) => matchesPath(spec.path, file.path)))
  if (violations.length) {
    throw new Error(`越界修改：${violations.map((item) => item.path).join(', ')}`)
  }
  const guarded = list.filter((file) => guard.some((item) => matchesPath(item, file.path)))
  if (guarded.length) {
    throw new Error(`修改保护路径：${guarded.map((item) => item.path).join(', ')}`)
  }
  for (const file of list) ensureInside(projectPath, file.path)

  const backupDir = await backupContentFiles(projectPath, list.map((file) => ({ path: file.path })))
  try {
    for (const file of list) {
      const target = ensureInside(projectPath, file.path)
      await fsp.mkdir(dirname(target), { recursive: true })
      await fsp.writeFile(target, file.content, 'utf8')
    }
    await refreshStructure(projectPath).catch(() => {})
  } catch (error) {
    await restoreContent(projectPath, backupDir).catch(() => {})
    throw error
  }

  const saved = await saveTask(projectPath, {
    ...task,
    status: 'doing',
    result: {
      ...(task.result ?? {}),
      files: list.map((file) => ({ path: file.path, action: 'modify' })),
      backupDir,
      appliedAt: new Date().toISOString(),
      requestId: options.requestId ?? '',
    },
  })
  return { task: saved, files: saved.result.files, backupDir }
}

/** 验证任务：执行声明的检查，写入 result.checks。 */
export async function verifyTask(projectPath, taskId, options = {}) {
  const task = await findTask(projectPath, taskId)
  const checks = await runChecks(projectPath, task, {
    files: task.result?.files ?? [],
    compile: options.compile,
  })
  const failed = checks.filter((item) => item.status === 'fail')
  const status = failed.length ? 'blocked' : 'review'
  const saved = await saveTask(projectPath, {
    ...task,
    status,
    result: { ...(task.result ?? {}), checks, verifiedAt: new Date().toISOString() },
  })
  return { task: saved, checks, failed: failed.length }
}

/** 回滚任务：用 result.backupDir 恢复本任务文件。 */
export async function rollbackTask(projectPath, taskId) {
  const task = await findTask(projectPath, taskId)
  const backupDir = task.result?.backupDir
  if (!backupDir) throw new Error('任务没有可回滚的备份')
  await restoreContent(projectPath, backupDir)
  await refreshStructure(projectPath).catch(() => {})
  const saved = await saveTask(projectPath, {
    ...task,
    status: 'doing',
    result: {
      ...(task.result ?? {}),
      files: [],
      backupDir: '',
      rolledBackAt: new Date().toISOString(),
    },
  })
  return { task: saved, restored: true }
}
