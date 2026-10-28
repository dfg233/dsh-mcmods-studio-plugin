/**
 * HTTP API 分派。
 *
 * 浏览器半通过 POST /mcmods-studio/api 调用这里的动作；
 * Host 半（index.js）只负责装载路由，不承载业务逻辑。
 *
 * 动作以声明式路由表描述：每个动作声明 `scope`（需要哪种路径校验）
 * 与 `run`（业务实现）。路径校验、参数兜空、错误包装由 `dispatch` 统一处理，
 * 避免每个动作重复写同样的样板。
 *
 * 同一张表也被 `lib/tools.js` 复用，向 agent 暴露工具时无需再写一遍。
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
  analyzeImport,
  createProject,
  deleteFeature,
  deleteItem,
  ensureStudioMarker,
  importProject,
  reimportProject,
  isStudioProject,
  itemSchema,
  listFeatures,
  listItems,
  readProject,
  readProjectMeta,
  requireProjectPath,
  saveFeature,
  saveItem,
  saveProjectMeta,
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
import { rebuildSummary } from './summary.js'
import { validateProject } from './validate.js'
import { callTool, listTools } from './tools.js'
import {
  compactStructure,
  findRegistration,
  readStructure,
  refreshStructure,
  setAnnotation,
} from './structure.js'

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

/**
 * 路由表。
 *
 * scope 取值：
 *   `none`    不需要路径校验，run 自己处理
 *   `project` 目录必须存在（交给 requireProjectPath）
 *   `studio`  必须是工坊项目（交给 requireStudio）
 *
 * summary 为 true 的动作会在执行后刷新 `.mcstudio/summary.json`。
 */
