/**
 * 项目数据备份与失败回滚。
 *
 * 导入 / 重新导入会连续写 `project.json`、`features.json`、`items/*.json`、
 * 快照与结构文档；中途任何一步失败都会留下“半导入”状态。这里在操作前把
 * 整个 `.mcstudio/` 复制到插件数据目录，失败时原地恢复。
 *
 * 备份放在 `$DSH_HOME/mcmods-studio/backups/`，不写进项目，避免下一次备份
 * 把上一次的备份再复制一遍。
 */

import { promises as fsp } from 'node:fs'
import { createHash } from 'node:crypto'
import { basename, dirname, join, resolve } from 'node:path'

import { dataDir, isDirectory, isFile, isInside } from './registry.js'

/** 把项目路径变成稳定的短标识，避免不同项目的备份混在一起。 */
function projectKey(projectPath) {
  return createHash('sha256').update(resolve(projectPath).toLowerCase()).digest('hex').slice(0, 12)
}

/** 时间戳里不能出现 Windows 文件名非法字符。 */
function stamp() {
  return new Date().toISOString().replace(/[:.]/g, '-')
}

/** 清理 reason，只保留安全字符。 */
function safeReason(reason) {
  return String(reason || 'backup').replace(/[^a-z0-9_-]+/gi, '-').slice(0, 40) || 'backup'
}

/**
 * 备份项目的 `.mcstudio/`。
 *
 * 返回备份目录（包含 `mcstudio/` 子目录）；没有工坊数据时返回 null。
 */
export async function createProjectBackup(projectPath, reason = 'backup') {
  const source = join(projectPath, '.mcstudio')
  if (!(await isDirectory(source))) return null

  const root = join(dataDir(), 'backups')
  if (isInside(projectPath, root)) {
    throw new Error('备份目录不能位于项目目录内，请检查 DSH_HOME 设置')
  }

  const dir = join(root, `${basename(projectPath)}-${projectKey(projectPath)}`, `${stamp()}-${safeReason(reason)}`)
  await fsp.mkdir(dir, { recursive: true })
  await fsp.cp(source, join(dir, 'mcstudio'), { recursive: true, errorOnExist: true, force: false })

  // 导入也会重写 docs/mcstudio-snapshot.md；一并备份，回滚时才能完全还原。
  const snapshot = join(projectPath, 'docs', 'mcstudio-snapshot.md')
  if (await isFile(snapshot)) {
    await fsp.mkdir(join(dir, 'docs'), { recursive: true })
    await fsp.cp(snapshot, join(dir, 'docs', 'mcstudio-snapshot.md'))
  }
  return dir
}

/** 用备份覆盖当前 `.mcstudio/` 与快照；只应在同一次操作的 catch 中调用。 */
export async function restoreProjectBackup(projectPath, backupDir) {
  const target = join(projectPath, '.mcstudio')
  await fsp.rm(target, { recursive: true, force: true })
  await fsp.cp(join(backupDir, 'mcstudio'), target, { recursive: true })

  const snapshot = join(projectPath, 'docs', 'mcstudio-snapshot.md')
  if (await isFile(join(backupDir, 'docs', 'mcstudio-snapshot.md'))) {
    await fsp.mkdir(dirname(snapshot), { recursive: true })
    await fsp.cp(join(backupDir, 'docs', 'mcstudio-snapshot.md'), snapshot)
  } else {
    // 备份时没有快照，说明是本次操作新建的；回滚时一并移除。
    await fsp.rm(snapshot, { force: true })
  }
}

/**
 * 在备份保护下执行一个会写项目数据的操作。
 *
 * - 操作成功：保留备份，返回 `{ result, backupDir }`；
 * - 操作失败：恢复备份（或删除半成品 `.mcstudio/`），再把原始错误抛出。
 */
export async function runWithProjectBackup(projectPath, fn, reason = 'backup') {
  const existed = await isDirectory(join(projectPath, '.mcstudio'))
  const snapshot = join(projectPath, 'docs', 'mcstudio-snapshot.md')
  const hadSnapshot = await isFile(snapshot)
  const backupDir = existed ? await createProjectBackup(projectPath, reason) : null

  try {
    return { result: await fn(), backupDir }
  } catch (error) {
    try {
      if (backupDir) await restoreProjectBackup(projectPath, backupDir)
      else {
        await fsp.rm(join(projectPath, '.mcstudio'), { recursive: true, force: true })
        // 首次导入可能新建快照；回滚时一并清掉，避免留下半个项目的说明文件。
        if (!hadSnapshot) await fsp.rm(snapshot, { force: true })
      }
    } catch (restoreError) {
      // 回滚失败时保留备份路径，方便人工恢复；不要把原始错误吞掉。
      const suffix = backupDir
        ? `；备份保留在 ${backupDir}，请手动恢复`
        : '；未能自动清理半成品 .mcstudio/'
      const message = `${error instanceof Error ? error.message : String(error)}${suffix}（回滚失败：${restoreError.message}）`
      if (error instanceof Error) error.message = message
      else throw new Error(message)
    }
    throw error
  }
}
