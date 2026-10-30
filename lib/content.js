/**
 * 内容编辑：配方、语言、模型等实际资源文件。
 *
 * 设计数据（`.mcstudio/items`）与资源文件分开；这里只写资源文件，
 * 每次写入前备份，失败可回滚。配方 MVP 支持有序/无序/熔炉。
 */

import { promises as fsp } from 'node:fs'
import { basename, dirname, join, relative, resolve } from 'node:path'
import { createHash, randomUUID } from 'node:crypto'

import { dataDir, isDirectory, isFile, isInside, readJson, writeJson } from './registry.js'
import { isValidItemId, itemsDir, projectDataDir } from './paths.js'
import { readProjectMeta, touchMeta } from './meta.js'
import { resolveAssetRoot } from './assets.js'

const RECIPE_TYPES = ['none', 'shaped', 'shapeless', 'furnace']

function text(value, fallback = '') {
  return typeof value === 'string' ? value : fallback
}

function lines(value) {
  if (!Array.isArray(value)) return []
  return value.map((item) => String(item).trim()).filter(Boolean)
}

/** pattern 的列是空格占位，不能 trim。 */
function rawLines(value) {
  if (!Array.isArray(value)) return []
  return value.map((item) => String(item)).filter((line) => line.trim().length > 0)
}

function projectKey(projectPath) {
  return createHash('sha256').update(resolve(projectPath).toLowerCase()).digest('hex').slice(0, 12)
}

function stamp() {
  return new Date().toISOString().replace(/[:.]/g, '-')
}

/** 资源数据目录：标准工程用 src/main/resources/data/<modid>，否则用插件数据目录。 */
async function dataRoot(projectPath, modid) {
  const standard = await isDirectory(join(projectPath, 'src', 'main', 'resources'))
  return standard
    ? join(projectPath, 'src', 'main', 'resources', 'data', modid)
    : join(projectDataDir(projectPath), 'data', modid)
}

function itemRef(value, modid) {
  const id = String(value || '').trim()
  if (!id) throw new Error('材料 id 不能为空')
  return id.includes(':') ? id : `${modid}:${id}`
}

function resultRef(id, modid) {
  return `${modid}:${id}`
}

function recipeFile(root, id) {
  return join(root, 'recipes', `${id}.json`)
}

function langFile(assetRoot, locale) {
  return join(assetRoot, 'lang', `${locale}.json`)
}

function modelFile(assetRoot, id) {
  return join(assetRoot, 'models', 'item', `${id}.json`)
}

function rel(projectPath, file) {
  return relative(projectPath, file).replace(/\\/g, '/')
}

function tagKindOf(item) {
  return item?.type === 'block' ? 'blocks' : 'items'
}

function normalizeTagId(value, defaultNamespace = 'minecraft') {
  const raw = String(value || '').trim()
  if (!raw) throw new Error('标签 id 不能为空')
  const id = raw.includes(':') ? raw : `${defaultNamespace}:${raw}`
  const [namespace, ...rest] = id.split(':')
  const path = rest.join(':')
  if (!/^[a-z0-9_.-]+$/.test(namespace) || !/^[a-z0-9_./-]+$/.test(path)) {
    throw new Error(`标签 id 不合法：${raw}`)
  }
  return `${namespace}:${path}`
}

function tagPath(base, id, kind) {
  const [namespace, ...rest] = id.split(':')
  return join(base, namespace, 'tags', kind, `${rest.join(':')}.json`)
}

async function walkTagDir(dir, namespace, prefix, out) {
  const entries = await fsp.readdir(dir, { withFileTypes: true }).catch(() => [])
  for (const entry of entries) {
    if (entry.name.startsWith('.')) continue
    const file = join(dir, entry.name)
    if (entry.isDirectory()) {
      await walkTagDir(file, namespace, `${prefix}${entry.name}/`, out)
    } else if (entry.name.endsWith('.json')) {
      const data = await readJson(file, null)
      if (!data || !Array.isArray(data.values)) continue
      const path = `${prefix}${entry.name.replace(/\.json$/, '')}`
      out.set(`${namespace}:${path}`, {
        id: `${namespace}:${path}`, file, data, values: data.values,
      })
    }
  }
}

async function readTagFiles(projectPath, modid, kind) {
  const base = dirname(await dataRoot(projectPath, modid))
  const out = new Map()
  const namespaces = await fsp.readdir(base, { withFileTypes: true }).catch(() => [])
  for (const entry of namespaces) {
    if (!entry.isDirectory() || entry.name.startsWith('.')) continue
    await walkTagDir(join(base, entry.name, 'tags', kind), entry.name, '', out)
  }
  return out
}

