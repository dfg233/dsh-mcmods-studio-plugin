/**
 * Agent 工具层。
 *
 * 目标：让 agent 不必自己拼 HTTP 请求、猜测数据结构，就能读写项目。
 * 工具直接调用业务函数（不经过 HTTP），因此没有端口与序列化开销。
 *
 * 返回格式面向 agent 优化：
 *   - 列举类工具默认只回 id / 名称 / 类型等最小字段（约 300 字节可列 12 个物品）；
 *   - 详情类工具才回完整属性。
 *
 * 工具清单同时可通过 `listTools()` 导出，供 agent 发现能力。
 */

import { readRegistry, expandPath } from './registry.js'
import {
  MC_VERSION,
  analyzeImport,
  createProject,
  deleteFeature,
  deleteItem,
  listFeatures,
  listItems,
  readProjectMeta,
  saveFeature,
  saveItem,
  scanCandidates,
} from './project.js'
import { listAssets } from './assets.js'
import { exportProjectDocs } from './docs.js'
import { rebuildSummary } from './summary.js'
import { validateProject } from './validate.js'
import { itemSchema } from './schema.js'

/** 找到当前应该操作的项目：优先显式路径，其次注册表里第一个可用项目。 */
async function resolveProject(projectPath) {
  if (projectPath) {
    const path = expandPath(projectPath)
    const meta = await readProjectMeta(path)
    if (!meta) throw new Error(`不是工坊项目：${path}`)
    return path
  }
  const registry = await readRegistry()
  for (const entry of registry.projects) {
    const meta = await readProjectMeta(entry.path).catch(() => null)
    if (meta) return entry.path
  }
  throw new Error('当前没有可用的工坊项目，请先用 project_create 或 project_import 建立')
}

