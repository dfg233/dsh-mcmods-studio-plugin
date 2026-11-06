/**
 * 标记区块：只替换标记之间的内容，不覆盖手写代码。
 *
 * 语法（沿用 CODEGEN-PLAN）：
 *   // <mcstudio:generated items>
 *   ...生成内容...
 *   // </mcstudio:generated>
 *
 * 规则：
 *   - 同一文件同一 id 只能有一个标记块；
 *   - 块内出现另一个 open 标记视为嵌套错误；
 *   - open 没有对应 close 视为未闭合；
 *   - 有 close 但前面没有 open 视为孤立 close；
 *   - 标记行本身保留，只替换之间的内容。
 */

const OPEN_RE = /^\s*\/\/\s*<mcstudio:generated\s+([A-Za-z0-9_-]+)>\s*$/
const CLOSE_RE = /^\s*\/\/\s*<\/mcstudio:generated>\s*$/

function detectSeparator(text) {
  return String(text ?? '').includes('\r\n') ? '\r\n' : '\n'
}

function splitLines(text) {
  return String(text ?? '').split(/\r?\n/)
}

/**
 * 解析标记块与错误。
 *
 * 返回：
 *   blocks: [{ id, startLine, endLine, content }]  // 行号 0-based，endLine 是 close 行
 *   errors: [{ type: 'duplicate'|'nested'|'unclosed'|'orphan-close', id?, line }] // line 1-based
 */
export function findMarkers(text) {
  const lines = splitLines(text)
  const separator = detectSeparator(text)
  const blocks = []
  const errors = []
  const seen = new Set()
  let current = null

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index]
    const open = line.match(OPEN_RE)
    const isClose = CLOSE_RE.test(line)

    if (open) {
      const id = open[1]
      if (current) {
        errors.push({ type: 'nested', id: current.id, line: index + 1 })
      }
      if (seen.has(id)) {
        errors.push({ type: 'duplicate', id, line: index + 1 })
      }
      seen.add(id)
      current = { id, startLine: index, buffer: [] }
      continue
    }

    if (isClose) {
      if (!current) {
        errors.push({ type: 'orphan-close', line: index + 1 })
        continue
      }
      blocks.push({
        id: current.id,
        startLine: current.startLine,
        endLine: index,
        content: current.buffer.join(separator),
      })
      current = null
      continue
    }

    if (current) current.buffer.push(line)
  }

  if (current) {
    errors.push({ type: 'unclosed', id: current.id, line: current.startLine + 1 })
  }

  return { blocks, errors, separator }
}

/** 某 id 的标记块是否存在。 */
export function hasMarker(text, id) {
  return findMarkers(text).blocks.some((block) => block.id === id)
}

function assertNoErrors(parsed, id) {
  const related = parsed.errors.filter((error) => !id || error.id === id || error.type === 'duplicate')
  if (related.length) {
    const text = related.map((error) => `${error.type}${error.id ? `(${error.id})` : ''}@${error.line}`).join(', ')
    throw new Error(`标记区块不合法：${text}`)
  }
}

/**
 * 替换指定 id 的内容；块不存在时返回 null。
 */
export function replaceMarker(text, id, content) {
  const parsed = findMarkers(text)
  assertNoErrors(parsed, id)
  const block = parsed.blocks.find((item) => item.id === id)
  if (!block) return null
  const lines = splitLines(text)
  const next = [
    ...lines.slice(0, block.startLine + 1),
    ...splitLines(String(content ?? '')),
    ...lines.slice(block.endLine),
  ]
  return next.join(parsed.separator)
}

/**
 * 在文件末尾追加一个标记块。
 */
export function appendMarker(text, id, content) {
  const parsed = findMarkers(text)
  assertNoErrors(parsed)
  const separator = parsed.separator
  const base = String(text ?? '')
  const prefix = base.length === 0 ? '' : (base.endsWith(separator) ? '' : separator)
  const block = [
    `// <mcstudio:generated ${id}>`,
    String(content ?? '').replace(/\r?\n$/, ''),
    '// </mcstudio:generated>',
    '',
  ]
  return `${base}${prefix}${separator}${block.join(separator)}`
}

/**
 * 有则替换、无则追加；返回新文本。
 */
export function upsertMarker(text, id, content) {
  const replaced = replaceMarker(text, id, content)
  if (replaced !== null) return replaced
  return appendMarker(text, id, content)
}

/**
 * 删除指定 id 的标记块（含标记行）；不存在返回 null。
 */
export function removeMarker(text, id) {
  const parsed = findMarkers(text)
  assertNoErrors(parsed, id)
  const block = parsed.blocks.find((item) => item.id === id)
  if (!block) return null
  const lines = splitLines(text)
  const next = [...lines.slice(0, block.startLine), ...lines.slice(block.endLine + 1)]
  return next.join(parsed.separator)
}

/** 校验文本中的标记是否合法；合法返回错误数组（空表示合法）。 */
export function validateMarkers(text) {
  return findMarkers(text).errors
}