function tagValueId(value) {
  return typeof value === 'string' ? value : String(value?.id ?? '')
}

async function currentTagsFor(projectPath, modid, item) {
  const needle = `${modid}:${item.id}`
  const files = await readTagFiles(projectPath, modid, tagKindOf(item))
  return [...files.values()]
    .filter((entry) => entry.values.some((value) => tagValueId(value) === needle))
    .map((entry) => entry.id)
    .sort()
}

async function tagChanges(projectPath, modid, item, desired) {
  const kind = tagKindOf(item)
  const base = dirname(await dataRoot(projectPath, modid))
  const needle = `${modid}:${item.id}`
  const files = await readTagFiles(projectPath, modid, kind)
  const current = new Set()
  for (const entry of files.values()) {
    if (entry.values.some((value) => tagValueId(value) === needle)) current.add(entry.id)
  }
  const wanted = new Set(desired.map((value) => normalizeTagId(value)))
  const changes = []

  for (const id of current) {
    if (wanted.has(id)) continue
    const entry = files.get(id)
    if (!entry) continue
    const values = entry.values.filter((value) => tagValueId(value) !== needle)
    changes.push({
      kind: 'tag', action: 'update', path: rel(projectPath, entry.file),
      content: { ...entry.data, values },
    })
  }

  for (const id of wanted) {
    if (current.has(id)) continue
    const entry = files.get(id)
    if (entry) {
      changes.push({
        kind: 'tag', action: 'update', path: rel(projectPath, entry.file),
        content: { ...entry.data, values: [...entry.values, needle] },
      })
    } else {
      const file = tagPath(base, id, kind)
      changes.push({
        kind: 'tag', action: 'create', path: rel(projectPath, file),
        content: { replace: false, values: [needle] },
      })
    }
  }
  return changes
}

function parseKeyLines(value) {
  const map = {}
  for (const line of lines(value)) {
    const index = line.indexOf('=')
    if (index <= 0) throw new Error(`配方材料行格式应为 X=minecraft:iron_ingot：${line}`)
    const key = line.slice(0, index).trim()
    const item = line.slice(index + 1).trim()
    if (!/^[A-Za-z]$/.test(key)) throw new Error(`配方材料键必须是单个字母：${key}`)
    if (!item) throw new Error(`配方材料 ${key} 缺少物品 id`)
    map[key] = item
  }
  return map
}

function buildRecipe(content, modid, id) {
  const recipe = content?.recipe || {}
  const type = RECIPE_TYPES.includes(recipe.type) ? recipe.type : 'none'
  if (type === 'none') return null
  const count = Math.max(1, Math.min(64, Number(recipe.count) || 1))

  if (type === 'shaped') {
    const pattern = rawLines(recipe.pattern)
    if (!pattern.length) throw new Error('有序配方至少需要一行 pattern')
    const keys = parseKeyLines(recipe.keys)
    for (const row of pattern) {
      for (const ch of row) {
        if (ch === ' ') continue
        if (!keys[ch]) throw new Error(`配方 pattern 使用了未定义的材料键：${ch}`)
      }
    }
    return {
      type: 'minecraft:crafting_shaped',
      pattern,
      key: Object.fromEntries(Object.entries(keys).map(([key, value]) => [key, { item: itemRef(value, modid) }])),
      result: { item: resultRef(id, modid), count },
    }
  }

  if (type === 'shapeless') {
    const ingredients = lines(recipe.ingredients)
    if (!ingredients.length) throw new Error('无序配方至少需要一种材料')
    return {
      type: 'minecraft:crafting_shapeless',
      ingredients: ingredients.map((value) => ({ item: itemRef(value, modid) })),
      result: { item: resultRef(id, modid), count },
    }
  }

  const ingredient = lines(recipe.ingredients)[0] || lines(recipe.keys)[0]
  if (!ingredient) throw new Error('熔炉配方需要一种材料')
  return {
    type: 'minecraft:smelting',
    ingredient: { item: itemRef(ingredient, modid) },
    result: { item: resultRef(id, modid), count },
    experience: Math.max(0, Number(recipe.experience) || 0),
    cookingtime: Math.max(1, Number(recipe.cookingTime) || 200),
  }
}

