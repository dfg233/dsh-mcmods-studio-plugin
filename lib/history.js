/**
 * 内容历史：`.mcstudio/content-history.json`
 *
 * 每次 `content.apply` 成功写入资源后追加一步，记录该步写入前的备份目录。
 * 这里只存元数据，资源备份仍放在插件数据目录
 * （`$DSH_HOME/mcmods-studio/backups/<项目>/…`），不复制资源内容。
 *
 * 设计约束：
 *   - 不依赖 `content.js`：恢复资源的动作由 `content.js` 编排，
 *     否则 `content ↔ history` 会形成循环依赖；
 *   - 同进程内对同一项目的「读 → 改 → 写」用 `withHistoryLock` 串行化，
 *     避免并发写入互相覆盖；
 *   - 历史文件损坏时降级为空历史并给出 `warning`，不阻塞内容编辑。
 */

import { promises as fsp } from 'node:fs'
import { randomUUID } from 'node:crypto'
import { join, resolve } from 'node:path'

import { readJson, writeJson } from './registry.js'
import { itemsDir, projectDataDir } from './paths.js'

/** 历史文件名（位于 `.mcstudio/`）。 */
export const HISTORY_FILE = 'content-history.json'

/** 历史文件结构版本。 */
export const HISTORY_SCHEMA_VERSION = 1

/** 步骤状态。 */
export const HISTORY_STATUS = ['active', 'rolledBack', 'archived', 'failed']

/**
 * v0.2.1 内置默认值。
 *
 * 对应 `docs/plans/SETTINGS-PLAN.md` §2.3 的四项配置；设置页实现后
 * 由 `lib/settings.js` 读取同名配置覆盖，本版本固定使用这些默认值。
 */
export const DEFAULT_HISTORY_OPTIONS = {
  rollbackMode: 'toStep',
  keepBackups: true,
  scope: 'currentItem',
  maxEntries: 50,
}

/** 资源类别 → 中文标签，用于生成人类可读的步骤标题。 */
const KIND_LABELS = {
  lang: '语言',
  recipe: '配方',
  model: '模型',
  tag: '标签',
}

export function historyFile(projectPath) {
  return join(projectDataDir(projectPath), HISTORY_FILE)
}

function emptyStore(warning = null) {
  return { schemaVersion: HISTORY_SCHEMA_VERSION, entries: [], warning }
}

function safeInt(value, fallback = 0) {
  const number = Number(value)
  return Number.isFinite(number) ? Math.trunc(number) : fallback
}

function isEntryLike(entry) {
  return Boolean(entry) && typeof entry === 'object' && typeof entry.id === 'string' && entry.id !== ''
}

function normalizeFileRef(file) {
  if (!file || typeof file !== 'object') return null
  const path = typeof file.path === 'string' ? file.path : ''
  if (!path) return null
  return { kind: typeof file.kind === 'string' && file.kind ? file.kind : 'other', path }
}

/** 读入时纠偏：字段缺失不报错，按默认值补齐。 */
function normalizeEntry(entry, index) {
  const files = Array.isArray(entry.files) ? entry.files.map(normalizeFileRef).filter(Boolean) : []
  const status = HISTORY_STATUS.includes(entry.status) ? entry.status : 'active'
  return {
    id: entry.id,
    sequence: safeInt(entry.sequence, index + 1),
    at: typeof entry.at === 'string' ? entry.at : '',
    itemId: typeof entry.itemId === 'string' ? entry.itemId : '',
    title: typeof entry.title === 'string' ? entry.title : '',
    files,
    backupDir: typeof entry.backupDir === 'string' ? entry.backupDir : '',
    status,
    // 旧记录没有 scope；按物品级处理，保证向后兼容。
    scope: entry.scope === 'project' ? 'project' : 'item',
  }
}

/**
 * 读取历史。
 *
 * 返回 `{schemaVersion, entries, warning}`。文件缺失按空历史处理；
 * JSON 损坏或结构不对时同样返回空历史，但带 `warning` 供界面提示。
 */
