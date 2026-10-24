/**
 * 「模组工坊」Host 半。
 *
 * 职责只有两件事：
 *   1. 注册 HTTP 路由 `/mcmods-studio/api`，把浏览器的动作转发给 lib/api.js；
 *   2. 把插件自身的目录告诉数据层，供读取内置构建教程。
 *
 * 所有业务逻辑放在 `lib/` 下，Host 入口保持简单，方便替换传输层。
 */

import { dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

import { dispatch, setGraphProvider, setPluginRoot } from './lib/api.js'
import { registerTools } from './lib/tool-bridge.js'

/** 请求体上限（贴图以 base64 传输，留出余量）。 */
const MAX_BODY_BYTES = 8 * 1024 * 1024

const here = dirname(fileURLToPath(import.meta.url))
setPluginRoot(here)

/** 读取请求体为字符串。 */
function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = []
    let size = 0
    req.on('data', (chunk) => {
      size += chunk.length
      if (size > MAX_BODY_BYTES) {
        reject(new Error('请求体过大'))
        req.destroy()
        return
      }
      chunks.push(chunk)
    })
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')))
    req.on('error', reject)
  })
}

/** 统一响应。 */
function sendJson(res, status, payload) {
  const body = JSON.stringify(payload)
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
    'Content-Length': Buffer.byteLength(body),
  })
  res.end(body)
}

/** HTTP 处理器。 */
async function handleRequest(req, res) {
  if (req.method !== 'POST') {
    sendJson(res, 405, { ok: false, error: '仅支持 POST' })
    return
  }
  let action = ''
  try {
    const raw = await readBody(req)
    const body = raw ? JSON.parse(raw) : {}
    action = typeof body.action === 'string' ? body.action : ''
    if (!action) throw new Error('缺少 action 字段')
    const data = await dispatch(action, body.payload ?? {})
    sendJson(res, 200, { ok: true, data })
  } catch (error) {
    sendJson(res, 200, {
      ok: false,
      error: error?.message ?? String(error),
      action,
    })
  }
}

/**
 * Host 插件入口。
 * 路由注册在 `child.effect` 中，随插件卸载自动清理。
 */
export function apply(ctx) {
  ctx.inject(['webServer'], (child) => {
    child.effect(
      () =>
        child.webServer.register({
          kind: 'exact',
          path: '/mcmods-studio/api',
          handler: handleRequest,
        }),
      'mcmods-studio: http api',
    )
  })

  // 诊断用：把客户端模块图暴露给 debug 动作，便于确认 Client 半是否被登记。
  ctx.inject(['clientModules'], (child) => {
    child.effect(() => {
      try {
        setGraphProvider(() => child.clientModules.graph())
      } catch {
        setGraphProvider(() => null)
      }
      return () => setGraphProvider(null)
    }, 'mcmods-studio: client graph probe')
  })

  // 把 lib/tools.js 的工具注册为 DSH 原生工具，agent 可直接调用，
  // 不必经过 HTTP。宿主没有 tools 服务时整段跳过。
  ctx.inject(['tools'], (child) => {
    child.effect(() => {
      const disposers = registerTools(child)
      return () => {
        for (const dispose of disposers) {
          try {
            dispose()
          } catch {
            // 卸载期的清理失败不影响其它工具
          }
        }
      }
    }, 'mcmods-studio: agent tools')
  })
}
