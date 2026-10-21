/**
 * 贴图与模型管理。
 *
 * 贴图存放在标准的 Minecraft 资源路径下：
 *   <project>/src/main/resources/assets/<modid>/textures/item/<id>.png
 *
 * 如果项目还不是 gradle 工程（纯设计项目），则退回插件自己的数据目录：
 *   <project>/.mcstudio/assets/<modid>/textures/item/<id>.png
 *
 * 模型同理，目录为 `models/item/`。模型内容为 JSON 文本，默认按物品的
 * `renderType` 生成对应的父模型。
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

/** 贴图文件路径。 */
export async function textureFile(projectPath, modid, id) {
  const { root } = await resolveAssetRoot(projectPath, modid)
  return join(root, 'textures', 'item', `${id}.png`)
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

/** 列出项目内的贴图与模型。 */
export async function listAssets(projectPath) {
  const meta = await readProjectMeta(projectPath)
  const modid = meta?.modid ?? ''
  const { root, standard } = await resolveAssetRoot(projectPath, modid)

  const textures = []
  const textureDir = join(root, 'textures', 'item')
  for (const name of await fsp.readdir(textureDir).catch(() => [])) {
    if (!/\.png$/i.test(name)) continue
    const id = name.replace(/\.png$/i, '')
    const file = join(textureDir, name)
    const buffer = await fsp.readFile(file).catch(() => null)
    const size = buffer ? pngSize(buffer) : null
    const stat = await fsp.stat(file).catch(() => null)
    textures.push({
      id,
      path: file,
      relative: `assets/${modid}/textures/item/${name}`,
      width: size?.width ?? 0,
      height: size?.height ?? 0,
      bytes: stat?.size ?? 0,
      modifiedAt: stat?.mtime?.toISOString() ?? '',
    })
  }

  const models = []
  const modelDir = join(root, 'models', 'item')
  for (const name of await fsp.readdir(modelDir).catch(() => [])) {
    if (!/\.json$/i.test(name)) continue
    const id = name.replace(/\.json$/i, '')
    const file = join(modelDir, name)
    const json = await readJson(file, null)
    models.push({
      id,
      path: file,
      relative: `assets/${modid}/models/item/${name}`,
      parent: typeof json?.parent === 'string' ? json.parent : '',
      textures: json?.textures && typeof json.textures === 'object' ? json.textures : {},
    })
  }

  const itemIds = new Set((await fsp.readdir(itemsDir(projectPath)).catch(() => []))
    .filter((n) => n.endsWith('.json'))
    .map((n) => n.replace(/\.json$/, '')))

  const textureIds = new Set(textures.map((t) => t.id))
  const modelIds = new Set(models.map((m) => m.id))

  return {
    modid,
    standard,
    root,
    textures: textures.sort((a, b) => a.id.localeCompare(b.id)),
    models: models.sort((a, b) => a.id.localeCompare(b.id)),
    missing: [...itemIds].filter((id) => !textureIds.has(id) || !modelIds.has(id)).sort(),
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
export async function readTextureDataUrl(projectPath, id) {
  const meta = await readProjectMeta(projectPath)
  if (!meta) throw new Error('项目不存在')
  const file = await textureFile(projectPath, meta.modid, id)
  if (!(await isFile(file))) return null
  const buffer = await fsp.readFile(file)
  return `data:image/png;base64,${buffer.toString('base64')}`
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