/** 读取一个物品相关的实际资源，供编辑器回填。 */
export async function readContent(projectPath, id) {
  if (!isValidItemId(id)) throw new Error('物品 id 不合法')
  const meta = await readProjectMeta(projectPath)
  if (!meta) throw new Error('项目不存在')
  const item = await readJson(join(itemsDir(projectPath), `${id}.json`), null)
  const type = item?.type === 'block' ? 'block' : 'item'
  const key = `${type}.${meta.modid}.${id}`
  const { root: assetRoot } = await resolveAssetRoot(projectPath, meta.modid)
  const dataDirPath = await dataRoot(projectPath, meta.modid)

  const [zh, en, recipe, model] = await Promise.all([
    readJson(langFile(assetRoot, 'zh_cn'), {}),
    readJson(langFile(assetRoot, 'en_us'), {}),
    readJson(recipeFile(dataDirPath, id), null),
    readJson(modelFile(assetRoot, id), null),
  ])

  const tags = item ? await currentTagsFor(projectPath, meta.modid, item) : []
  const recipeSummary = recipe
    ? {
        type: recipe.type === 'minecraft:crafting_shaped' ? 'shaped'
          : recipe.type === 'minecraft:crafting_shapeless' ? 'shapeless'
            : recipe.type === 'minecraft:smelting' ? 'furnace' : 'none',
        pattern: Array.isArray(recipe.pattern) ? recipe.pattern : [],
        keys: recipe.key && typeof recipe.key === 'object'
          ? Object.entries(recipe.key).map(([k, v]) => `${k}=${text(v?.item, '')}`)
          : [],
        ingredients: Array.isArray(recipe.ingredients)
          ? recipe.ingredients.map((entry) => text(entry?.item, ''))
          : recipe.ingredient?.item ? [recipe.ingredient.item] : [],
        count: recipe.result?.count ?? 1,
        experience: recipe.experience ?? 0,
        cookingTime: recipe.cookingtime ?? 200,
      }
    : null

  return {
    itemId: id,
    type,
    lang: { zh: text(zh?.[key], ''), en: text(en?.[key], '') },
    tags,
    recipe: recipeSummary,
    model: model ? { parent: text(model.parent, ''), textures: model.textures || {} } : null,
    files: {
      lang: [rel(projectPath, langFile(assetRoot, 'zh_cn')), rel(projectPath, langFile(assetRoot, 'en_us'))],
      recipe: rel(projectPath, recipeFile(dataDirPath, id)),
      model: rel(projectPath, modelFile(assetRoot, id)),
    },
  }
}

function langKeyFor(item, modid, id) {
  return `${item?.type === 'block' ? 'block' : 'item'}.${modid}.${id}`
}

/** 计算将要写入的文件；不落盘。 */
export async function previewContent(projectPath, id, content = {}, itemOverride = null) {
  if (!isValidItemId(id)) throw new Error('物品 id 不合法')
  const meta = await readProjectMeta(projectPath)
  if (!meta) throw new Error('项目不存在')
  const item = await readJson(join(itemsDir(projectPath), `${id}.json`), null) || (itemOverride && itemOverride.id === id ? itemOverride : null)
  if (!item) throw new Error(`物品不存在：${id}`)
  const { root: assetRoot } = await resolveAssetRoot(projectPath, meta.modid)
  const dataDirPath = await dataRoot(projectPath, meta.modid)
  const key = langKeyFor(item, meta.modid, id)
  const files = []

  const lang = content.lang || {}
  for (const [locale, value] of [['zh_cn', lang.zh], ['en_us', lang.en]]) {
    const next = text(value).trim()
    if (!next) continue
    const file = langFile(assetRoot, locale)
    const current = await readJson(file, {})
    if (current?.[key] === next) continue
    files.push({
      kind: 'lang', action: current?.[key] ? 'update' : 'create', path: rel(projectPath, file),
      content: { ...current, [key]: next },
    })
  }

  const recipe = buildRecipe(content, meta.modid, id)
  if (recipe) {
    const file = recipeFile(dataDirPath, id)
    const current = await readJson(file, null)
    files.push({
      kind: 'recipe', action: current ? 'update' : 'create', path: rel(projectPath, file), content: recipe,
    })
  }

  const parent = text(content.model?.parent).trim()
  if (parent) {
    const file = modelFile(assetRoot, id)
    const current = await readJson(file, null)
    const next = { ...(current && typeof current === 'object' ? current : {}), parent, textures: current?.textures || { layer0: `${meta.modid}:item/${id}` } }
    if (JSON.stringify(current) !== JSON.stringify(next)) {
      files.push({ kind: 'model', action: current ? 'update' : 'create', path: rel(projectPath, file), content: next })
    }
  }

  if (Array.isArray(content.tags)) {
    files.push(...await tagChanges(projectPath, meta.modid, item, content.tags))
  }

  return {
    itemId: id,
    files: files.map((file) => ({ kind: file.kind, action: file.action, path: file.path })),
    changes: files.length,
    backupHint: '应用前会备份这些资源文件；失败可回滚。',
  }
}

