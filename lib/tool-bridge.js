/**
 * 把 `lib/tools.js` 的工具注册为 DSH 原生工具。
 *
 * 注册后 agent 可以直接调用（例如 `mcmods_item_list`），
 * 不必自己拼 HTTP 请求。未注入 `tools` 服务时整段跳过，不影响 HTTP 通道。
 *
 * 命名统一加 `mcmods_` 前缀，避免与其他插件的工具重名。
 */

import { TOOLS } from './tools.js'

/** 工具名前缀。 */
const PREFIX = 'mcmods_'

/** 把 JSON Schema 物件转为 DSH 需要的 parameters 结构。 */
function parametersOf(tool) {
  const input = tool.input ?? { type: 'object', properties: {} }
  return {
    type: 'object',
    properties: input.properties ?? {},
    ...(Array.isArray(input.required) && input.required.length
      ? { required: input.required }
      : {}),
    additionalProperties: false,
  }
}

/** 把工具返回值渲染成一段可读文本。 */
function renderResult(name, value) {
  let text
  try {
    text = JSON.stringify(value, null, 2)
  } catch {
    text = String(value)
  }
  if (text.length > 20000) text = `${text.slice(0, 20000)}\n…（已截断）`
  return `${name}\n${text}`
}

/** 构造一个 DSH 工具定义。 */
function definitionOf(tool) {
  const name = `${PREFIX}${tool.name}`
  return {
    name,
    description: tool.description,
    parameters: parametersOf(tool),
    execute: async (args) => {
      try {
        return await tool.run(args ?? {})
      } catch (error) {
        // 统一成带原因的失败，避免 agent 拿到未处理的堆栈
        throw new Error(`${tool.name} 失败：${error?.message ?? String(error)}`)
      }
    },
    output: {
      schema: { type: 'object' },
      render: (_args, value) => [{ type: 'text', text: renderResult(name, value) }],
    },
  }
}

/**
 * 注册全部工具。
 *
 * @param ctx 宿主上下文（需要 `tools` 服务）
 * @returns disposer 数组；调用时逐个注销
 */
export function registerTools(ctx) {
  if (!ctx?.tools || typeof ctx.tools.register !== 'function') {
    throw new Error('宿主未提供 tools 服务，无法注册工具')
  }
  const disposers = []
  for (const tool of TOOLS) {
    try {
      disposers.push(ctx.tools.register(definitionOf(tool)))
    } catch (error) {
      // 单个工具注册失败不应拖垮其余工具
      console.warn(`[mcmods] 注册工具 ${tool.name} 失败：${error?.message ?? error}`)
    }
  }
  return disposers
}

/** 已注册的工具名（用于日志与文档）。 */
export function toolNames() {
  return TOOLS.map((tool) => `${PREFIX}${tool.name}`)
}
