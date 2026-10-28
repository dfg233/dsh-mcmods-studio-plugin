/**
 * 项目校验。
 *
 * Agent 生成内容后需要判断「能不能用」，而不是把问题留给用户。
 * 校验只读，不修改任何文件；输出分级清单，便于逐条修复。
 */

import { promises as fsp } from 'node:fs'
import { join } from 'node:path'

import { readJson } from './registry.js'
import { ITEM_FIELDS, ITEM_TYPES } from './schema.js'
import { isValidItemId } from './paths.js'
import { readProjectMeta } from './meta.js'
import { listItems } from './entries.js'
import { resolveAssetRoot, readModel } from './assets.js'

/**
 * 校验一个工坊项目。
 *
 * 返回：
 *   { ok, errors[], warnings[], checkedAt }
 *   error   —— 会导致游戏加载失败或资源缺失的问题
 *   warning —— 可能不符合预期，但不影响加载
 */
export async function validateProject(projectPath) {
  const errors = []
  const warnings = []
  const push = (level, code, message, target = '') => {
    const entry = { level, code, message, target }
    if (level === 'error') errors.push(entry)
    else warnings.push(entry)
  }

  const meta = await readProjectMeta(projectPath)
  if (!meta) {
    push('error', 'project.missing', '该目录不是「模组工坊」项目')
    return { ok: false, errors, warnings, checkedAt: new Date().toISOString() }
  }

  const items = await listItems(projectPath)
  const { root } = await resolveAssetRoot(projectPath, meta.modid)
  const textureIds = await listIds(join(root, 'textures', 'item'), 'png')
  const textureBlockIds = await listIds(join(root, 'textures', 'block'), 'png')
  const modelIds = await listIds(join(root, 'models', 'item'), 'json')
  const blockstateIds = await listIds(join(root, 'blockstates'), 'json')
  const langZh = await readJson(join(root, 'lang', 'zh_cn.json'), null)

  if (!items.length) {
    push('warning', 'items.empty', '项目里还没有任何物品条目')
  }

  for (const item of items) {
    const id = String(item.id ?? '')

    // id 合法性
    if (!isValidItemId(id)) {
      push('error', 'item.id', `物品 id「${id}」不合法：只能包含小写字母、数字和下划线`, id)
      continue
    }

    // 类型
    if (!ITEM_TYPES.some((type) => type.id === item.type)) {
      push('warning', 'item.type', `物品「${id}」的类型「${item.type}」不在支持列表中`, id)
    }

    // 创造模式标签没有物品素材，跳过贴图/模型/数值检查。
    if (item.type === 'creative_tab') continue

    // 数值范围
    for (const field of ITEM_FIELDS) {
      if (field.type !== 'number') continue
      const value = item.properties?.[field.key]
      if (typeof value !== 'number' || !Number.isFinite(value)) {
        push('error', 'item.property', `物品「${id}」的「${field.label}」不是有效数字`, id)
        continue
      }
      if (typeof field.min === 'number' && value < field.min) {
        push('error', 'item.property', `物品「${id}」的「${field.label}」为 ${value}，低于下限 ${field.min}`, id)
      }
      if (typeof field.max === 'number' && value > field.max) {
        push('error', 'item.property', `物品「${id}」的「${field.label}」为 ${value}，超过上限 ${field.max}`, id)
      }
    }

    // 素材
    const isBlock = item.type === 'block'
    const hasTexture = textureIds.has(id) || textureBlockIds.has(id)
    const hasModel = modelIds.has(id)

    if (!hasTexture) {
      push('warning', 'asset.texture', `物品「${id}」缺少贴图`, `textures/item/${id}.png`)
    }
    if (!hasModel) {
      push('warning', 'asset.model', `物品「${id}」缺少模型`, `models/item/${id}.json`)
    }
    if (isBlock && !blockstateIds.has(id)) {
      push('warning', 'asset.blockstate', `方块「${id}」缺少 blockstate`, `blockstates/${id}.json`)
    }

    // 模型引用检查
    if (hasModel) {
      const text = await readModel(projectPath, id).catch(() => '')
      const references = extractTextureRefs(text)
      for (const ref of references) {
        const { namespace, path } = ref
        if (namespace && namespace !== meta.modid && namespace !== 'minecraft') continue
        const rel = path.replace(/^item\//, '')
        if (namespace === 'minecraft') continue
        if (!textureIds.has(rel) && !textureBlockIds.has(rel)) {
          push('error', 'model.reference', `物品「${id}」的模型引用了不存在的贴图 ${namespace ? `${namespace}:` : ''}${path}`, id)
        }
      }
    }

    // 语言键
    if (langZh && typeof langZh === 'object') {
      const key = `item.${meta.modid}.${id}`
      const blockKey = `block.${meta.modid}.${id}`
      if (!(key in langZh) && !(blockKey in langZh)) {
        push('warning', 'lang.missing', `物品「${id}」缺少中文语言条目`, key)
      }
    }
  }

  // 孤立素材
  const itemIds = new Set(items.map((item) => item.id))
  for (const id of textureIds) {
    if (!itemIds.has(id)) {
      push('warning', 'asset.orphan', `贴图「${id}」没有对应的物品条目`, `textures/item/${id}.png`)
    }
  }
  for (const id of modelIds) {
    if (!itemIds.has(id)) {
      push('warning', 'asset.orphan', `模型「${id}」没有对应的物品条目`, `models/item/${id}.json`)
    }
  }

  return {
    ok: errors.length === 0,
    errors,
    warnings,
    checkedAt: new Date().toISOString(),
  }
}

/** 列出目录下指定扩展名的 id 集合。 */
async function listIds(dir, ext) {
  const names = await fsp.readdir(dir).catch(() => [])
  return new Set(
    names
      .filter((name) => new RegExp(`\\.${ext}$`, 'i').test(name))
      .map((name) => name.replace(new RegExp(`\\.${ext}$`, 'i'), '')),
  )
}

/** 从模型 JSON 中提取 texture 引用。 */
function extractTextureRefs(text) {
  const refs = []
  let json
  try {
    json = JSON.parse(text)
  } catch {
    return refs
  }
  const textures = json?.textures
  if (!textures || typeof textures !== 'object') return refs
  for (const value of Object.values(textures)) {
    if (typeof value !== 'string' || !value) continue
    const [head, tail] = value.includes(':') ? value.split(':', 2) : ['', value]
    refs.push({ namespace: head, path: tail })
  }
  return refs
}
