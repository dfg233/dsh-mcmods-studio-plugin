/**
 * 语言文件：`assets/<modid>/lang/zh_cn.json` 与 `en_us.json`
 *
 * 语言键跟随物品生命周期：创建物品时连带创建、删除物品时连带删除；
 * 语言页只编辑已存在的键，不允许新增任意键。
 *
 * 写入统一走「读 → 合并 → 备份 → 写 → 记历史」，与 content.apply 共用
 * 备份目录与 manifest 格式，因此旧 `content.rollback` 也能恢复语言文件。
 */

import { promises as fsp } from 'node:fs'
import { join, relative } from 'node:path'

import { writeJson } from './registry.js'
import { readProjectMeta, touchMeta } from './meta.js'
import { resolveAssetRoot } from './assets.js'
import { listItems } from './entries.js'
import { appendHistoryEntryUnlocked, withHistoryLock } from './history.js'
import { backupContentFiles, restoreContent } from './content.js'

/** 支持的 locale，顺序即界面列顺序。 */
export const LANG_LOCALES = ['zh_cn', 'en_us']

/** 语言键：物品用 item.，方块用 block.。 */
export function langKeyForItem(modid, item) {
  const prefix = item?.type === 'block' ? 'block' : 'item'
  return `${prefix}.${String(modid)}.${String(item?.id ?? '')}`
}

function rel(projectPath, file) {
  return relative(projectPath, file).replace(/\\/g, '/')
}

function langPath(assetRoot, locale) {
  return join(assetRoot, 'lang', `${locale}.json`)
}

/** 语言文件路径与位置类型。 */
export async function langFiles(projectPath) {
  const meta = await readProjectMeta(projectPath)
  if (!meta) throw new Error('项目不存在')
  const { root, standard } = await resolveAssetRoot(projectPath, meta.modid)
  return {
    modid: meta.modid,
    standard,
    root,
    files: Object.fromEntries(LANG_LOCALES.map((locale) => [locale, rel(projectPath, langPath(root, locale))])),
  }
}

/**
 * 读取两个语言文件。
 *
 * 文件缺失按空对象处理；JSON 损坏时返回空对象并带 warning，
 * 调用方据此进入只读模式，避免把损坏文件覆盖掉。
 */
export async function readLanguage(projectPath) {
  const info = await langFiles(projectPath)
  const data = {}
  let warning = null
  for (const locale of LANG_LOCALES) {
    const file = join(projectPath, info.files[locale])
    let raw
    try {
      raw = await fsp.readFile(file, 'utf8')
    } catch (error) {
      if (error?.code === 'ENOENT') {
        data[locale] = {}
        continue
      }
      throw error
    }
    try {
      const parsed = JSON.parse(raw)
      if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error('结构无效')
      data[locale] = parsed
    } catch {
      data[locale] = {}
      warning = `语言文件损坏：${info.files[locale]}`
    }
  }
  return { ...info, data, warning }
}

function itemKind(item) {
  return item?.type === 'block' ? 'block' : 'item'
}

/**
 * 聚合项目全部物品的语言键。
 *
 * - `zh` 在中文为空且英文存在时回填英文值，并标记 `zhFromEn`；
 * - `missing` 按原始值计算，回填不会掩盖缺失；
 * - `keyMissing` 表示两个 locale 都没有该键（旧项目）；
 * - `others` 是语言文件中不属于任何物品的键，只读。
 */
