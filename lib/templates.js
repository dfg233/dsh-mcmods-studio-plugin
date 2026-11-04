/**
 * 模板：清单、参数校验、渲染、预览、应用。
 *
 * 模板放在插件根 `templates/<id>/`（`template.json` + `files/*.tpl`）。
 * 设计约束（见 docs/major/V0.3.0-PLAN.md 第 5 节）：
 *   - 参数由插件校验，不信任调用方；
 *   - 已存在文件默认跳过，只有 `merge: "json"` 才合并；
 *   - 写入前备份（复用 content 的备份格式），失败回滚；
 *   - 模板生成的 Java 只出骨架，注册行由后续任务或用户补。
 */

import { promises as fsp } from 'node:fs'
import { dirname, join, resolve, sep } from 'node:path'
import { fileURLToPath } from 'node:url'

import { readProjectMeta } from './meta.js'
import { backupContentFiles, restoreContent } from './content.js'
import { refreshStructure } from './structure.js'
import { isFile, readJson } from './registry.js'

const here = dirname(fileURLToPath(import.meta.url))
const TEMPLATE_DIR = join(here, '..', 'templates')

const TEMPLATE_ID = /^[a-z0-9-]+$/
const ITEM_ID = /^[a-z][a-z0-9_]{0,63}$/

/** 模板根目录（插件根下的 templates/）。 */
export function templateRoot() {
  return TEMPLATE_DIR
}

/** 列出内置模板摘要。 */
export async function listTemplates() {
  const entries = await fsp.readdir(TEMPLATE_DIR, { withFileTypes: true }).catch(() => [])
  const list = []
  for (const entry of entries) {
    if (!entry.isDirectory() || !TEMPLATE_ID.test(entry.name)) continue
    const manifest = await readJson(join(TEMPLATE_DIR, entry.name, 'template.json'), null)
    if (!manifest) continue
    list.push({
      id: manifest.id || entry.name,
      name: manifest.name || entry.name,
      version: manifest.version ?? 1,
      category: manifest.category || '',
      loaders: Array.isArray(manifest.loaders) ? manifest.loaders : [],
      mcVersion: manifest.mcVersion || '',
      description: manifest.description || '',
      parameters: (manifest.parameters || []).map((item) => ({
        key: item.key,
        type: item.type || 'string',
        required: Boolean(item.required),
        default: item.default,
      })),
    })
  }
  return list.sort((left, right) => left.id.localeCompare(right.id))
}

async function readManifest(id) {
  const normalized = String(id ?? '').trim()
  if (!TEMPLATE_ID.test(normalized)) throw new Error(`模板 id 不合法：${normalized}`)
  const dir = join(TEMPLATE_DIR, normalized)
  const manifest = await readJson(join(dir, 'template.json'), null)
  if (!manifest) throw new Error(`模板不存在：${normalized}`)
  return { dir, manifest }
}

/** 读取模板清单与文件原文。 */
export async function getTemplate(id) {
  const { dir, manifest } = await readManifest(id)
  const files = []
  for (const file of manifest.files || []) {
    const content = await fsp.readFile(join(dir, file.template), 'utf8').catch(() => '')
    files.push({
      path: file.path,
      template: file.template,
      merge: file.merge || '',
      when: file.when || 'always',
      content,
    })
  }
  return { ...manifest, files }
}

