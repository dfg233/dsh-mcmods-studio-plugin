/**
 * 代码生成：模板渲染 + 标记区块替换 + diff 预览 + 备份/回滚。
 *
 * 设计约束（见 docs/major/V0.4.0-PLAN.md 第 3.3 节）：
 *   - 整文件模板：已存在默认跳过，不覆盖；
 *   - 标记模板（`mode: "marker"`）：只改标记之间，文件不存在时用 `scaffold` 建骨架；
 *   - 预览给出 create/update/skip 与行数变化；应用前备份，失败回滚。
 */

import { promises as fsp } from 'node:fs'
import { dirname, join, resolve, sep } from 'node:path'

import { isFile } from './registry.js'
import { readProjectMeta } from './meta.js'
import { renderTemplateContent } from './templates.js'
import { appendMarker, hasMarker, replaceMarker } from './markers.js'
import { backupContentFiles, restoreContent } from './content.js'
import { refreshStructure } from './structure.js'

function ensureInside(projectPath, target) {
  const root = resolve(projectPath)
  const full = resolve(root, target)
  if (full !== root && !full.startsWith(root + sep)) throw new Error(`生成路径越界：${target}`)
  return full
}

function diffStats(before, after) {
  const left = String(before ?? '').split(/\r?\n/)
  const right = String(after ?? '').split(/\r?\n/)
  let additions = 0
  let removals = 0
  const max = Math.max(left.length, right.length)
  for (let index = 0; index < max; index += 1) {
    if (left[index] === right[index]) continue
    if (left[index] !== undefined) removals += 1
    if (right[index] !== undefined) additions += 1
  }
  return { additions, removals }
}

async function planMarkerFile(projectPath, file) {
  const target = ensureInside(projectPath, file.path)
  const current = await fsp.readFile(target, 'utf8').catch(() => null)
  const base = current === null ? file.scaffold : current
  if (!base) throw new Error(`目标文件不存在且模板没有 scaffold：${file.path}`)

  const next = hasMarker(base, file.marker)
    ? replaceMarker(base, file.marker, file.content)
    : appendMarker(base, file.marker, file.content)
  if (next === null || next === undefined) throw new Error(`标记替换失败：${file.path}`)

  const skip = current !== null && next === current
  return {
    path: file.path,
    action: current === null ? 'create' : (skip ? 'skip' : 'update'),
    marker: file.marker,
    ...diffStats(base, next),
    ...(skip ? {} : { content: next }),
  }
}

/**
 * 预览代码生成，不写盘。
 *
 * 输入：`{ templateRefs?: [{id, version?, parameters?}], fragments?: [{id, path, content}] }`
 * 返回：`{ files: [{path, action, marker?, additions?, removals?, content?}], conflicts }`
 */
export async function previewCodegen(projectPath, input = {}) {
  const meta = await readProjectMeta(projectPath)
  if (!meta) throw new Error('项目不存在')

  const files = []
  const conflicts = []

  for (const ref of input.templateRefs ?? []) {
    const rendered = await renderTemplateContent(projectPath, ref.id, ref.parameters ?? {})
    for (const file of rendered.files) {
      if (file.mode === 'marker') {
        const plan = await planMarkerFile(projectPath, file)
        if (plan.action === 'skip') conflicts.push({ path: plan.path, reason: '标记内容未变化' })
        files.push(plan)
        continue
      }
      const target = ensureInside(projectPath, file.path)
      const exists = await isFile(target)
      files.push({
        path: file.path,
        action: exists ? 'skip' : 'create',
        ...(exists ? {} : { content: file.content }),
      })
      if (exists) conflicts.push({ path: file.path, reason: '已存在，默认不覆盖' })
    }
  }

  for (const fragment of input.fragments ?? []) {
    const id = String(fragment?.id ?? '').trim()
    const relPath = String(fragment?.path ?? '').replace(/\\/g, '/').trim()
    const content = typeof fragment?.content === 'string' ? fragment.content : ''
    if (!id || !relPath) continue
    const target = ensureInside(projectPath, relPath)
    const current = await fsp.readFile(target, 'utf8').catch(() => null)
    if (current === null) throw new Error(`标记目标文件不存在：${relPath}`)
    const next = hasMarker(current, id)
      ? replaceMarker(current, id, content)
      : appendMarker(current, id, content)
    const skip = next === current
    files.push({
      path: relPath,
      action: skip ? 'skip' : 'update',
      marker: id,
      ...diffStats(current, next),
      ...(skip ? {} : { content: next }),
    })
    if (skip) conflicts.push({ path: relPath, reason: '标记内容未变化' })
  }

  return { files, conflicts }
}

/** 应用代码生成：预览 → 备份 → 写入 → 刷新结构；失败回滚。 */
export async function applyCodegen(projectPath, input = {}) {
  const preview = await previewCodegen(projectPath, input)
  const writes = preview.files.filter((file) => file.action === 'create' || file.action === 'update')
  if (!writes.length) {
    return { files: [], conflicts: preview.conflicts, backupDir: null, created: [] }
  }

  const backupDir = await backupContentFiles(projectPath, writes.map((file) => ({ path: file.path })))
  const created = []
  try {
    for (const file of writes) {
      const target = ensureInside(projectPath, file.path)
      await fsp.mkdir(dirname(target), { recursive: true })
      await fsp.writeFile(target, file.content, 'utf8')
      if (file.action === 'create') created.push(file.path)
    }
    await refreshStructure(projectPath).catch(() => {})
  } catch (error) {
    await restoreContent(projectPath, backupDir).catch(() => {})
    for (const relPath of created) {
      await fsp.rm(join(projectPath, relPath), { force: true }).catch(() => {})
    }
    throw error
  }

  return {
    files: writes.map(({ path, action, marker }) => ({ path, action, ...(marker ? { marker } : {}) })),
    conflicts: preview.conflicts,
    backupDir,
    created,
  }
}
