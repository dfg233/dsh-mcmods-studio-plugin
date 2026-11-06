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

import { join } from 'node:path'

import { readRegistry, expandPath, forgetProject, touchProject, setRegistryRoot, readJson } from './registry.js'
import {
  MC_VERSION,
  analyzeImport,
  createProject,
  deleteFeature,
  deleteItem,
  ensureStudioMarker,
  isStudioProject,
  itemsDir,
  listFeatures,
  listItems,
  readProjectMeta,
  reimportProject,
  saveFeature,
  saveItem,
  saveProjectMeta,
  scanCandidates,
} from './project.js'
import { deleteTexture, listAssets, readModel, saveModel, uploadTexture } from './assets.js'
import { applyContent, previewContent, readContent, restoreContent, rollbackContentHistory } from './content.js'
import { listHistoryEntries } from './history.js'
import { applyLanguage, ensureAllLanguage, ensureItemLanguage, listLanguages, previewLanguage, removeItemLanguage } from './lang.js'
import { apiContext, apiGet, apiSearch, apiStatus, refreshApiIndex } from './api-index.js'
import { applyTemplate, getTemplate, listTemplates, renderTemplate } from './templates.js'
import { applyScaffold, previewScaffold } from './scaffold.js'
import { packContext } from './context.js'
import { applyTask, rollbackTask, startTask, verifyTask } from './tasks.js'
import { exportProjectDocs } from './docs.js'
import { rebuildSummary } from './summary.js'
import { validateProject } from './validate.js'
import {
  compactStructure,
  findRegistration,
  readStructure,
  refreshStructure,
  setAnnotation,
} from './structure.js'
import { itemSchema } from './schema.js'
import { deleteSystem, deleteTask, listSystems, listTasks, readPlan, saveSystem, saveTask } from './workbench.js'

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
    name: 'structure_refresh',
    description: '扫描模组 Java 源码，生成或增量刷新代码结构文档。返回文件、类、方法、行号与注册点。文件未变则复用（含已有注解），变了的标记注解失效。确定性扫描，不调用模型。',
    input: {
      type: 'object',
      properties: {
        project: { type: 'string', description: '项目目录，省略则用默认项目' },
        force: { type: 'boolean', description: '为真时忽略缓存全量重扫' },
      },
    },
    run: async ({ project, force } = {}) => {
      const path = await resolveProject(project)
      const structure = await refreshStructure(path, { force: Boolean(force) })
      // 与 HTTP 动作的 `summary: true` 保持一致；摘要失败不影响主操作
      await rebuildSummary(path).catch(() => {})
      return {
        mode: structure.mode,
        totals: structure.totals,
        incremental: structure.incremental,
        registrations: structure.index.registrations,
      }
    },
  },
  {
    name: 'structure_get',
    description: '读取代码结构文档。回答「功能由哪些代码实现」：文件、类、方法、行号、注册点。compact 只回位置与签名，省 token。',
    input: {
      type: 'object',
      properties: {
        project: { type: 'string', description: '项目目录，省略则用默认项目' },
        compact: { type: 'boolean', description: '为真时只回位置与签名，不含字段详情' },
      },
    },
    run: async ({ project, compact } = {}) => {
      const structure = await readStructure(await resolveProject(project))
      if (!structure) throw new Error('结构文档不存在，请先调用 structure_refresh')
      return compact ? compactStructure(structure) : structure
    },
  },
  {
    name: 'structure_find',
    description: '按物品或方块 id 查注册代码位置。回答「某个条目在哪个文件哪一行注册」。',
    input: {
      type: 'object',
      properties: {
        id: { type: 'string', description: '注册 id，如 ruby 或 ruby_block' },
        project: { type: 'string', description: '项目目录，省略则用默认项目' },
      },
      required: ['id'],
    },
    run: async ({ id, project } = {}) => {
      const structure = await readStructure(await resolveProject(project))
      if (!structure) throw new Error('结构文档不存在，请先调用 structure_refresh')
      return { id, hits: findRegistration(structure, String(id ?? '')) }
    },
  },
  {
    name: 'structure_annotate',
    description: '为代码写语义注解，回答「这段代码实现什么功能」。members 的键为「类名」或「类名#方法名」，值为功能描述。只覆盖指定文件，其它文件不动。',
    input: {
      type: 'object',
      properties: {
        file: { type: 'string', description: '结构文档里的文件路径，如 src/main/java/com/example/ModItems.java' },
        summary: { type: 'string', description: '整个文件的职责概述' },
        members: {
          type: 'object',
          description: '成员注解：{"ModItems":"物品注册表","ModItems#register":"注册全部物品"}',
          additionalProperties: { type: 'string' },
        },
        project: { type: 'string', description: '项目目录，省略则用默认项目' },
      },
      required: ['file'],
    },
    run: async ({ project, ...input } = {}) => {
      const path = await resolveProject(project)
      const result = await setAnnotation(path, input)
      // 注解会改变 summary.code 的 mode / annotated 计数
      await rebuildSummary(path).catch(() => {})
      return result
    },
  },
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
    name: 'project_remove',
    description: '从工坊注册表移除项目登记，不删除项目目录。用于目录已被删除或不再需要管理时清理登记。',
    input: {
      type: 'object',
      properties: {
        path: { type: 'string', description: '项目路径；目录已不存在也可以移除' },
      },
      required: ['path'],
    },
    run: async (args) => {
      const target = expandPath(String(args.path ?? ''))
      if (!target) throw new Error('项目路径为空')
      const registry = await readRegistry()
      const summarize = (projects) => projects.map((entry) => ({
        path: entry.path,
        name: entry.name,
        modid: entry.modid,
      }))
      if (!registry.projects.some((entry) => entry.path === target)) {
        return {
          removed: false,
          path: target,
          message: '该路径不在注册表中',
          projects: summarize(registry.projects),
        }
      }
      const next = await forgetProject(target)
      return { removed: true, path: target, projects: summarize(next.projects) }
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
      const id = String(item?.id ?? '').trim().toLowerCase()
      const previous = id ? await readJson(join(itemsDir(path), `${id}.json`), null) : null
      const saved = await saveItem(path, item ?? {})
      const warnings = []
      // 与 HTTP 的 items.save 保持一致：新建物品连带创建语言键
      if (!previous) {
        await ensureItemLanguage(path, saved).catch((error) => {
          warnings.push(`语言键未创建：${error.message}`)
        })
      }
      await rebuildSummary(path).catch(() => {})
      return warnings.length ? { item: saved, warnings } : { item: saved }
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
      const itemId = String(id ?? '')
      const item = itemId ? await readJson(join(itemsDir(path), `${itemId}.json`), null) : null
      await deleteItem(path, itemId)
      // 与 HTTP 的 items.delete 保持一致：删除物品连带删除语言键
      if (item) await removeItemLanguage(path, item).catch(() => {})
      await rebuildSummary(path).catch(() => {})
      return { ok: true, id: itemId }
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
  {
    name: 'scaffold',
    description: 'Gradle 脚手架：为新项目生成完整可编译的 Forge / NeoForge / Fabric 1.20.1 工程。preview 只预览，apply 写入（已存在文件跳过，可选 verifyBuild 编译验证）。',
    input: {
      type: 'object',
      properties: {
        action: { type: 'string', enum: ['preview', 'apply'] },
        project: { type: 'string', description: '项目目录（可尚未登记）' },
        description: { type: 'string', description: '一句话描述，用于推断 loader 与版本' },
        loader: { type: 'string', enum: ['forge', 'neoforge', 'fabric'] },
        minecraft: { type: 'string', description: '默认 1.20.1' },
        modid: { type: 'string' },
        name: { type: 'string' },
        version: { type: 'string' },
        package: { type: 'string' },
        authors: { type: 'string' },
        license: { type: 'string' },
        modDescription: { type: 'string' },
        verifyBuild: { type: 'boolean', description: 'apply 后是否运行 gradlew compileJava' },
      },
      required: ['action', 'project'],
    },
    run: async ({ action = 'preview', project, ...rest } = {}) => {
      const path = expandPath(String(project ?? ''))
      if (!path) throw new Error('缺少项目目录')
      if (action === 'preview') return previewScaffold(path, rest)
      if (action === 'apply') return applyScaffold(path, rest)
      throw new Error(`未知脚手架动作：${action}`)
    },
  },
  {
    name: 'workbench',
    description: '读取或更新工作台计划：plan 返回想法/系统/任务；system.list/save 管理系统卡；task.list/save 管理任务包。系统卡描述职责与不变量，任务包限定 AI 的修改范围。',
    input: {
      type: 'object',
      properties: {
        action: { type: 'string', enum: ['plan', 'system.list', 'system.save', 'system.delete', 'task.list', 'task.save', 'task.delete'], description: '要执行的动作' },
        project: { type: 'string', description: '项目目录，省略则用默认项目' },
        system: { type: 'object', additionalProperties: true, description: 'system.save 的系统卡对象' },
        task: { type: 'object', additionalProperties: true, description: 'task.save 的任务包对象' },
      },
      required: ['action'],
    },
    run: async ({ action = 'plan', project, system, task } = {}) => {
      const path = await resolveProject(project)
      if (action === 'plan') return readPlan(path)
      if (action === 'system.list') return { systems: await listSystems(path) }
      if (action === 'task.list') return { tasks: await listTasks(path) }
      if (action === 'system.save') {
        if (!system || typeof system !== 'object') throw new Error('system.save 需要 system 对象')
        return { system: await saveSystem(path, system) }
      }
      if (action === 'task.save') {
        if (!task || typeof task !== 'object') throw new Error('task.save 需要 task 对象')
        return { task: await saveTask(path, task) }
      }
      if (action === 'system.delete') {
        const id = String(system?.id ?? '')
        if (!id) throw new Error('system.delete 需要 system.id')
        return { systems: await deleteSystem(path, id) }
      }
      if (action === 'task.delete') {
        const id = String(task?.id ?? '')
        if (!id) throw new Error('task.delete 需要 task.id')
        return { tasks: await deleteTask(path, id) }
      }
      throw new Error(`未知工作台动作：${action}`)
    },
  },
  {
    name: 'api',
    description: 'API 索引：状态（status）、重建（refresh）、搜索（search）、读取类签名（get）、任务上下文（context）。索引来自项目依赖 classpath，默认先 Gradle 后静态扫描。',
    input: {
      type: 'object',
      properties: {
        action: { type: 'string', enum: ['status', 'refresh', 'search', 'get', 'context'] },
        project: { type: 'string', description: '项目目录，省略则用默认项目' },
        mode: { type: 'string', enum: ['auto', 'gradle', 'static'], description: 'refresh 的 classpath 来源' },
        query: { type: 'string', description: 'search 关键词' },
        package: { type: 'string', description: 'search 包过滤' },
        kind: { type: 'string', description: 'search 类型过滤（class/interface/enum/record）' },
        limit: { type: 'number', description: 'search 条数，最多 50' },
        className: { type: 'string', description: 'get 的类名' },
        includeInherited: { type: 'boolean', description: 'get 是否合并继承，默认 true' },
        classRefs: { type: 'array', items: { type: 'string' }, description: 'context 的类名列表' },
        taskId: { type: 'string', description: 'context 的任务 id（读取 apiRefs）' },
        budget: { type: 'object', additionalProperties: true, description: 'context 预算 {apiClasses, apiBytes}' },
      },
      required: ['action'],
    },
    run: async ({
      action = 'status', project, mode, query, package: pkg, kind, limit,
      className, includeInherited, classRefs, taskId, budget,
    } = {}) => {
      const path = await resolveProject(project)
      if (action === 'status') return apiStatus(path)
      if (action === 'refresh') return refreshApiIndex(path, { mode })
      if (action === 'search') return apiSearch(path, { query, package: pkg, kind, limit })
      if (action === 'get') return apiGet(path, className, { includeInherited })
      if (action === 'context') {
        let refs = Array.isArray(classRefs) ? classRefs : []
        if (!refs.length && taskId) {
          const tasks = await listTasks(path)
          const task = tasks.find((item) => item.id === taskId)
          refs = Array.isArray(task?.apiRefs) ? task.apiRefs : []
        }
        return apiContext(path, refs, budget ?? {})
      }
      throw new Error(`未知 API 动作：${action}`)
    },
  },
  {
    name: 'template',
    description: '模板：列出（list）、读取（get）、渲染预览（render）、写入（apply）。渲染不落盘；apply 写入前备份，已存在文件默认跳过，json 可合并。',
    input: {
      type: 'object',
      properties: {
        action: { type: 'string', enum: ['list', 'get', 'render', 'apply'] },
        project: { type: 'string', description: '项目目录，省略则用默认项目' },
        id: { type: 'string', description: '模板 id，如 simple-item' },
        params: { type: 'object', additionalProperties: true, description: '渲染参数（id/displayName 等）' },
      },
      required: ['action'],
    },
    run: async ({ action = 'list', project, id, params } = {}) => {
      if (action === 'list') return { templates: await listTemplates() }
      if (action === 'get') return getTemplate(id)
      const path = await resolveProject(project)
      if (action === 'render') return renderTemplate(path, id, params ?? {})
      if (action === 'apply') return applyTemplate(path, id, params ?? {})
      throw new Error(`未知模板动作：${action}`)
    },
  },
  {
    name: 'context',
    description: '任务上下文包：把任务需要的 API 签名、代码摘录、模板与资源裁进预算（默认 10 文件 / 12KB / 20 类）。',
    input: {
      type: 'object',
      properties: {
        project: { type: 'string', description: '项目目录，省略则用默认项目' },
        taskId: { type: 'string', description: '任务 id' },
        budget: { type: 'object', additionalProperties: true, description: '预算 {files, bytes, apiClasses, apiBytes}' },
      },
      required: ['taskId'],
    },
    run: async ({ project, taskId, budget } = {}) => {
      const path = await resolveProject(project)
      return packContext(path, String(taskId ?? ''), { budget })
    },
  },
  {
    name: 'task',
    description: '任务执行：开始（start，保存结构快照）、应用变更集（apply，只写允许路径、写入前备份）、验证（verify）、回滚（rollback）。',
    input: {
      type: 'object',
      properties: {
        action: { type: 'string', enum: ['start', 'apply', 'verify', 'rollback'] },
        project: { type: 'string', description: '项目目录，省略则用默认项目' },
        id: { type: 'string', description: '任务 id' },
        files: {
          type: 'array',
          items: { type: 'object', additionalProperties: true },
          description: 'apply 的变更集：[{path, content}]',
        },
        requestId: { type: 'string', description: 'apply 幂等标识' },
        compile: { type: 'boolean', description: 'verify 是否执行 compile-java' },
      },
      required: ['action', 'id'],
    },
    run: async ({ action = 'start', project, id, files, requestId, compile } = {}) => {
      const path = await resolveProject(project)
      const taskId = String(id ?? '')
      if (action === 'start') return startTask(path, taskId)
      if (action === 'apply') return applyTask(path, taskId, files, { requestId })
      if (action === 'verify') return verifyTask(path, taskId, { compile })
      if (action === 'rollback') return rollbackTask(path, taskId)
      throw new Error(`未知任务动作：${action}`)
    },
  },
  {
    name: 'content',
    description: '内容资源：读取回填（get）、预览（preview）、应用（apply）、历史列表（history.list）、回到某步（history.rollback）、按备份回滚（rollback）。apply 写语言/配方/模型/标签，自动备份并记历史。',
    input: {
      type: 'object',
      properties: {
        action: { type: 'string', enum: ['get', 'preview', 'apply', 'history.list', 'history.rollback', 'rollback'] },
        project: { type: 'string', description: '项目目录，省略则用默认项目' },
        id: { type: 'string', description: '物品 id（get/preview/apply）' },
        content: { type: 'object', additionalProperties: true, description: '内容结构；先用 get 读出再修改' },
        item: { type: 'object', additionalProperties: true, description: '新建物品保存前的预览用' },
        entryId: { type: 'string', description: 'history.rollback 的历史步 id' },
        mode: { type: 'string', enum: ['toStep', 'beforeStep'], description: '回滚语义，默认 toStep' },
        itemId: { type: 'string', description: 'history.list 只看某个物品' },
        includeArchived: { type: 'boolean', description: 'history.list 是否包含已归档' },
        backupDir: { type: 'string', description: 'rollback 的备份目录（content.apply / template.apply 返回）' },
      },
      required: ['action'],
    },
    run: async ({ action = 'get', project, id, content, item, entryId, mode, itemId, includeArchived, backupDir } = {}) => {
      const path = await resolveProject(project)
      if (action === 'get') return readContent(path, String(id ?? ''))
      if (action === 'preview') return previewContent(path, String(id ?? ''), content ?? {}, item ?? null)
      if (action === 'apply') {
        const result = await applyContent(path, String(id ?? ''), content ?? {})
        await rebuildSummary(path).catch(() => {})
        return result
      }
      if (action === 'rollback') {
        if (typeof backupDir !== 'string' || !backupDir.trim()) throw new Error('rollback 需要 backupDir')
        await restoreContent(path, backupDir)
        await rebuildSummary(path).catch(() => {})
        return { ok: true, restored: true }
      }
      if (action === 'history.list') {
        return listHistoryEntries(path, {
          itemId: typeof itemId === 'string' ? itemId : '',
          includeArchived: includeArchived === true,
        })
      }
      if (action === 'history.rollback') {
        const result = await rollbackContentHistory(path, String(entryId ?? ''), { mode })
        await rebuildSummary(path).catch(() => {})
        return result
      }
      throw new Error(`未知内容动作：${action}`)
    },
  },
  {
    name: 'lang',
    description: '语言文件：列出（list）、预览（preview）、保存（save）、补建缺失键（ensure）。保存只改已存在的键，空串删除键，自动备份并记历史。',
    input: {
      type: 'object',
      properties: {
        action: { type: 'string', enum: ['list', 'preview', 'save', 'ensure'] },
        project: { type: 'string', description: '项目目录，省略则用默认项目' },
        changes: { type: 'object', additionalProperties: true, description: 'save/preview：{ zh_cn: { 键: 值 }, en_us: { 键: 值 } }' },
      },
      required: ['action'],
    },
    run: async ({ action = 'list', project, changes } = {}) => {
      const path = await resolveProject(project)
      if (action === 'list') return listLanguages(path)
      if (action === 'preview') return previewLanguage(path, changes ?? {})
      if (action === 'save') return applyLanguage(path, changes ?? {})
      if (action === 'ensure') return ensureAllLanguage(path)
      throw new Error(`未知语言动作：${action}`)
    },
  },
  {
    name: 'asset',
    description: '素材：清单（list）、上传贴图（upload，PNG base64）、删除贴图（delete）、读取模型（model.get）、保存模型（model.save）。贴图必须 PNG、正方形、≤2MB。',
    input: {
      type: 'object',
      properties: {
        action: { type: 'string', enum: ['list', 'upload', 'delete', 'model.get', 'model.save'] },
        project: { type: 'string', description: '项目目录，省略则用默认项目' },
        id: { type: 'string', description: '物品或方块 id' },
        kind: { type: 'string', enum: ['item', 'block'], description: '贴图类型，默认 item' },
        base64: { type: 'string', description: 'upload：PNG base64（不含 data: 前缀）' },
        model: { type: 'string', description: 'model.save：模型 JSON 文本' },
      },
      required: ['action'],
    },
    run: async ({ action = 'list', project, id, kind, base64, model } = {}) => {
      const path = await resolveProject(project)
      const targetKind = kind === 'block' ? 'block' : 'item'
      if (action === 'list') return listAssets(path)
      if (action === 'upload') {
        const result = await uploadTexture(path, String(id ?? ''), String(base64 ?? ''), targetKind)
        await rebuildSummary(path).catch(() => {})
        return result
      }
      if (action === 'delete') {
        await deleteTexture(path, String(id ?? ''), targetKind)
        await rebuildSummary(path).catch(() => {})
        return { ok: true }
      }
      if (action === 'model.get') return { text: await readModel(path, String(id ?? '')) }
      if (action === 'model.save') {
        return { text: await saveModel(path, String(id ?? ''), typeof model === 'string' ? model : JSON.stringify(model ?? {})) }
      }
      throw new Error(`未知素材动作：${action}`)
    },
  },
  {
    name: 'project_admin',
    description: '项目管理：重新导入（reimport）、添加已有工坊项目（add）、保存元数据（saveMeta）、设置扫描根目录（setRoot）。',
    input: {
      type: 'object',
      properties: {
        action: { type: 'string', enum: ['reimport', 'add', 'saveMeta', 'setRoot'] },
        project: { type: 'string', description: '项目目录（reimport/add/saveMeta）' },
        path: { type: 'string', description: '同 project，兼容写法' },
        mode: { type: 'string', enum: ['merge', 'overwrite'], description: 'reimport 模式，默认 merge' },
        proof: { type: 'string', description: 'reimport 的预览 proof（project_analyze 返回）' },
        patch: { type: 'object', additionalProperties: true, description: 'saveMeta 的字段补丁' },
        root: { type: 'string', description: 'setRoot 的扫描根目录' },
      },
      required: ['action'],
    },
    run: async ({ action = 'reimport', project, path: rawPath, mode, proof, patch, root } = {}) => {
      if (action === 'setRoot') {
        const registry = await setRegistryRoot(root ?? '')
        return { root: registry.root }
      }
      const target = await resolveProject(project ?? rawPath)
      if (action === 'reimport') {
        const result = await reimportProject({
          path: target,
          mode: mode === 'overwrite' ? 'overwrite' : 'merge',
          proof: typeof proof === 'string' ? proof : '',
        })
        await touchProject(target, { name: result.meta.name, modid: result.meta.modid })
        await rebuildSummary(target).catch(() => {})
        return result
      }
      if (action === 'add') {
        if (!(await isStudioProject(target))) throw new Error('该目录不是工坊项目，请先用 project_import 导入')
        const meta = await readProjectMeta(target)
        await ensureStudioMarker(target, 'add')
        await touchProject(target, { name: meta.name, modid: meta.modid })
        return { path: target, meta }
      }
      if (action === 'saveMeta') {
        const meta = await saveProjectMeta(target, patch ?? {})
        await touchProject(target, { name: meta.name, modid: meta.modid })
        return meta
      }
      throw new Error(`未知项目动作：${action}`)
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