async function createBackup(projectPath, files, root) {
  const dir = join(root, `${stamp()}-${randomUUID().slice(0, 8)}-content`)
  await fsp.mkdir(dir, { recursive: true })
  const entries = []
  for (const file of files) {
    const target = join(projectPath, file.path)
    const existed = await isFile(target)
    if (existed) {
      const copy = join(dir, 'files', file.path)
      await fsp.mkdir(dirname(copy), { recursive: true })
      await fsp.cp(target, copy)
    }
    entries.push({ path: file.path, existed })
  }
  await writeJson(join(dir, 'manifest.json'), { schemaVersion: 1, files: entries })
  return dir
}

/** 应用资源变更；返回备份目录。 */
export async function applyContent(projectPath, id, content = {}) {
  const preview = await previewContent(projectPath, id, content)
  if (!preview.files.length) return { files: [], backupDir: null }
  // previewContent 只返回摘要；重新计算完整内容，避免把内容暴露给前端。
  const meta = await readProjectMeta(projectPath)
  const item = await readJson(join(itemsDir(projectPath), `${id}.json`), null)
  const { root: assetRoot } = await resolveAssetRoot(projectPath, meta.modid)
  const dataDirPath = await dataRoot(projectPath, meta.modid)
  const key = langKeyFor(item, meta.modid, id)
  const full = []
  const lang = content.lang || {}
  for (const [locale, value] of [['zh_cn', lang.zh], ['en_us', lang.en]]) {
    const next = text(value).trim()
    if (!next) continue
    const file = langFile(assetRoot, locale)
    const current = await readJson(file, {})
    if (current?.[key] === next) continue
    full.push({ kind: 'lang', path: rel(projectPath, file), content: { ...current, [key]: next } })
  }
  const recipe = buildRecipe(content, meta.modid, id)
  if (recipe) full.push({ kind: 'recipe', path: rel(projectPath, recipeFile(dataDirPath, id)), content: recipe })
  const parent = text(content.model?.parent).trim()
  if (parent) {
    const currentModel = await readJson(modelFile(assetRoot, id), null)
    const nextModel = { ...(currentModel && typeof currentModel === 'object' ? currentModel : {}), parent, textures: currentModel?.textures || { layer0: `${meta.modid}:item/${id}` } }
    if (JSON.stringify(currentModel) !== JSON.stringify(nextModel)) {
      full.push({ kind: 'model', path: rel(projectPath, modelFile(assetRoot, id)), content: nextModel })
    }
  }

  if (Array.isArray(content.tags)) {
    full.push(...await tagChanges(projectPath, meta.modid, item, content.tags))
  }

  const backupDir = await createBackup(projectPath, full, join(dataDir(), 'backups', `${basename(projectPath)}-${projectKey(projectPath)}`))
  try {
    for (const file of full) await writeJson(join(projectPath, file.path), file.content)
    await touchMeta(projectPath)
    return { files: full.map((file) => ({ kind: file.kind, path: file.path })), backupDir }
  } catch (error) {
    await restoreContent(projectPath, backupDir)
    throw new Error(`内容写入失败，已回滚：${error.message}`)
  }
}

/** 用备份目录恢复资源文件。 */
export async function restoreContent(projectPath, backupDir) {
  const backupsRoot = join(dataDir(), 'backups')
  if (!isInside(backupsRoot, resolve(backupDir))) throw new Error('备份目录不在允许范围内')
  const manifestPath = join(backupDir, 'manifest.json')
  const manifest = await readJson(manifestPath, null)
  if (!manifest || manifest.schemaVersion !== 1 || !Array.isArray(manifest.files)) {
    throw new Error('备份清单无效')
  }
  for (const entry of manifest.files) {
    const target = resolve(projectPath, entry.path)
    if (!isInside(projectPath, target)) throw new Error(`备份路径越界：${entry.path}`)
    if (entry.existed) {
      await fsp.rm(target, { force: true })
      await fsp.mkdir(dirname(target), { recursive: true })
      await fsp.cp(join(backupDir, 'files', entry.path), target)
    } else {
      await fsp.rm(target, { force: true })
    }
  }
  return true
}