function pascal(id) {
  return String(id)
    .split(/[_-]+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join('')
}

/** 合并参数：默认值、类型校验、派生变量。 */
function normalizeParams(manifest, input, meta) {
  const params = {}
  for (const spec of manifest.parameters || []) {
    const key = spec.key
    if (!key) continue
    let value = input?.[key]
    if (value === undefined || value === null || value === '') value = spec.default
    if (spec.required && (value === undefined || value === null || value === '')) {
      throw new Error(`缺少模板参数：${key}`)
    }
    if (value === undefined || value === null) continue
    const type = spec.type || 'string'
    if (type === 'number') {
      const num = Number(value)
      if (!Number.isFinite(num)) throw new Error(`参数 ${key} 必须是数字`)
      value = num
    } else if (type === 'boolean') {
      value = Boolean(value)
    } else {
      value = String(value)
    }
    if (key === 'id' && !ITEM_ID.test(value)) throw new Error(`物品 id 不合法：${value}`)
    params[key] = value
  }

  // 未声明的参数也接受，便于传递 package 等；只收基本类型。
  for (const [key, value] of Object.entries(input ?? {})) {
    if (key in params || value === undefined || value === null || value === '') continue
    params[key] = typeof value === 'number' || typeof value === 'boolean' ? value : String(value)
  }

  if (!params.modid) params.modid = meta?.modid || ''
  if (!params.modid) throw new Error('无法确定 modid')
  if (params.id && !ITEM_ID.test(params.id)) throw new Error(`物品 id 不合法：${params.id}`)
  if (!params.package) params.package = meta?.group || `com.example.${params.modid}`
  params.ClassName = params.ClassName || pascal(params.id || 'Generated')
  params.loader = meta?.loader || ''
  params.mcVersion = meta?.minecraft || '1.20.1'
  if (!params.displayName) params.displayName = params.id || ''
  return params
}

function matchesWhen(when, params) {
  if (!when || when === 'always') return true
  if (when.startsWith('loader:')) return params.loader === when.slice(7)
  if (when.startsWith('param:')) return Boolean(params[when.slice(6)])
  return true
}

function renderText(text, params) {
  return String(text ?? '').replace(/\{\{(\w+)\}\}/g, (_match, key) => {
    const value = params[key]
    return value === undefined || value === null ? '' : String(value)
  })
}

function mergeJson(existing, incoming) {
  if (!existing || typeof existing !== 'object' || Array.isArray(existing)) return incoming
  const out = { ...existing }
  for (const [key, value] of Object.entries(incoming)) {
    if (value && typeof value === 'object' && !Array.isArray(value)
      && out[key] && typeof out[key] === 'object' && !Array.isArray(out[key])) {
      out[key] = mergeJson(out[key], value)
    } else if (Array.isArray(value) && Array.isArray(out[key])) {
      out[key] = [...new Set([...out[key], ...value])]
    } else {
      out[key] = value
    }
  }
  return out
}

function ensureInside(projectPath, target) {
  const root = resolve(projectPath)
  const full = resolve(root, target)
  if (full !== root && !full.startsWith(root + sep)) throw new Error(`模板路径越界：${target}`)
  return full
}

/**
 * 渲染模板但不动盘。
 *
 * 返回 `{id, name, params, files:[{path, action, content?, reason?}], conflicts}`。
 * `action` 为 `create` / `modify` / `skip`。
 */
export async function renderTemplate(projectPath, id, input = {}) {
  const { dir, manifest } = await readManifest(id)
  const meta = await readProjectMeta(projectPath)
  if (!meta) throw new Error('项目不存在')
  if (Array.isArray(manifest.loaders) && manifest.loaders.length && !manifest.loaders.includes(meta.loader)) {
    throw new Error(`模板 ${manifest.id || id} 不支持加载器 ${meta.loader || '未知'}`)
  }
  if (manifest.mcVersion && meta.minecraft && manifest.mcVersion !== meta.minecraft) {
    throw new Error(`模板只支持 MC ${manifest.mcVersion}，当前 ${meta.minecraft}`)
  }

  const params = normalizeParams(manifest, input, meta)
  const files = []
  const conflicts = []
  for (const file of manifest.files || []) {
    if (!matchesWhen(file.when, params)) continue
    const relPath = renderText(file.path, params).replace(/\\/g, '/')
    const target = ensureInside(projectPath, relPath)
    const templateText = await fsp.readFile(join(dir, file.template), 'utf8').catch(() => '')
    const rendered = renderText(templateText, params)
    const exists = await isFile(target)
    let action = exists ? 'skip' : 'create'
    let content = rendered
    let reason = exists ? '已存在，默认不覆盖' : ''
    if (exists && file.merge === 'json') {
      try {
        const current = JSON.parse(await fsp.readFile(target, 'utf8'))
        const incoming = JSON.parse(rendered)
        content = `${JSON.stringify(mergeJson(current, incoming), null, 2)}\n`
        action = 'modify'
        reason = ''
      } catch (error) {
        action = 'skip'
        reason = `JSON 合并失败：${error.message}`
      }
    }
    if (action === 'skip') conflicts.push({ path: relPath, reason })
    files.push({
      path: relPath,
      action,
      content: action === 'skip' ? undefined : content,
      reason,
    })
  }
  return { id: manifest.id || id, name: manifest.name || id, params, files, conflicts }
}

/** 应用模板：备份 → 写入 → 刷新结构；失败回滚。 */
export async function applyTemplate(projectPath, id, input = {}) {
  const rendered = await renderTemplate(projectPath, id, input)
  const writes = rendered.files.filter((file) => file.action === 'create' || file.action === 'modify')
  if (!writes.length) {
    return { id: rendered.id, files: [], conflicts: rendered.conflicts, backupDir: null }
  }

  const backupDir = await backupContentFiles(projectPath, writes.map((file) => ({ path: file.path })))
  try {
    for (const file of writes) {
      const target = ensureInside(projectPath, file.path)
      await fsp.mkdir(dirname(target), { recursive: true })
      await fsp.writeFile(target, file.content, 'utf8')
    }
    await refreshStructure(projectPath).catch(() => {})
    return {
      id: rendered.id,
      files: writes.map((file) => ({ path: file.path, action: file.action })),
      conflicts: rendered.conflicts,
      backupDir,
    }
  } catch (error) {
    await restoreContent(projectPath, backupDir).catch(() => {})
    throw error
  }
}
