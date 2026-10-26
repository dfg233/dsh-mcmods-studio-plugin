/**
 * 贴图与模型管理。
 *
 * 贴图存放在标准的 Minecraft 资源路径下：
 *   <project>/src/main/resources/assets/<modid>/textures/item/<id>.png
 *   <project>/src/main/resources/assets/<modid>/textures/block/<id>.png
 *
 * 如果项目还不是 gradle 工程（纯设计项目），则退回插件自己的数据目录：
 *   <project>/.mcstudio/assets/<modid>/textures/item/<id>.png
 *
 * 物品模型在 `models/item/`，方块模型在 `models/block/`，方块还有
 * `blockstates/<id>.json` 决定用哪个模型。方块的贴图不直接对应文件名，
 * 需要沿「blockstate → 模型 → parent 链 → textures」解析，见 `describeBlock`。
 */

import { promises as fsp } from 'node:fs'
import { join } from 'node:path'

import { isDirectory, isFile, readJson, writeJson, writeText } from './registry.js'
import { defaultProperties, isValidItemId, itemsDir, readProjectMeta } from './project.js'

/** 允许上传的贴图上限（字节）。 */
const MAX_TEXTURE_BYTES = 2 * 1024 * 1024

/** 默认模型模板。 */
const MODEL_PARENTS = {
  generated: 'minecraft:item/generated',
  handheld: 'minecraft:item/handheld',
  block: null,
  custom: null,
}

/**
 * 解析项目的资源根目录。
 * 返回 { root, standard }，standard 表示是否落在 gradle 工程的标准路径下。
 */
export async function resolveAssetRoot(projectPath, modid) {
  const standard = join(projectPath, 'src', 'main', 'resources', 'assets', modid)
  if (await isDirectory(join(projectPath, 'src', 'main', 'resources'))) {
    return { root: standard, standard: true }
  }
  return { root: join(projectPath, '.mcstudio', 'assets', modid), standard: false }
}

/**
 * 贴图文件路径。
 *
 * `kind` 为 `'item'`（默认）或 `'block'`；方块贴图放在 `textures/block/`。
 */
export async function textureFile(projectPath, modid, id, kind = 'item') {
  const { root } = await resolveAssetRoot(projectPath, modid)
  return join(root, 'textures', kind === 'block' ? 'block' : 'item', `${id}.png`)
}

/** 模型文件路径。 */
export async function modelFile(projectPath, modid, id) {
  const { root } = await resolveAssetRoot(projectPath, modid)
  return join(root, 'models', 'item', `${id}.json`)
}

/** 读取 PNG 宽高（解析 IHDR），失败返回 null。 */
export function pngSize(buffer) {
  if (!Buffer.isBuffer(buffer) || buffer.length < 24) return null
  const signature = buffer.subarray(0, 8)
  const pngMagic = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])
  if (!signature.equals(pngMagic)) return null
  const width = buffer.readUInt32BE(16)
  const height = buffer.readUInt32BE(20)
  if (!width || !height) return null
  return { width, height }
}

/** 简化模型坐标为可读面名。 */
const FACE_ORDER = ['up', 'down', 'north', 'south', 'east', 'west']

/** 中文面名，供界面直接显示。 */
const FACE_LABELS = {
  up: '上面', down: '下面', north: '北面', south: '南面', east: '东面', west: '西面',
  side: '侧面', end: '端面', all: '全部', particle: '粒子',
  top: '上面', bottom: '下面', front: '正面', back: '背面', left: '左面', right: '右面',
}

/**
 * 沿模型的 parent 链解析出实际使用的贴图变量。
 *
 * Minecraft 的方块模型允许用 `#变量名` 引用父模型或同级的 textures，
 * 例如 `{"textures":{"all":"mymod:block/stone"}}` 配合 `{"up":"#all"}`。
 * 这里把引用逐层展开成最终路径。
 */
function resolveModelTextures(chain) {
  // 从最底层父模型往上合并，子级覆盖父级
  const merged = {}
  for (let i = chain.length - 1; i >= 0; i -= 1) {
    const textures = chain[i]?.textures
    if (textures && typeof textures === 'object') {
      for (const [key, value] of Object.entries(textures)) {
        if (typeof value === 'string') merged[key] = value
      }
    }
  }

  // 展开 `#var` 引用，最多 8 层，防止循环
  const resolve = (value, depth = 0) => {
    if (typeof value !== 'string' || depth > 8) return ''
    if (!value.startsWith('#')) return value
    const key = value.slice(1)
    return merged[key] ? resolve(merged[key], depth + 1) : ''
  }

  const out = {}
  for (const [key, value] of Object.entries(merged)) out[key] = resolve(value)
  return out
}