export async function readHistoryStore(projectPath) {
  let raw
  try {
    raw = await fsp.readFile(historyFile(projectPath), 'utf8')
  } catch (error) {
    if (error?.code === 'ENOENT') return emptyStore()
    throw error
  }
  try {
    const parsed = JSON.parse(raw)
    if (!parsed || typeof parsed !== 'object' || !Array.isArray(parsed.entries)) {
      return emptyStore('内容历史文件结构无效，已按空历史处理')
    }
    return {
      schemaVersion: HISTORY_SCHEMA_VERSION,
      entries: parsed.entries.filter(isEntryLike).map(normalizeEntry),
      warning: null,
    }
  } catch {
    return emptyStore('内容历史文件损坏，已按空历史处理')
  }
}

/** 原子写回历史。 */
export async function writeHistoryStore(projectPath, store) {
  const entries = Array.isArray(store?.entries) ? store.entries.map(normalizeEntry) : []
  await writeJson(historyFile(projectPath), {
    schemaVersion: HISTORY_SCHEMA_VERSION,
    entries,
  })
}

// ── 写锁 ────────────────────────────────────────────────────

/** 按项目路径串行化的队列：同进程内历史读改写不交错。 */
const queues = new Map()

/**
 * 在项目级写锁内执行 `fn`。
 *
 * 前一个任务失败不影响后续任务；调用者拿到自己任务的真实结果或错误。
 */
export function withHistoryLock(projectPath, fn) {
  const key = resolve(String(projectPath || ''))
  const previous = queues.get(key) ?? Promise.resolve()
  const run = previous.then(fn, fn)
  queues.set(key, run.then(() => undefined, () => undefined))
  return run
}

// ── 追加、归档与上限 ────────────────────────────────────────

function maxEntriesOf(options) {
  const raw = Number(options?.maxEntries ?? DEFAULT_HISTORY_OPTIONS.maxEntries)
  if (!Number.isFinite(raw)) return DEFAULT_HISTORY_OPTIONS.maxEntries
  return Math.max(1, Math.min(500, Math.trunc(raw)))
}

function nextSequence(entries) {
  return entries.reduce((max, entry) => Math.max(max, safeInt(entry.sequence, 0)), 0) + 1
}

function uniqueId(entries) {
  const used = new Set(entries.map((entry) => entry.id))
  for (let attempt = 0; attempt < 20; attempt += 1) {
    const id = `h_${Date.now()}_${randomUUID().slice(0, 4)}`
    if (!used.has(id)) return id
  }
  return `h_${Date.now()}_${randomUUID().replace(/-/g, '').slice(0, 8)}`
}

function titleForItem(item, fallbackId, files) {
  const name = typeof item?.displayName === 'string' && item.displayName.trim()
    ? item.displayName.trim()
    : String(fallbackId || '').trim() || '内容'
  const kinds = []
  for (const file of files) {
    const label = KIND_LABELS[file.kind] || '资源'
    if (!kinds.includes(label)) kinds.push(label)
  }
  return `${name}：${kinds.length ? kinds.join('/') : '资源'}`
}

async function readItemName(projectPath, itemId) {
  const id = String(itemId || '').trim()
  if (!id) return null
  return readJson(join(itemsDir(projectPath), `${id}.json`), null)
}

/**
 * 归档超出上限的最旧非归档记录（保留记录与备份，不物理删除）。
 *
 * 返回被归档的条目。
 */
function archiveOverflow(store, options) {
  const limit = maxEntriesOf(options)
  const live = store.entries
    .filter((entry) => entry.status !== 'archived')
    .sort((a, b) => a.sequence - b.sequence)
  if (live.length <= limit) return []
  const overflow = live.slice(0, live.length - limit)
  for (const entry of overflow) entry.status = 'archived'
  return overflow
}

