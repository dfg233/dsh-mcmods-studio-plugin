/**
 * 事务原语（v0.6.0 P2）：项目级串行、revision CAS 与错误码。
 *
 * 约束（P0 决策）：
 *   - D3 仅单进程：队列只覆盖同进程；多 Host 同写不在保证范围。
 *   - D2 批次栈：由调用方（tasks）维护批次目录与记录。
 */

import { resolve } from 'node:path'
import { AsyncLocalStorage } from 'node:async_hooks'

const queues = new Map()
const lockContext = new AsyncLocalStorage()

/** 同进程内按项目串行执行：后续调用排队等待前一个完成；锁内重入直接执行。 */
export function runExclusive(projectPath, fn) {
  const key = resolve(projectPath)
  const held = lockContext.getStore()
  if (held && held.has(key)) return Promise.resolve().then(fn)
  const previous = queues.get(key) ?? Promise.resolve()
  const next = previous.then(
    () => lockContext.run(new Set([key]), fn),
    () => lockContext.run(new Set([key]), fn),
  )
  const settled = next.catch(() => {})
  queues.set(key, settled)
  settled.finally(() => {
    if (queues.get(key) === settled) queues.delete(key)
  })
  return next
}

export function conflict(message) {
  const error = new Error(message)
  error.code = 'CONFLICT'
  return error
}

/**
 * revision CAS：传了 expected 就必须匹配当前值。
 * 不传 expected 时保持向后兼容（旧调用方不带版本）。
 */
export function assertRevision(current, expected, label = '记录') {
  if (expected === undefined || expected === null || expected === '') return
  if (Number(expected) !== Number(current)) {
    throw conflict(`${label}已被修改（revision ${current} ≠ ${expected}）`)
  }
}

/** 递增 revision，返回新值。 */
export function bumpRevision(current) {
  return Number(current ?? 0) + 1
}