/**
 * 描述一个方块模型：返回每个方块面用到的贴图。
 *
 * 依据 MC 规则：
 *   - `blockstates/<id>.json` 的 variants / multipart 决定使用哪些模型；
 *   - 模型 JSON 的 `elements[].faces` 决定每个面用哪个贴图变量；
 *   - 没有 `elements` 时（如 cube_all）退回用 `textures` 里的键推断。
 *
 * 返回 `{ models[], faces[], textures[] }`：
 *   faces     —— `[{face, label, texture}]`，按上面、下面、北、南、东、西排序
 *   textures  —— 去重后的贴图路径（去掉命名空间前缀）
 */
function describeBlockModel(modelJson) {
  const textures = modelJson?.textures && typeof modelJson.textures === 'object' ? modelJson.textures : {}

  // 有 elements 时按面解析
  const faceMap = new Map()
  const elements = Array.isArray(modelJson?.elements) ? modelJson.elements : []
  for (const element of elements) {
    const faces = element?.faces
    if (!faces || typeof faces !== 'object') continue
    for (const [face, spec] of Object.entries(faces)) {
      const key = typeof spec?.texture === 'string' ? spec.texture : ''
      if (!key) continue
      const resolved = key.startsWith('#') ? textures[key.slice(1)] ?? '' : key
      if (!resolved) continue
      // 同一个面多次出现时保留第一个（多元素模型常见）
      if (!faceMap.has(face)) faceMap.set(face, String(resolved))
    }
  }

  const faces = []
  const ordered = [
    ...FACE_ORDER.filter((face) => faceMap.has(face)),
    ...[...faceMap.keys()].filter((face) => !FACE_ORDER.includes(face)),
  ]
  for (const face of ordered) {
    faces.push({
      face,
      label: FACE_LABELS[face] ?? face,
      texture: faceMap.get(face),
    })
  }

  return { faces, textures }
}