/**
 * 追加一步历史（调用方需已持有项目写锁）。
 *
 * @param {string} projectPath
 * @param {{ itemId?: string, files: Array<{kind: string, path: string}>, backupDir: string, title?: string, scope?: 'item'|'project' }} input
 * @param {{ maxEntries?: number }} [options]
 * @returns 追加后的条目（含 `id`、`sequence`、`status`）
 */
export async function appendHistoryEntryUnlocked(projectPath, input = {}, options = {}) {
  const files = (Array.isArray(input.files) ? input.files : []).map(normalizeFileRef).filter(Boolean)
  if (!files.length) throw new Error('内容历史缺少文件清单')
  const backupDir = typeof input.backupDir === 'string' ? input.backupDir.trim() : ''
  if (!backupDir) throw new Error('内容历史缺少备份目录')
  const itemId = typeof input.itemId === 'string' ? input.itemId : ''

  const store = await readHistoryStore(projectPath)

  // 下一次成功修改时，旧的回滚记录归档；不删除记录与备份。
  for (const entry of store.entries) {
    if (entry.status === 'rolledBack') entry.status = 'archived'
  }

  const item = await readItemName(projectPath, itemId)
  const entry = {
    id: uniqueId(store.entries),
    sequence: nextSequence(store.entries),
    at: new Date().toISOString(),
    itemId,
    title: (typeof input.title === 'string' && input.title.trim()) || titleForItem(item, itemId, files),
    files,
    backupDir,
    status: 'active',
    scope: input.scope === 'project' ? 'project' : 'item',
  }
  store.entries.push(entry)
  archiveOverflow(store, options)
  await writeHistoryStore(projectPath, store)
  return entry
}

/** 追加一步历史（自带项目写锁）。 */
export async function appendHistoryEntry(projectPath, input = {}, options = {}) {
  return withHistoryLock(projectPath, () => appendHistoryEntryUnlocked(projectPath, input, options))
}

// ── 查询 ────────────────────────────────────────────────────

/** 对外视图：不暴露备份目录绝对路径。 */
export function toPublicHistoryEntry(entry) {
  return {
    id: entry.id,
    sequence: entry.sequence,
    at: entry.at,
    itemId: entry.itemId,
    title: entry.title,
    status: entry.status,
    scope: entry.scope === 'project' ? 'project' : 'item',
    files: entry.files.map((file) => ({ kind: file.kind, path: file.path })),
    latest: false,
  }
}

/**
 * 列出内容历史。
 *
 * @param {string} projectPath
 * @param {{ itemId?: string, includeArchived?: boolean, scope?: 'item'|'project' }} [query]
 */
export async function listHistoryEntries(projectPath, query = {}) {
  const store = await readHistoryStore(projectPath)
  const includeArchived = query.includeArchived === true
  const itemId = typeof query.itemId === 'string' ? query.itemId.trim() : ''
  const scope = query.scope === 'project' || query.scope === 'item' ? query.scope : ''

  let entries = store.entries.slice()
  if (itemId) entries = entries.filter((entry) => entry.itemId === itemId)
  if (scope) entries = entries.filter((entry) => entry.scope === scope)
  if (!includeArchived) entries = entries.filter((entry) => entry.status !== 'archived')
  entries.sort((a, b) => b.sequence - a.sequence)

  const latestActive = entries.find((entry) => entry.status === 'active')
  const counts = { active: 0, rolledBack: 0, archived: 0, failed: 0 }
  for (const entry of store.entries) {
    if (counts[entry.status] !== undefined) counts[entry.status] += 1
  }

  return {
    entries: entries.map((entry) => ({
      ...toPublicHistoryEntry(entry),
      latest: Boolean(latestActive) && latestActive.id === entry.id,
    })),
    total: entries.length,
    counts,
    itemId,
    scope,
    includeArchived,
    options: { ...DEFAULT_HISTORY_OPTIONS },
    warning: store.warning,
  }
}
