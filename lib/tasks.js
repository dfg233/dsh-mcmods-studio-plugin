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

import { isFile } from './registry.js'
import { listTasks, saveTask } from './workbench.js'
import { readProjectMeta } from './meta.js'
import { matchesPath, runChecks, writeStructureSnapshot } from './checks.js'
import { packContext } from './context.js'
import { backupContentFiles, restoreContent } from './content.js'
import { refreshStructure } from './structure.js'
import { applyCodegen, previewCodegen } from './codegen.js'

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
    // TASK-SPEC：引用不存在 → 任务 blocked，而不是让调用方只拿到一个异常。
    const blocked = await saveTask(projectPath, {
      ...task,
      status: 'blocked',
      result: {
        ...(task.result ?? {}),
        missingRefs: context.missingRefs,
        blockedAt: new Date().toISOString(),
      },
    })
    return { task: blocked, blocked: true, missingRefs: context.missingRefs }
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
      task: { ...context.task, status: saved.status },
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
  // 保护路径优先：guard 命中时直接报「修改保护路径」，不再被越界提示遮蔽。
  const guarded = list.filter((file) => guard.some((item) => matchesPath(item, file.path)))
  if (guarded.length) {
    throw new Error(`修改保护路径：${guarded.map((item) => item.path).join(', ')}`)
  }
  const violations = list.filter((file) => !allowed.some((spec) => matchesPath(spec.path, file.path)))
  if (violations.length) {
    throw new Error(`越界修改：${violations.map((item) => item.path).join(', ')}`)
  }
  for (const file of list) ensureInside(projectPath, file.path)

  const actions = new Map()
  for (const file of list) {
    actions.set(file.path, (await isFile(join(projectPath, file.path))) ? 'modify' : 'create')
  }

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
      files: list.map((file) => ({ path: file.path, action: actions.get(file.path) ?? 'modify' })),
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

  // 没有声明检查时不假装通过：保持当前状态并给出警告，避免「漏检 = 通过」。
  if (!checks.length) {
    const saved = await saveTask(projectPath, {
      ...task,
      status: task.status === 'blocked' ? 'blocked' : 'doing',
      result: { ...(task.result ?? {}), checks: [], verifiedAt: new Date().toISOString() },
    })
    return {
      task: saved,
      checks,
      failed: 0,
      warning: '任务未声明检查，verify 未执行任何检查',
    }
  }

  const failed = checks.filter((item) => item.status === 'fail')
  const skipped = checks.filter((item) => item.status === 'skip')
  const status = failed.length ? 'blocked' : 'review'
  const saved = await saveTask(projectPath, {
    ...task,
    status,
    result: { ...(task.result ?? {}), checks, verifiedAt: new Date().toISOString() },
  })
  return {
    task: saved,
    checks,
    failed: failed.length,
    ...(skipped.length && !failed.length
      ? { warning: `${skipped.length} 项检查被跳过，任务仍需人工确认` }
      : {}),
  }
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

function checkCodegenPaths(task, files) {
  const allowed = normalizeAllowedPaths(task.allowedPaths)
  const guard = (task.guardPaths ?? []).map(String)
  const violations = []
  const guarded = []
  for (const file of files) {
    if (!allowed.some((spec) => matchesPath(spec.path, file.path))) violations.push(file.path)
    if (guard.some((item) => matchesPath(item, file.path))) guarded.push(file.path)
  }
  return { violations, guarded }
}

function codegenInput(task, input) {
  return {
    ...input,
    templateRefs: Array.isArray(input.templateRefs) && input.templateRefs.length
      ? input.templateRefs
      : task.templateRefs,
  }
}

/** 预览任务代码生成：默认使用任务的 templateRefs，并校验允许/保护路径。 */
export async function previewTaskCodegen(projectPath, taskId, input = {}) {
  const task = await findTask(projectPath, taskId)
  const preview = await previewCodegen(projectPath, codegenInput(task, input))
  const writes = preview.files.filter((file) => file.action === 'create' || file.action === 'update')
  const { violations, guarded } = checkCodegenPaths(task, writes)
  const blocked = new Set([...violations, ...guarded])
  return {
    files: preview.files.filter((file) => !blocked.has(file.path)),
    conflicts: preview.conflicts,
    violations,
    guarded,
    taskId,
  }
}

/** 应用任务代码生成：校验路径 → 写盘 → 记录到任务 result。 */
export async function applyTaskCodegen(projectPath, taskId, input = {}) {
  const task = await findTask(projectPath, taskId)
  const preview = await previewCodegen(projectPath, codegenInput(task, input))
  const writes = preview.files.filter((file) => file.action === 'create' || file.action === 'update')
  const { violations, guarded } = checkCodegenPaths(task, writes)
  if (guarded.length) throw new Error(`修改保护路径：${guarded.join(', ')}`)
  if (violations.length) throw new Error(`越界修改：${violations.join(', ')}`)

  const result = await applyCodegen(projectPath, codegenInput(task, input))
  const saved = await saveTask(projectPath, {
    ...task,
    status: 'doing',
    result: {
      ...(task.result ?? {}),
      files: [...(task.result?.files ?? []), ...result.files],
      backupDir: result.backupDir || task.result?.backupDir || '',
      appliedAt: new Date().toISOString(),
      ...(input.requestId ? { requestId: input.requestId } : {}),
    },
  })
  return {
    task: saved,
    files: result.files,
    created: result.created,
    conflicts: result.conflicts,
    backupDir: result.backupDir,
  }
}