export async function listLanguages(projectPath) {
  const snapshot = await readLanguage(projectPath)
  const items = await listItems(projectPath)
  const zh = snapshot.data.zh_cn || {}
  const en = snapshot.data.en_us || {}
  const entries = []
  const known = new Set()

  for (const item of items) {
    if (item.type === 'creative_tab') continue
    const key = langKeyForItem(snapshot.modid, item)
    known.add(key)
    const rawZh = typeof zh[key] === 'string' ? zh[key] : ''
    const rawEn = typeof en[key] === 'string' ? en[key] : ''
    const missing = []
    if (!rawZh) missing.push('zh_cn')
    if (!rawEn) missing.push('en_us')
    entries.push({
      key,
      kind: itemKind(item),
      id: item.id,
      displayName: item.displayName || item.id,
      zh: rawZh || rawEn,
      en: rawEn,
      zhFromEn: !rawZh && Boolean(rawEn),
      missing,
      keyMissing: !(key in zh) && !(key in en),
    })
  }

  entries.sort((a, b) => {
    if (a.kind !== b.kind) return a.kind === 'block' ? -1 : 1
    return a.id.localeCompare(b.id)
  })

  const others = [...new Set([...Object.keys(zh), ...Object.keys(en)])]
    .filter((key) => !known.has(key))
    .sort()
    .map((key) => ({
      key,
      zh: typeof zh[key] === 'string' ? zh[key] : '',
      en: typeof en[key] === 'string' ? en[key] : '',
    }))

  return {
    modid: snapshot.modid,
    standard: snapshot.standard,
    root: snapshot.root,
    files: snapshot.files,
    entries,
    others,
    stats: {
      total: entries.length,
      missingZh: entries.filter((entry) => entry.missing.includes('zh_cn')).length,
      missingEn: entries.filter((entry) => entry.missing.includes('en_us')).length,
      missingKey: entries.filter((entry) => entry.keyMissing).length,
      unknown: others.length,
    },
    warning: snapshot.warning,
  }
}

/**
 * 计算将要写入的文件；不落盘。
 *
 * `allowCreate` 为真时才允许写入当前文件中不存在的键（生命周期/补建使用）；
 * 语言页保存走默认值，只允许修改已存在的键。
 */
async function planLanguageChange(projectPath, changes, options = {}) {
  const snapshot = await readLanguage(projectPath)
  if (snapshot.warning) throw new Error(`${snapshot.warning}，请先修复后再保存`)
  if (!snapshot.modid) throw new Error('项目缺少 modid')

  const items = await listItems(projectPath)
  const allowed = new Set(items.map((item) => langKeyForItem(snapshot.modid, item)))
  const allowCreate = options.allowCreate === true
  const next = {}
  const fileRefs = []

  for (const locale of LANG_LOCALES) {
    const current = snapshot.data[locale] || {}
    const data = { ...current }
    const localeChanges = changes?.[locale]
    if (!localeChanges || typeof localeChanges !== 'object') continue
    for (const [key, value] of Object.entries(localeChanges)) {
      const text = typeof value === 'string' ? value : String(value ?? '')
      const inCurrent = key in current
      // 允许删除文件里已存在的键（例如物品刚被删除后的清理）；
      // 其他不在当前物品列表里的键一律拒绝，避免误改手写/其他模组的键。
      if (!allowed.has(key) && !(inCurrent && !text)) {
        throw new Error(`语言键不属于当前项目的物品：${key}`)
      }
      if (!allowCreate && !inCurrent && text) {
        throw new Error(`语言键尚未创建，请使用「补建缺失键」：${key}`)
      }
      if (text) data[key] = text
      else delete data[key]
    }
    if (JSON.stringify(data) !== JSON.stringify(current)) {
      next[locale] = data
      fileRefs.push({ kind: 'lang', path: snapshot.files[locale] })
    }
  }

  return { snapshot, next, fileRefs }
}

/** 预览语言写入：只返回文件与键的增删改统计。 */
export async function previewLanguage(projectPath, changes) {
  const { snapshot, next, fileRefs } = await planLanguageChange(projectPath, changes)
  const files = fileRefs.map((file) => {
    const locale = file.path.endsWith('zh_cn.json') ? 'zh_cn' : 'en_us'
    const before = snapshot.data[locale] || {}
    const after = next[locale]
    const added = Object.keys(after).filter((key) => !(key in before)).length
    const removed = Object.keys(before).filter((key) => !(key in after)).length
    const updated = Object.keys(after).filter((key) => key in before && before[key] !== after[key]).length
    return { locale, path: file.path, action: 'update', added, updated, removed }
  })
  return { files, changes }
}