/** 把贴图引用规范化为「去掉命名空间、去掉 textures/ 前缀」的路径。 */
function normalizeTextureRef(value, modid) {
  if (typeof value !== 'string' || !value) return ''
  let text = value
  if (text.includes(':')) {
    const [namespace, rest] = text.split(':', 2)
    if (namespace !== modid && namespace !== 'minecraft') return ''
    text = rest
  }
  // 模型里的贴图路径形如 block/stone，对应 textures/block/stone.png
  return text.replace(/^textures\//, '')
}

/** 读取一个目录下的 PNG 贴图信息。 */
async function listTextureDir(dir, modid, kind) {
  const out = []
  for (const name of await fsp.readdir(dir).catch(() => [])) {
    if (!/\.png$/i.test(name)) continue
    const id = name.replace(/\.png$/i, '')
    const file = join(dir, name)
    const buffer = await fsp.readFile(file).catch(() => null)
    const size = buffer ? pngSize(buffer) : null
    const stat = await fsp.stat(file).catch(() => null)
    out.push({
      id,
      kind,
      path: file,
      relative: `assets/${modid}/textures/${kind}/${name}`,
      width: size?.width ?? 0,
      height: size?.height ?? 0,
      bytes: stat?.size ?? 0,
      modifiedAt: stat?.mtime?.toISOString() ?? '',
    })
  }
  return out
}

/**
 * 解析一个方块的贴图使用情况。
 *
 * 流程：blockstate → 模型清单 → 沿 parent 链合并 textures → 按面解析。
 * 解析不出来时返回 null，由调用方回退到「按 id 猜贴图」。
 */
async function describeBlock(projectPath, root, modid, id, modelCache) {
  const stateFile = join(root, 'blockstates', `${id}.json`)
  const stateJson = await readJson(stateFile, null)

  /** 收集 blockstate 引用的模型名。 */
  const modelNames = new Set()
  const collectFromModel = (value) => {
    if (typeof value === 'string') modelNames.add(value)
    else if (value && typeof value === 'object' && typeof value.model === 'string') modelNames.add(value.model)
  }
  if (stateJson) {
    for (const variant of Object.values(stateJson.variants ?? {})) {
      if (Array.isArray(variant)) variant.forEach(collectFromModel)
      else collectFromModel(variant)
    }
    for (const part of Array.isArray(stateJson.multipart) ? stateJson.multipart : []) {
      const apply = part?.apply
      if (Array.isArray(apply)) apply.forEach(collectFromModel)
      else collectFromModel(apply)
    }
  }
  // 没有 blockstate 时，直接试同名方块模型
  if (modelNames.size === 0) modelNames.add(`${modid}:block/${id}`)

  /** 沿 parent 链读模型，返回从子到父的数组。 */
  const loadChain = async (modelName) => {
    const chain = []
    let current = normalizeTextureRef(modelName, modid)
    for (let depth = 0; depth < 8 && current; depth += 1) {
      const key = current.replace(/^block\//, '')
      const file = join(root, 'models', 'block', `${key}.json`)
      const json = modelCache.get(file) ?? await readJson(file, null)
      modelCache.set(file, json)
      if (!json) break
      chain.push(json)
      const parent = typeof json.parent === 'string' ? json.parent : ''
      // 只沿本模组或 minecraft 的方块模型继续，避免读到内置资源
      if (!parent || /^minecraft:(block\/)?cube/.test(parent)) break
      current = normalizeTextureRef(parent, modid)
    }
    return chain
  }

  const models = []
  const faceMap = new Map()
  const textureSet = new Set()

  for (const modelName of modelNames) {
    const chain = await loadChain(modelName)
    if (!chain.length) continue
    const merged = {}
    for (let i = chain.length - 1; i >= 0; i -= 1) {
      const textures = chain[i]?.textures
      if (textures && typeof textures === 'object') {
        for (const [key, value] of Object.entries(textures)) {
          if (typeof value === 'string') merged[key] = value
        }
      }
    }
    const resolved = {}
    const resolveRef = (value, depth = 0) => {
      if (typeof value !== 'string' || depth > 8) return ''
      if (!value.startsWith('#')) return value
      const key = value.slice(1)
      return merged[key] ? resolveRef(merged[key], depth + 1) : ''
    }
    for (const [key, value] of Object.entries(merged)) resolved[key] = resolveRef(value)

    // elements 可能定义在父模型里，沿链找第一个带 elements 的
    const withElements = chain.find((entry) => Array.isArray(entry?.elements) && entry.elements.length)
    const { faces, textures: modelTextures } = describeBlockModel({
      textures: resolved,
      elements: withElements?.elements ?? [],
    })
    models.push({
      name: modelName,
      parent: typeof chain[0]?.parent === 'string' ? chain[0].parent : '',
      faces: faces.length,
      // 记下 elements 实际来自哪一层，便于排查「面为空」的情况
      elementsFrom: withElements
        ? (chain.indexOf(withElements) === 0 ? 'self' : `parent+${chain.indexOf(withElements)}`)
        : '',
    })

    for (const entry of faces) {
      if (!faceMap.has(entry.face)) faceMap.set(entry.face, entry.texture)
      const norm = normalizeTextureRef(entry.texture, modid)
      if (norm) textureSet.add(norm)
    }
    // 模型声明了但没被任何面引用（如 particle）也算使用过
    for (const value of Object.values(modelTextures)) {
      const norm = normalizeTextureRef(value, modid)
      if (norm) textureSet.add(norm)
    }
  }

  if (!textureSet.size) return null

  const ordered = [
    ...FACE_ORDER.filter((face) => faceMap.has(face)),
    ...[...faceMap.keys()].filter((face) => !FACE_ORDER.includes(face)),
  ]

  return {
    hasBlockstate: Boolean(stateJson),
    models,
    faces: ordered.map((face) => ({
      face,
      label: FACE_LABELS[face] ?? face,
      texture: normalizeTextureRef(faceMap.get(face), modid),
    })),
    textures: [...textureSet].sort(),
    // 所有面用同一张图时标记出来，界面可只显示一个
    uniform: new Set(ordered.map((face) => normalizeTextureRef(faceMap.get(face), modid))).size === 1,
  }
}

/** 列出项目内的贴图与模型。 */
export async function listAssets(projectPath) {
  const meta = await readProjectMeta(projectPath)
  const modid = meta?.modid ?? ''
  const { root, standard } = await resolveAssetRoot(projectPath, modid)

  // 物品与方块贴图都收集，方块额外记录 kind 以便界面区分
  const itemTextures = await listTextureDir(join(root, 'textures', 'item'), modid, 'item')
  const blockTextures = await listTextureDir(join(root, 'textures', 'block'), modid, 'block')
  const textures = [...itemTextures, ...blockTextures]

  const models = []
  const modelDir = join(root, 'models', 'item')
  for (const name of await fsp.readdir(modelDir).catch(() => [])) {
    if (!/\.json$/i.test(name)) continue
    const id = name.replace(/\.json$/i, '')
    const file = join(modelDir, name)
    const json = await readJson(file, null)
    models.push({
      id,
      kind: 'item',
      path: file,
      relative: `assets/${modid}/models/item/${name}`,
      parent: typeof json?.parent === 'string' ? json.parent : '',
      textures: json?.textures && typeof json.textures === 'object' ? json.textures : {},
    })
  }

  const blockModels = []
  const blockModelDir = join(root, 'models', 'block')
  for (const name of await fsp.readdir(blockModelDir).catch(() => [])) {
    if (!/\.json$/i.test(name)) continue
    const id = name.replace(/\.json$/i, '')
    const file = join(blockModelDir, name)
    const json = await readJson(file, null)
    blockModels.push({
      id,
      kind: 'block',
      path: file,
      relative: `assets/${modid}/models/block/${name}`,
      parent: typeof json?.parent === 'string' ? json.parent : '',
      textures: json?.textures && typeof json.textures === 'object' ? json.textures : {},
    })
  }

  const itemIds = [...new Set((await fsp.readdir(itemsDir(projectPath)).catch(() => []))
    .filter((n) => n.endsWith('.json'))
    .map((n) => n.replace(/\.json$/, '')))]

  // 每个条目：物品看同名贴图与模型；方块走 blockstate 解析
  const modelCache = new Map()
  // 贴图索引：key 为「去掉 block/ 前缀的裸名」，方块解析出来的引用也是这个形式
  const texturePaths = new Set(textures.map((entry) => `${entry.kind}/${entry.id}`))
  const blocks = []
  for (const id of itemIds) {
    const info = await describeBlock(projectPath, root, modid, id, modelCache).catch(() => null)
    if (!info) continue
    // 主贴图：优先取第一个实际存在的文件，供列表缩略图使用。
    // info.textures 已是「block/xxx」形式，直接与索引比较。
    const primaryRef = info.textures.find((ref) => texturePaths.has(ref)) ?? ''
    blocks.push({
      id,
      hasBlockstate: info.hasBlockstate,
      uniform: info.uniform,
      models: info.models,
      textures: info.textures,
      /** 形如 `block/stone_up`，可直接传给 assets.read 的 kind+id */
      primary: primaryRef,
      /** 拆出 kind 与文件名，前端读取缩略图时用 */
      primaryKind: primaryRef ? primaryRef.split('/')[0] : '',
      primaryId: primaryRef ? primaryRef.split('/').slice(1).join('/') : '',
      faces: info.faces.map((face) => ({
        face: face.face,
        label: face.label,
        texture: face.texture,
        // 每个面也给出可读取的 kind/id，便于逐面取图
        kind: face.texture ? face.texture.split('/')[0] : '',
        textureId: face.texture ? face.texture.split('/').slice(1).join('/') : '',
      })),
    })
  }

  const textureIds = new Set(itemTextures.map((t) => t.id))
  const modelIds = new Set(models.map((m) => m.id))
  const blockIds = new Set(blocks.map((b) => b.id))

  return {
    modid,
    standard,
    root,
    textures: textures.sort((a, b) => `${a.kind}/${a.id}`.localeCompare(`${b.kind}/${b.id}`)),
    models: models.sort((a, b) => a.id.localeCompare(b.id)),
    blockModels: blockModels.sort((a, b) => a.id.localeCompare(b.id)),
    blocks: blocks.sort((a, b) => a.id.localeCompare(b.id)),
    /** 贴图既不在 item 也不在 block 目录下的条目 */
    missing: itemIds
      .filter((id) => {
        if (blocks.some((b) => b.id === id)) return blocks.find((b) => b.id === id).textures.length === 0
        return !textureIds.has(id) || !modelIds.has(id)
      })
      .sort(),
    blockCount: blockIds.size,
  }
}

/** 保存上传的贴图（base64，不含 data: 前缀）。 */
export async function uploadTexture(projectPath, id, base64) {
  if (!isValidItemId(id)) throw new Error('物品 id 非法')
  if (typeof base64 !== 'string' || base64.length === 0) throw new Error('贴图数据为空')
  const buffer = Buffer.from(base64, 'base64')
  if (buffer.length > MAX_TEXTURE_BYTES) throw new Error('贴图大小超过 2MB 限制')
  const size = pngSize(buffer)
  if (!size) throw new Error('文件不是有效的 PNG 图片')
  if (size.width !== size.height) throw new Error(`贴图必须为正方形，当前为 ${size.width}×${size.height}`)

  const meta = await readProjectMeta(projectPath)
  if (!meta) throw new Error('项目不存在')
  const file = await textureFile(projectPath, meta.modid, id)
  await fsp.mkdir(join(file, '..'), { recursive: true })
  await fsp.writeFile(file, buffer)
  return { id, width: size.width, height: size.height, bytes: buffer.length, path: file }
}

/** 读取贴图为 data URL，供页面预览。 */
export async function readTextureDataUrl(projectPath, id, kind = 'item') {
  const meta = await readProjectMeta(projectPath)
  if (!meta) throw new Error('项目不存在')

  // 先按指定类型找，找不到再试另一种（界面只传 id 时也能工作）
  const order = kind === 'block' ? ['block', 'item'] : ['item', 'block']
  for (const candidate of order) {
    const file = await textureFile(projectPath, meta.modid, id, candidate)
    if (!(await isFile(file))) continue
    const buffer = await fsp.readFile(file)
    return `data:image/png;base64,${buffer.toString('base64')}`
  }
  return null
}

/** 删除贴图文件。 */
export async function deleteTexture(projectPath, id) {
  const meta = await readProjectMeta(projectPath)
  if (!meta) throw new Error('项目不存在')
  await fsp.rm(await textureFile(projectPath, meta.modid, id), { force: true })
  return true
}

/** 读取模型 JSON 文本；不存在时返回 null。 */
export async function readModel(projectPath, id) {
  const meta = await readProjectMeta(projectPath)
  if (!meta) throw new Error('项目不存在')
  const file = await modelFile(projectPath, meta.modid, id)
  const text = await fsp.readFile(file, 'utf8').catch(() => null)
  return text
}

/** 保存模型 JSON；传入对象或文本。 */
export async function saveModel(projectPath, id, model) {
  const meta = await readProjectMeta(projectPath)
  if (!meta) throw new Error('项目不存在')
  let text
  if (typeof model === 'string') {
    const trimmed = model.trim()
    if (!trimmed) throw new Error('模型内容为空')
    try {
      JSON.parse(trimmed)
    } catch (error) {
      throw new Error(`模型不是合法 JSON：${error.message}`)
    }
    text = trimmed.endsWith('\n') ? trimmed : `${trimmed}\n`
  } else {
    text = JSON.stringify(model, null, 2) + '\n'
  }
  const file = await modelFile(projectPath, meta.modid, id)
  await fsp.mkdir(join(file, '..'), { recursive: true })
  await writeText(file, text)
  return text
}

/** 按物品渲染类型生成默认模型 JSON。 */
export function buildDefaultModel(modid, item) {
  const properties = { ...defaultProperties(), ...(item.properties ?? {}) }
  const renderType = properties.renderType ?? 'generated'
  const parent = MODEL_PARENTS[renderType]

  if (parent === null) {
    // 方块或自定义：给一个能被编辑器识别的空壳，避免写死错误的父模型
    return {
      __comment: '请按方块模型规范填写 parent / textures',
      parent: renderType === 'block' ? 'minecraft:block/cube_all' : 'minecraft:item/generated',
      textures: { layer0: `${modid}:item/${item.id}` },
    }
  }

  return { parent, textures: { layer0: `${modid}:item/${item.id}` } }
}

/** 确保某物品有模型：没有则按渲染类型创建。 */
export async function ensureModel(projectPath, item) {
  const meta = await readProjectMeta(projectPath)
  if (!meta) throw new Error('项目不存在')
  const file = await modelFile(projectPath, meta.modid, item.id)
  if (await isFile(file)) return false
  const model = buildDefaultModel(meta.modid, item)
  await saveModel(projectPath, item.id, model)
  return true
}
