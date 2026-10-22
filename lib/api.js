/**
 * HTTP API 分派。
 *
 * 浏览器半通过 POST /mcmods-studio/api 调用这里的动作；
 * Host 半（index.js）只负责装载路由，不承载业务逻辑。
 *
 * 统一返回 { ok: true, data } 或 { ok: false, error }。
 */

import { promises as fsp } from 'node:fs'
import { join } from 'node:path'

import {
  DEFAULT_ROOT,
  expandPath,
  forgetProject,
  isDirectory,
  readRegistry,
  saveRegistry,
  setRegistryRoot,
  touchProject,
} from './registry.js'
import {
  MC_VERSION,
  createProject,
  deleteFeature,
  deleteItem,
  ensureStudioMarker,
  importProject,
  itemSchema,
  listFeatures,
  listItems,
  readProject,
  readProjectMeta,
  requireProjectPath,
  saveFeature,
  saveItem,
  saveProjectMeta,
  isStudioProject,
  scanCandidates,
} from './project.js'
import {
  deleteTexture,
  ensureModel,
  listAssets,
  readModel,
  readTextureDataUrl,
  resolveAssetRoot,
  saveModel,
  uploadTexture,
} from './assets.js'
import { exportProjectDocs } from './docs.js'

/** 当前插件根目录（由 index.js 注入，用于读取内置的构建教程）。 */
let pluginRoot = ''

/** 客户端模块图提供者（由 index.js 注入，仅用于诊断）。 */
let graphProvider = null

/** 设置插件自身目录。 */
export function setPluginRoot(dir) {
  pluginRoot = dir
}

/** 设置客户端模块图提供者。 */
export function setGraphProvider(provider) {
  graphProvider = provider
}

/** 读取内置构建教程。 */
async function readGuide() {
  const candidates = [
    join(pluginRoot, 'docs', 'BUILD-GUIDE.md'),
    join(pluginRoot, 'docs', '构建教程.md'),
  ]
  for (const file of candidates) {
    const text = await fsp.readFile(file, 'utf8').catch(() => null)
    if (text) return text
  }
  return ''
}

/** 确保路径是已登记的工坊项目。 */
async function requireStudio(projectPath) {
  const path = await requireProjectPath(projectPath)
  if (!(await isStudioProject(path))) throw new Error('该目录不是「模组工坊」项目')
  return path
}