/**
 * 应用语言变更。
 *
 * @param {string} projectPath
 * @param {{ zh_cn?: Record<string,string>, en_us?: Record<string,string> }} changes
 * @param {{ allowCreate?: boolean, scope?: 'item'|'project', itemId?: string, title?: string }} [options]
 */
export async function applyLanguage(projectPath, changes, options = {}) {
  return withHistoryLock(projectPath, async () => {
    const { snapshot, next, fileRefs } = await planLanguageChange(projectPath, changes, options)
    if (!fileRefs.length) return { files: [], backupDir: null, historyEntry: null }

    const backupDir = await backupContentFiles(projectPath, fileRefs)
    try {
      for (const locale of Object.keys(next)) {
        await writeJson(join(projectPath, snapshot.files[locale]), next[locale])
      }
      await touchMeta(projectPath)
    } catch (error) {
      await restoreContent(projectPath, backupDir).catch(() => {})
      throw new Error(`语言文件写入失败，已回滚：${error.message}`)
    }

    let historyEntry
    try {
      historyEntry = await appendHistoryEntryUnlocked(projectPath, {
        itemId: options.itemId || '',
        files: fileRefs,
        backupDir,
        scope: options.scope === 'item' ? 'item' : 'project',
        title: options.title || '语言文件：zh_cn/en_us',
      })
    } catch (error) {
      await restoreContent(projectPath, backupDir).catch(() => {})
      throw new Error(`语言文件已写入但历史记录失败，已回滚：${error.message}`)
    }

    return { files: fileRefs, backupDir, historyEntry }
  })
}

/** 创建物品时连带创建语言键；已存在任一 locale 的键则跳过。 */
export async function ensureItemLanguage(projectPath, item) {
  const snapshot = await readLanguage(projectPath)
  if (snapshot.warning) throw new Error(snapshot.warning)
  const key = langKeyForItem(snapshot.modid, item)
  const zh = snapshot.data.zh_cn || {}
  const en = snapshot.data.en_us || {}
  if (key in zh || key in en) return { created: [], files: [], backupDir: null, historyEntry: null }

  const value = item.displayName || ''
  const result = await applyLanguage(
    projectPath,
    { zh_cn: { [key]: value }, en_us: { [key]: value } },
    { allowCreate: true, scope: 'item', itemId: item.id, title: `创建 ${item.id}：语言` },
  )
  return { created: [key], ...result }
}

/** 删除物品时连带删除语言键；不存在则跳过。 */
export async function removeItemLanguage(projectPath, item) {
  const snapshot = await readLanguage(projectPath)
  if (snapshot.warning) throw new Error(snapshot.warning)
  const key = langKeyForItem(snapshot.modid, item)
  const zh = snapshot.data.zh_cn || {}
  const en = snapshot.data.en_us || {}
  if (!(key in zh) && !(key in en)) return { removed: [], files: [], backupDir: null, historyEntry: null }

  const result = await applyLanguage(
    projectPath,
    { zh_cn: { [key]: '' }, en_us: { [key]: '' } },
    { scope: 'item', itemId: item.id, title: `删除 ${item.id}：语言` },
  )
  return { removed: [key], ...result }
}

/** 为所有缺少语言键的物品补建（旧项目迁移）。 */
export async function ensureAllLanguage(projectPath) {
  const snapshot = await readLanguage(projectPath)
  if (snapshot.warning) throw new Error(snapshot.warning)
  const items = await listItems(projectPath)
  const zh = snapshot.data.zh_cn || {}
  const en = snapshot.data.en_us || {}
  const changes = { zh_cn: {}, en_us: {} }
  let created = 0

  for (const item of items) {
    if (item.type === 'creative_tab') continue
    const key = langKeyForItem(snapshot.modid, item)
    if (key in zh || key in en) continue
    const value = item.displayName || ''
    changes.zh_cn[key] = value
    changes.en_us[key] = value
    created += 1
  }

  if (!created) return { created: 0, files: [], backupDir: null, historyEntry: null }
  const result = await applyLanguage(projectPath, changes, {
    allowCreate: true, scope: 'project', title: '语言文件：补建缺失键',
  })
  return { created, ...result }
}