const routes = {
  /** 首屏状态：注册表 + 字段定义 + 教程。 */
  boot: {
    scope: 'none',
    run: async () => {
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
        registry: { root: registry.root, projects, lastProject: registry.lastProject ?? '' },
        schema: itemSchema(),
        defaultRoot: DEFAULT_ROOT,
        mcVersion: MC_VERSION,
        guide: await readGuide(),
      }
    },
  },

  /** 扫描根目录下的候选项目。 */
  'projects.scan': {
    scope: 'none',
    run: async (input) => {
      const registry = await readRegistry()
      const root = input.root ? expandPath(input.root) : registry.root
      return { root, candidates: await scanCandidates(root) }
    },
  },

  /** 把目录加入注册表（同时补写工坊标记）。 */
  'projects.add': {
    scope: 'project',
    run: async ({ path }) => {
      if (!(await isStudioProject(path))) throw new Error('该目录不是工坊项目，请先「导入已有工程」')
      const meta = await readProjectMeta(path)
      await ensureStudioMarker(path, 'add')
      await touchProject(path, { name: meta.name, modid: meta.modid })
      return { path, meta }
    },
  },

  /** 从注册表移除（不删除文件）。 */
  'projects.remove': {
    scope: 'none',
    run: async (input) => {
      const path = expandPath(input.path)
      await forgetProject(path)
      return { path }
    },
  },

  /**
   * 记住当前打开的项目，供下次进入插件时恢复。
   *
   * 传空字符串表示清除（关闭项目时调用）。路径不在注册表里时忽略，
   * 避免把已移除的项目写回去。
   */
  'projects.remember': {
    scope: 'none',
    run: async (input) => {
      const registry = await readRegistry()
      const target = input.path ? expandPath(input.path) : ''
      const exists = target && registry.projects.some((project) => project.path === target)
      const next = exists ? target : ''
      if (registry.lastProject === next) return { lastProject: next }
      await saveRegistry({ ...registry, lastProject: next })
      return { lastProject: next }
    },
  },

  /** 修改扫描根目录。 */
  'registry.setRoot': {
    scope: 'none',
    run: async (input) => {
      const registry = await setRegistryRoot(input.root ?? DEFAULT_ROOT)
      return { root: registry.root }
    },
  },

  /** 新建项目（可位于任意目录）。 */
  'project.create': {
    scope: 'none',
    summary: true,
    run: async (input) => {
      const path = expandPath(input.path)
      const project = await createProject({
        path,
        name: input.name,
        modid: input.modid,
        version: input.version,
        description: input.description,
        loader: input.loader,
      })
      await touchProject(path, { name: project.meta.name, modid: project.meta.modid })
      return project
    },
  },

  /** 打开项目，返回完整数据。 */
  'project.open': {
    scope: 'project',
    summary: true,
    run: async ({ path }) => {
      const project = await readProject(path)
      // 老项目首次打开时补写标记，保证此后能被扫描识别为「已导入」
      await ensureStudioMarker(path, 'open')
      await touchProject(path, { name: project.meta.name, modid: project.meta.modid })
      return project
    },
  },

  /** 导入已有工程（可位于任意目录）。 */
  'project.import': {
    scope: 'none',
    summary: true,
    run: async (input) => {
      const path = expandPath(input.path)
      const project = await importProject({
        path,
        modid: input.modid,
        name: input.name,
        version: input.version,
        force: input.force === true,
      })
      await touchProject(path, { name: project.meta.name, modid: project.meta.modid })
      return project
    },
  },

  /**
   * 分析导入影响，不写文件。
   * kind: new（全新）/ orphan（有工坊数据但未登记）/ registered（已在列表中）
   */
  'project.analyzeImport': {
    scope: 'none',
    run: async (input) => analyzeImport({
      path: expandPath(input.path),
      modid: input.modid,
      name: input.name,
      version: input.version,
    }),
  },

  /** 重新导入：保留用户数据，同步新增条目。 */
  'project.reimport': {
    scope: 'none',
    summary: true,
    run: async (input) => {
      const path = expandPath(input.path)
      const project = await reimportProject({
        path,
        mode: input.mode === 'overwrite' ? 'overwrite' : 'merge',
        proof: typeof input.proof === 'string' ? input.proof : '',
      })
      await touchProject(path, { name: project.meta.name, modid: project.meta.modid })
      return project
    },
  },

  /** 修改项目元数据。 */
  'project.saveMeta': {
    scope: 'studio',
    run: async ({ path, patch }) => {
      const meta = await saveProjectMeta(path, patch ?? {})
      await touchProject(path, { name: meta.name, modid: meta.modid })
      return meta
    },
  },

  // ── 构想 ─────────────────────────────────────────────────
  'features.list': {
    scope: 'studio',
    run: async ({ path }) => ({ features: await listFeatures(path) }),
  },

  'features.save': {
    scope: 'studio',
    summary: true,
    run: async ({ path, feature }) => ({ feature: await saveFeature(path, feature ?? {}) }),
  },

  'features.delete': {
    scope: 'studio',
    summary: true,
    run: async ({ path, id }) => ({ features: await deleteFeature(path, String(id ?? '')) }),
  },

  // ── 物品 ────────────────────────────────────────────────
  'items.list': {
    scope: 'studio',
    run: async ({ path }) => ({ items: await listItems(path) }),
  },

  'items.save': {
    scope: 'studio',
    summary: true,
    run: async ({ path, item, ensureModel: withModel }) => {
      const saved = await saveItem(path, item ?? {})
      // 新物品自动补一份模型，避免素材页显示缺失
      if (withModel !== false) await ensureModelRecord(path, saved)
      return { item: saved }
    },
  },

  'items.delete': {
    scope: 'studio',
    summary: true,
    run: async ({ path, id }) => {
      await deleteItem(path, String(id ?? ''))
      return { ok: true }
    },
  },

  // ── 素材 ────────────────────────────────────────────────
  'assets.list': {
    scope: 'studio',
    run: async ({ path }) => listAssets(path),
  },

  'assets.upload': {
    scope: 'studio',
    summary: true,
    run: async ({ path, id, base64 }) => uploadTexture(path, String(id ?? ''), String(base64 ?? '')),
  },

  'assets.read': {
    scope: 'studio',
    run: async ({ path, id, kind }) => ({
      dataUrl: await readTextureDataUrl(path, String(id ?? ''), kind === 'block' ? 'block' : 'item'),
    }),
  },

  /**
   * 批量读取贴图。
   *
   * `ids` 支持两种形式：
   *   - `'ruby'`          —— 兼容旧调用，返回键就是 id 本身
   *   - `{ id, kind, key }` —— 方块用，`kind` 为 `block`，`key` 指定返回键
   *
   * 方块贴图在 `textures/block/`，文件名与方块 id 不同，需要按解析出的主贴图名读取。
   */
  'assets.readMany': {
    scope: 'studio',
    run: async ({ path, ids }) => {
      const list = Array.isArray(ids) ? ids : []
      const images = {}
      for (const entry of list) {
        const spec = typeof entry === 'string' ? { id: entry } : (entry ?? {})
        const id = String(spec.id ?? '')
        if (!id) continue
        const kind = spec.kind === 'block' ? 'block' : 'item'
        // 裸字符串保持旧行为：键为 id；对象形式用 key，缺省为 `kind/id`
        const key = spec.key != null
          ? String(spec.key)
          : (typeof entry === 'string' ? id : `${kind}/${id}`)
        images[key] = await readTextureDataUrl(path, id, kind).catch(() => null)
      }
      return { images }
    },
  },

  'assets.delete': {
    scope: 'studio',
    summary: true,
    run: async ({ path, id }) => {
      await deleteTexture(path, String(id ?? ''))
      return { ok: true }
    },
  },

  'assets.model.get': {
    scope: 'studio',
    run: async ({ path, id }) => ({ text: await readModel(path, String(id ?? '')) }),
  },

  'assets.model.save': {
    scope: 'studio',
    run: async ({ path, id, model }) => ({
      text: await saveModel(path, String(id ?? ''), model ?? ''),
    }),
  },

  'assets.root': {
    scope: 'studio',
    run: async ({ path }) => {
      const meta = await readProjectMeta(path)
      return resolveAssetRoot(path, meta?.modid ?? '')
    },
  },

  // ── 文档 ────────────────────────────────────────────────
  'docs.export': {
    scope: 'studio',
    run: async ({ path }) => exportProjectDocs(path),
  },

  /** 构建教程（内置 markdown）。 */
  guide: {
    scope: 'none',
    run: async () => ({ text: await readGuide() }),
  },

  // ── Agent 能力 ──────────────────────────────────────────
  /** 项目摘要：供 agent 一次读取掌握全貌。 */
  'agent.summary': {
    scope: 'studio',
    summary: true,
    run: async ({ path }) => rebuildSummary(path),
  },

  /** 校验项目：返回分级问题清单。 */
  'agent.validate': {
    scope: 'studio',
    run: async ({ path }) => validateProject(path),
  },

  /** 列出可用工具（名称、说明、输入结构）。 */
  'agent.tools': {
    scope: 'none',
    run: async () => ({ tools: listTools(), actions: listActions() }),
  },

  /**
   * 调用工具。
   *
   * 与逐个 HTTP 动作相比，agent 只需记住一个入口 + 工具名，
   * 不必为每个操作拼 URL 与参数结构。
   */
  'agent.call': {
    scope: 'none',
    run: async ({ tool, args }) => callTool(tool, args),
  },

  // ── 代码结构文档 ────────────────────────────────────────
  /**
   * 生成或增量刷新代码结构文档。
   *
   * 确定性扫描，不调用模型：文件未变则整条复用（含 agent 注解），
   * 变了的重新扫描并把旧注解标记为 `stale`。
   */
  'structure.refresh': {
    scope: 'studio',
    summary: true,
    run: async ({ path, force }) => {
      const structure = await refreshStructure(path, { force: Boolean(force) })
      // 顶层同时给出 registrations，省得调用方去翻 index
      return {
        mode: structure.mode,
        totals: structure.totals,
        incremental: structure.incremental,
        registrations: structure.index.registrations,
        index: structure.index,
      }
    },
  },

  /** 读取结构文档；`compact` 为真时只回位置与签名。 */
  'structure.get': {
    scope: 'studio',
    run: async ({ path, compact }) => {
      const structure = await readStructure(path)
      if (!structure) throw new Error('结构文档不存在，请先执行 structure.refresh')
      return compact ? { structure: compactStructure(structure) } : { structure }
    },
  },

  /** 按注册 id 查代码位置，回答「某个物品的注册代码在哪」。 */
  'structure.find': {
    scope: 'studio',
    run: async ({ path, id }) => {
      const structure = await readStructure(path)
      if (!structure) throw new Error('结构文档不存在，请先执行 structure.refresh')
      return { id: String(id ?? ''), hits: findRegistration(structure, String(id ?? '')) }
    },
  },

  /**
   * 写入 agent 的语义注解。
   *
   * 只更新指定文件，其它文件不动，避免一次改写整篇。
   * `file` 是结构文档里的相对路径。
   */
  'structure.annotate': {
    scope: 'studio',
    summary: true,
    run: async ({ path, file, summary, members }) => setAnnotation(path, { file, summary, members }),
  },

  // ── 诊断 ────────────────────────────────────────────────
  /** 列出客户端模块图里与插件相关的条目。 */
  'debug.clientGraph': {
    scope: 'none',
    run: async () => {
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
      return { available: true, keys: Object.keys(graph), hits: [...new Set(hits)] }
    },
  },
}

/** 保存物品后补模型；失败不影响保存结果。 */
async function ensureModelRecord(path, item) {
  await ensureModel(path, item).catch(() => {})
}

/** 已注册的动作名（供工具层与文档引用）。 */
export function listActions() {
  return Object.keys(routes).sort()
}

/**
 * 执行一个动作。
 *
 * 统一处理：动作查找、路径校验、参数兜空、summary 刷新。
 * 未注册的动作直接报错，避免静默失败。
 */
export async function dispatch(action, payload) {
  const route = routes[action]
  if (!route) throw new Error(`未知动作：${action}`)

  const input = payload ?? {}
  let path = null
  if (route.scope === 'studio') path = await requireStudio(input.path)
  else if (route.scope === 'project') path = await requireProjectPath(input.path)

  const result = await route.run(path === null ? input : { ...input, path })

  if (route.summary && path !== null) {
    // 摘要失败不应影响主操作
    await rebuildSummary(path).catch(() => {})
  }
  return result
}