/** 动作表。 */
const actions = {
  /** 首屏状态：注册表 + 字段定义 + 教程。 */
  async boot() {
    const registry = await readRegistry()
    const projects = []
    for (const project of registry.projects) {
      const exists = await isDirectory(project.path)
      const meta = exists ? await readProjectMeta(project.path) : null
      projects.push({
        ...project,
        missing: !exists,
        isStudio: Boolean(meta),
        name: meta?.name || project.name || project.path,
        modid: meta?.modid || project.modid || '',
        loader: meta?.loader || '',
        minecraft: meta?.minecraft || MC_VERSION,
        version: meta?.version || '',
      })
    }
    return {
      registry: { root: registry.root, projects },
      schema: itemSchema(),
      defaultRoot: DEFAULT_ROOT,
      mcVersion: MC_VERSION,
      guide: await readGuide(),
    }
  },

  /** 扫描根目录下的候选项目。 */
  async 'projects.scan'(payload) {
    const registry = await readRegistry()
    const root = payload?.root ? expandPath(payload.root) : registry.root
    const candidates = await scanCandidates(root)
    return { root, candidates }
  },

  /** 把目录加入注册表（同时补写工坊标记）。 */
  async 'projects.add'(payload) {
    const path = await requireProjectPath(payload?.path)
    if (!(await isStudioProject(path))) throw new Error('该目录不是工坊项目，请先「导入已有工程」')
    const meta = await readProjectMeta(path)
    await ensureStudioMarker(path, 'add')
    await touchProject(path, { name: meta.name, modid: meta.modid })
    return { path, meta }
  },

  /** 从注册表移除（不删除文件）。 */
  async 'projects.remove'(payload) {
    const path = expandPath(payload?.path)
    await forgetProject(path)
    return { path }
  },

  /** 修改扫描根目录。 */
  async 'registry.setRoot'(payload) {
    const registry = await setRegistryRoot(payload?.root ?? DEFAULT_ROOT)
    return { root: registry.root }
  },

  /** 新建项目（可位于任意目录）。 */
  async 'project.create'(payload) {
    const path = expandPath(payload?.path)
    const project = await createProject({
      path,
      name: payload?.name,
      modid: payload?.modid,
      version: payload?.version,
      description: payload?.description,
      loader: payload?.loader,
    })
    await touchProject(path, { name: project.meta.name, modid: project.meta.modid })
    return project
  },

  /** 打开项目，返回完整数据。 */
  async 'project.open'(payload) {
    const path = await requireProjectPath(payload?.path)
    const project = await readProject(path)
    // 老项目首次打开时补写标记，保证此后能被扫描识别为「已导入」
    await ensureStudioMarker(path, 'open')
    await touchProject(path, { name: project.meta.name, modid: project.meta.modid })
    return project
  },

  /** 导入已有工程（可位于任意目录）。 */
  async 'project.import'(payload) {
    const path = expandPath(payload?.path)
    const project = await importProject({
      path,
      modid: payload?.modid,
      name: payload?.name,
      version: payload?.version,
    })
    await touchProject(path, { name: project.meta.name, modid: project.meta.modid })
    return project
  },

  /** 修改项目元数据。 */
  async 'project.saveMeta'(payload) {
    const path = await requireStudio(payload?.path)
    const meta = await saveProjectMeta(path, payload?.patch ?? {})
    await touchProject(path, { name: meta.name, modid: meta.modid })
    return meta
  },

  // ── 功能列表 ─────────────────────────────────────────────
  async 'features.list'(payload) {
    const path = await requireStudio(payload?.path)
    return { features: await listFeatures(path) }
  },

  async 'features.save'(payload) {
    const path = await requireStudio(payload?.path)
    return { feature: await saveFeature(path, payload?.feature ?? {}) }
  },

  async 'features.delete'(payload) {
    const path = await requireStudio(payload?.path)
    return { features: await deleteFeature(path, String(payload?.id ?? '')) }
  },

  // ── 物品 ────────────────────────────────────────────────
  async 'items.list'(payload) {
    const path = await requireStudio(payload?.path)
    return { items: await listItems(path) }
  },

  async 'items.save'(payload) {
    const path = await requireStudio(payload?.path)
    const item = await saveItem(path, payload?.item ?? {})
    // 新物品自动补一份模型，避免素材页显示缺失
    if (payload?.ensureModel !== false) {
      await ensureModel(path, item).catch(() => {})
    }
    return { item }
  },

  async 'items.delete'(payload) {
    const path = await requireStudio(payload?.path)
    await deleteItem(path, String(payload?.id ?? ''))
    return { ok: true }
  },

  // ── 素材 ────────────────────────────────────────────────
  async 'assets.list'(payload) {
    const path = await requireStudio(payload?.path)
    return await listAssets(path)
  },

  async 'assets.upload'(payload) {
    const path = await requireStudio(payload?.path)
    return await uploadTexture(path, String(payload?.id ?? ''), String(payload?.base64 ?? ''))
  },

  async 'assets.read'(payload) {
    const path = await requireStudio(payload?.path)
    return { dataUrl: await readTextureDataUrl(path, String(payload?.id ?? '')) }
  },

  async 'assets.readMany'(payload) {
    const path = await requireStudio(payload?.path)
    const ids = Array.isArray(payload?.ids) ? payload.ids.map(String) : []
    const images = {}
    for (const id of ids) {
      images[id] = await readTextureDataUrl(path, id).catch(() => null)
    }
    return { images }
  },

  async 'assets.delete'(payload) {
    const path = await requireStudio(payload?.path)
    await deleteTexture(path, String(payload?.id ?? ''))
    return { ok: true }
  },

  async 'assets.model.get'(payload) {
    const path = await requireStudio(payload?.path)
    return { text: await readModel(path, String(payload?.id ?? '')) }
  },

  async 'assets.model.save'(payload) {
    const path = await requireStudio(payload?.path)
    const text = await saveModel(path, String(payload?.id ?? ''), payload?.model ?? '')
    return { text }
  },

  async 'assets.root'(payload) {
    const path = await requireStudio(payload?.path)
    const meta = await readProjectMeta(path)
    return await resolveAssetRoot(path, meta?.modid ?? '')
  },

  // ── 文档 ────────────────────────────────────────────────
  async 'docs.export'(payload) {
    const path = await requireStudio(payload?.path)
    return await exportProjectDocs(path)
  },

  /** 构建教程（内置 markdown）。 */
  async guide() {
    return { text: await readGuide() }
  },

  /** 诊断：列出客户端模块图里与插件相关的条目。 */
  async 'debug.clientGraph'() {
    if (!graphProvider) return { available: false, reason: 'clientModules 服务不可用' }
    let graph = null
    try {
      graph = graphProvider()
    } catch (error) {
      return { available: false, reason: error?.message ?? String(error) }
    }
    if (!graph) return { available: false, reason: 'graph 为空' }
    const text = JSON.stringify(graph)
    const hits = []
    const pattern = /[^"]*mcmods[^"]*/g
    let match
    while ((match = pattern.exec(text))) hits.push(match[0])
    return {
      available: true,
      keys: Object.keys(graph),
      hits: [...new Set(hits)],
    }
  },
}

/**
 * 执行一个动作。
 * 未注册的动作直接报错，避免静默失败。
 */
export async function dispatch(action, payload) {
  const handler = actions[action]
  if (!handler) throw new Error(`未知动作：${action}`)
  return handler(payload ?? {})
}

/**
 * 写回注册表（供调试或未来迁移使用）。
 */
export async function dumpRegistry() {
  return saveRegistry(await readRegistry())
}