/** 工具定义表。 */
export const TOOLS = [
  {
    name: 'project_summary',
    description: '读取项目摘要：元数据、构想与物品清单、缺失素材统计。一次调用即可掌握全貌。',
    input: {
      type: 'object',
      properties: { project: { type: 'string', description: '项目目录，省略则用默认项目' } },
    },
    run: async ({ project } = {}) => rebuildSummary(await resolveProject(project)),
  },
  {
    name: 'project_list',
    description: '列出本机登记的所有工坊项目。',
    input: { type: 'object', properties: {} },
    run: async () => {
      const registry = await readRegistry()
      const projects = []
      for (const entry of registry.projects) {
        const meta = await readProjectMeta(entry.path).catch(() => null)
        projects.push({
          path: entry.path,
          name: meta?.name ?? '',
          modid: meta?.modid ?? '',
          loader: meta?.loader ?? '',
          ok: Boolean(meta),
        })
      }
      return { root: registry.root, projects }
    },
  },
  {
    name: 'project_create',
    description: '新建工坊项目。目录须为空或不存在。',
    input: {
      type: 'object',
      properties: {
        path: { type: 'string' },
        name: { type: 'string' },
        modid: { type: 'string' },
        version: { type: 'string' },
        loader: { type: 'string', enum: ['forge', 'neoforge', 'fabric'] },
      },
      required: ['path', 'name', 'modid', 'loader'],
    },
    run: async (args) => {
      const project = await createProject(args)
      await rebuildSummary(project.path).catch(() => {})
      return { path: project.path, meta: project.meta }
    },
  },
  {
    name: 'project_import',
    description: '导入已有模组工程。自动读取 gradle.properties 与描述文件补全信息。',
    input: {
      type: 'object',
      properties: {
        path: { type: 'string' },
        modid: { type: 'string', description: '仅当自动识别失败时填写' },
        name: { type: 'string' },
        version: { type: 'string' },
      },
      required: ['path'],
    },
    run: async (args) => {
      const { importProject } = await import('./project.js')
      const project = await importProject(args)
      await rebuildSummary(project.path).catch(() => {})
      return {
        path: project.path,
        meta: project.meta,
        created: project.imported?.created ?? [],
      }
    },
  },
  {
    name: 'project_analyze',
    description: '分析导入影响而不写文件：返回已登记 / 曾移除 / 全新，以及新增与冲突条目。',
    input: {
      type: 'object',
      properties: { path: { type: 'string' } },
      required: ['path'],
    },
    run: async ({ path }) => analyzeImport({ path }),
  },
  {
    name: 'item_list',
    description: '列出物品（紧凑格式）。可选按类型筛选。',
    input: {
      type: 'object',
      properties: {
        project: { type: 'string' },
        type: { type: 'string', description: 'item / block / tool / weapon / armor / food / material' },
        query: { type: 'string', description: '按 id 或显示名过滤' },
      },
    },
    run: async ({ project, type, query } = {}) => {
      const path = await resolveProject(project)
      let items = await listItems(path)
      if (type) items = items.filter((item) => item.type === type)
      if (query) {
        const needle = String(query).toLowerCase()
        items = items.filter(
          (item) => item.id.includes(needle) || String(item.displayName).toLowerCase().includes(needle),
        )
      }
      return {
        count: items.length,
        items: items.map((item) => ({ id: item.id, name: item.displayName, type: item.type })),
      }
    },
  },
  {
    name: 'item_get',
    description: '读取单个物品的完整属性（19 项，带中文标签与单位）。',
    input: {
      type: 'object',
      properties: { project: { type: 'string' }, id: { type: 'string' } },
      required: ['id'],
    },
    run: async ({ project, id } = {}) => {
      const path = await resolveProject(project)
      const items = await listItems(path)
      const item = items.find((entry) => entry.id === id)
      if (!item) throw new Error(`没有这个物品：${id}`)
      const fields = itemSchema().fields.map((field) => ({
        key: field.key,
        label: field.label,
        group: field.group,
        value: item.properties?.[field.key],
        unit: field.unit ?? '',
      }))
      return {
        id: item.id,
        displayName: item.displayName,
        type: item.type,
        description: item.description,
        canvas: item.canvas,
        fields,
      }
    },
  },
  {
    name: 'item_save',
    description: '新增或更新物品。只需提供要改的字段，其余按默认值补全。',
    input: {
      type: 'object',
      properties: {
        project: { type: 'string' },
        item: { type: 'object', description: '至少包含 id；其余字段可省略' },
      },
      required: ['item'],
    },
    run: async ({ project, item } = {}) => {
      const path = await resolveProject(project)
      const saved = await saveItem(path, item ?? {})
      await rebuildSummary(path).catch(() => {})
      return { item: saved }
    },
  },
  {
    name: 'item_delete',
    description: '删除物品及其贴图与模型文件。',
    input: {
      type: 'object',
      properties: { project: { type: 'string' }, id: { type: 'string' } },
      required: ['id'],
    },
    run: async ({ project, id } = {}) => {
      const path = await resolveProject(project)
      await deleteItem(path, String(id))
      await rebuildSummary(path).catch(() => {})
      return { ok: true, id }
    },
  },
  {
    name: 'idea_list',
    description: '列构想（紧凑格式），含状态与优先级。',
    input: {
      type: 'object',
      properties: { project: { type: 'string' }, status: { type: 'string' } },
    },
    run: async ({ project, status } = {}) => {
      const path = await resolveProject(project)
      let ideas = await listFeatures(path)
      if (status) ideas = ideas.filter((idea) => idea.status === status)
      return {
        count: ideas.length,
        ideas: ideas.map((idea) => ({
          id: idea.id,
          name: idea.name,
          status: idea.status,
          priority: idea.priority,
        })),
      }
    },
  },
  {
    name: 'idea_save',
    description: '新增或更新构想。',
    input: {
      type: 'object',
      properties: { project: { type: 'string' }, idea: { type: 'object' } },
      required: ['idea'],
    },
    run: async ({ project, idea } = {}) => {
      const path = await resolveProject(project)
      const feature = await saveFeature(path, idea ?? {})
      await rebuildSummary(path).catch(() => {})
      return { idea: feature }
    },
  },
  {
    name: 'idea_delete',
    description: '删除构想。',
    input: {
      type: 'object',
      properties: { project: { type: 'string' }, id: { type: 'string' } },
      required: ['id'],
    },
    run: async ({ project, id } = {}) => {
      const path = await resolveProject(project)
      const features = await deleteFeature(path, String(id))
      await rebuildSummary(path).catch(() => {})
      return { ok: true, remaining: features.length }
    },
  },
  {
    name: 'asset_list',
    description: '列出贴图与模型，并给出缺失素材的条目。',
    input: {
      type: 'object',
      properties: { project: { type: 'string' } },
    },
    run: async ({ project } = {}) => {
      const path = await resolveProject(project)
      const assets = await listAssets(path)
      return {
        root: assets.root,
        standard: assets.standard,
        textures: assets.textures.map((entry) => entry.id),
        models: assets.models.map((entry) => entry.id),
        missing: assets.missing,
      }
    },
  },
  {
    name: 'project_validate',
    description: '校验项目：id、数值范围、贴图与模型缺失、模型引用、语言键。返回分级问题清单。',
    input: {
      type: 'object',
      properties: { project: { type: 'string' } },
    },
    run: async ({ project } = {}) => validateProject(await resolveProject(project)),
  },
  {
    name: 'doc_export',
    description: '导出 Markdown 文档到项目 docs/ 目录，返回文件清单。',
    input: {
      type: 'object',
      properties: { project: { type: 'string' } },
    },
    run: async ({ project } = {}) => {
      const path = await resolveProject(project)
      return exportProjectDocs(path)
    },
  },
  {
    name: 'schema_get',
    description: '读取字段定义：加载器、构想状态、物品类型与 19 个属性字段。',
    input: {
      type: 'object',
      properties: { compact: { type: 'boolean', description: 'true 时只返回字段 key 与类型' } },
    },
    run: async ({ compact } = {}) => {
      const schema = itemSchema()
      if (!compact) return { mcVersion: MC_VERSION, ...schema }
      return {
        mcVersion: MC_VERSION,
        loaders: schema.loaders.map((entry) => entry.id),
        statuses: schema.statuses.map((entry) => entry.id),
        priorities: schema.priorities.map((entry) => entry.id),
        types: schema.types.map((entry) => entry.id),
        fields: schema.fields.map((entry) => ({ key: entry.key, type: entry.type, group: entry.group })),
      }
    },
  },
  {
    name: 'project_scan',
    description: '扫描根目录，列出候选工程及其是否已导入。',
    input: {
      type: 'object',
      properties: { root: { type: 'string' } },
    },
    run: async ({ root } = {}) => {
      const registry = await readRegistry()
      const target = root ? expandPath(root) : registry.root
      const candidates = await scanCandidates(target)
      return {
        root: target,
        count: candidates.length,
        candidates: candidates.map((entry) => ({
          path: entry.path,
          name: entry.name,
          modid: entry.modid,
          loader: entry.loader,
          imported: entry.imported,
        })),
      }
    },
  },
]

/** 工具名到定义的映射。 */
const byName = new Map(TOOLS.map((tool) => [tool.name, tool]))

/** 列出全部工具（供 agent 发现能力）。 */
export function listTools() {
  return TOOLS.map((tool) => ({
    name: tool.name,
    description: tool.description,
    input: tool.input,
  }))
}

/** 调用一个工具。 */
export async function callTool(name, args) {
  const tool = byName.get(name)
  if (!tool) throw new Error(`未知工具：${name}`)
  return tool.run(args ?? {})
}
