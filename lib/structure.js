/**
 * 模组代码结构文档（`.mcstudio/structure.json`）。
 *
 * 目的：让 agent 一次读到「哪段代码实现什么」，不必反复 grep 源码。
 * 回答两类问题：
 *   1. 功能由哪些代码实现 —— 文件、类、方法、行号、注册调用；
 *   2. 这段代码实现什么功能 —— `annotation` 字段，由 agent 补写。
 *
 * 与 summary.json 的边界：
 *   - summary.json 描述「设计层」：构想、物品属性、素材是否齐全；
 *   - structure.json 描述「实现层」：Java 文件结构、注册点、方法位置。
 *   两者都是派生数据，可删除重建，不作为事实来源。
 *
 * 更新策略：按文件哈希增量。文件未变则整条复用（含 agent 注解），
 * 变了的重新扫描并标记注解失效，不整篇重写。
 *
 * 本模块的扫描是确定性的，不调用模型；语义注解由 agent 通过工具写入。
 */

import { createHash } from 'node:crypto'
import { promises as fsp } from 'node:fs'
import { join } from 'node:path'

import { isDirectory, readJson, writeJson } from './registry.js'
import { projectDataDir } from './paths.js'
import { readProjectMeta } from './meta.js'
import { isValidItemId } from './paths.js'

/** 结构文档文件名。 */
export const STRUCTURE_FILE = 'structure.json'

/**
 * 解析器版本。解析逻辑变化时 +1，让旧缓存整份失效。
 *
 * 只靠文件哈希无法发现「代码没变、解析器变了」的情况；升级插件后若继续复用
 * 旧扫描结果，会把旧解析器的错误结论一直带下去。
 */
export const PARSER_VERSION = 2

/** 单个 Java 文件扫描上限。 */
const MAX_FILE_BYTES = 512 * 1024

/** 最多扫描的 Java 文件数，防止超大工程拖慢。 */
const MAX_FILES = 4000

/** 结构文档路径。 */
export function structureFile(projectPath) {
  return join(projectDataDir(projectPath), STRUCTURE_FILE)
}

/** 源码根目录。 */
function javaRoot(projectPath) {
  return join(projectPath, 'src', 'main', 'java')
}

/**
 * 把源码里的注释与字符串内容替换成空格，长度保持不变。
 *
 * 这样后续正则不会误匹配字符串里的 `class` 或注释里的 `{`，
 * 而行号、列位置仍与原文一一对应。
 */
export function maskSource(text) {
  const out = []
  let i = 0
  const n = text.length
  let state = 'code'

  while (i < n) {
    const ch = text[i]

    if (state === 'code') {
      if (ch === '/' && text[i + 1] === '/') { state = 'line'; out.push(' ', ' '); i += 2; continue }
      if (ch === '/' && text[i + 1] === '*') { state = 'block'; out.push(' ', ' '); i += 2; continue }
      if (ch === '"' && text.startsWith('"""', i)) { state = 'textblock'; out.push(' ', ' ', ' '); i += 3; continue }
      if (ch === '"') { state = 'string'; out.push(' '); i += 1; continue }
      if (ch === "'") { state = 'char'; out.push(' '); i += 1; continue }
      out.push(ch)
      i += 1
      continue
    }

    if (state === 'line') {
      if (ch === '\n') { state = 'code'; out.push('\n') } else out.push(' ')
      i += 1
      continue
    }

    if (state === 'block') {
      if (ch === '*' && text[i + 1] === '/') { state = 'code'; out.push(' ', ' '); i += 2; continue }
      out.push(ch === '\n' ? '\n' : ' ')
      i += 1
      continue
    }

    if (state === 'textblock') {
      if (text.startsWith('"""', i)) { state = 'code'; out.push(' ', ' ', ' '); i += 3; continue }
      out.push(ch === '\n' ? '\n' : ' ')
      i += 1
      continue
    }

    if (state === 'string') {
      if (ch === '\\') { out.push(' ', ' '); i += 2; continue }
      if (ch === '"') { state = 'code'; out.push(' '); i += 1; continue }
      out.push(ch === '\n' ? '\n' : ' ')
      i += 1
      continue
    }

    // state === 'char'
    if (ch === '\\') { out.push(' ', ' '); i += 2; continue }
    if (ch === "'") { state = 'code'; out.push(' '); i += 1; continue }
    out.push(ch === '\n' ? '\n' : ' ')
    i += 1
  }

  return out.join('')
}

// 清理 Javadoc 文本：去掉起始标记、结束标记与每行前缀的星号。
function cleanDoc(raw) {
  return raw
    .replace(/^\s*\/\*\*?/, '')
    .replace(/\*\/\s*$/, '')
    .split('\n')
    .map((line) => line.replace(/^\s*\*?\s?/, '').replace(/\s+$/, ''))
    .join('\n')
    .trim()
}

/**
 * 提取 Javadoc，返回「声明所在行号 → 注释文本」。
 *
 * 跳过注解行与空行，把注释挂到其后的第一条声明上。
 */
export function extractJavadocs(text) {
  const lines = text.split('\n')
  const docs = new Map()
  let buffer = null

  for (let i = 0; i < lines.length; i += 1) {
    const trimmed = lines[i].trim()

    if (buffer === null) {
      if (!trimmed.startsWith('/**')) continue
      buffer = [lines[i]]
    } else {
      buffer.push(lines[i])
    }

    if (!trimmed.includes('*/')) continue

    const summary = cleanDoc(buffer.join('\n'))
    buffer = null

    for (let j = i + 1; j < lines.length; j += 1) {
      const next = lines[j].trim()
      if (!next || next.startsWith('@') || next.startsWith('//')) continue
      if (summary) docs.set(j + 1, summary)
      break
    }
  }

  return docs
}

const TYPE_RE = /^(?:(?:public|protected|private|static|final|abstract|sealed|non-sealed|strictfp)\s+)*(class|interface|enum|record|@interface)\s+([\w$]+)/
const MODIFIERS_RE = /^((?:(?:public|protected|private|static|final|abstract|synchronized|native|default|strictfp|transient|volatile|sealed|non-sealed)\s+)*)/
const METHOD_RE = /^([\w$][\w$.<>\[\],\s?]*?)\s+([\w$]+)\s*\(([^;{}]*)\)\s*(?:throws\s+[\w$.,\s]+)?[{;]?$/
const CTOR_RE = /^([\w$]+)\s*\(([^;{}]*)\)\s*(?:throws\s+[\w$.,\s]+)?[{;]?$/
const FIELD_RE = /^([\w$][\w$.<>\[\],\s?]*?)\s+([\w$]+)\s*(?:=.*)?;\s*$/
/** 跨行字段声明的第一行：`private static final Map<String, Item> MAP =`。 */
const FIELD_HEAD_RE = /^(.+?)\s+([\w$]+)\s*=\s*$/
const NOT_METHOD = new Set([
  'if', 'for', 'while', 'switch', 'catch', 'return', 'new', 'do', 'else',
  'synchronized', 'try', 'assert', 'throw', 'case',
])

/** 从修饰符前缀里拆出数组。 */
function splitModifiers(prefix) {
  return prefix.trim() ? prefix.trim().split(/\s+/) : []
}

/**
 * 去掉方法声明开头的泛型形参（`<T extends Block>`）。
 *
 * 形参里可能有嵌套泛型，按尖括号深度配对，不能简单用正则截断。
 * 只应作用于已剥离修饰符的声明文本，避免误伤真正的字段类型。
 */
function stripTypeParams(text) {
  const trimmed = text.trimStart()
  if (!trimmed.startsWith('<')) return text
  let depth = 0
  for (let i = 0; i < trimmed.length; i += 1) {
    if (trimmed[i] === '<') depth += 1
    else if (trimmed[i] === '>') {
      depth -= 1
      if (depth === 0) return trimmed.slice(i + 1).trimStart()
    }
  }
  return text
}

/**
 * 把注册用的字段类型归一成可读的注册表类别。
 *
 * 顺序有讲究：`<BlockEntity>` 也以 `Block` 开头，`<BlockItem>` 也含 `Item`，
 * 必须先匹配更具体的类型，否则会被宽泛规则抢先归类。
 */
function registryKindOf(fieldType) {
  if (!fieldType) return 'other'
  if (/DeferredRegister\s*<\s*Item/i.test(fieldType)) return 'items'
  if (/DeferredRegister\s*<.*Item/i.test(fieldType)) return 'items'
  if (/DeferredRegister\s*<\s*BlockEntity/i.test(fieldType)) return 'blockEntities'
  if (/DeferredRegister\s*<\s*Fluid/i.test(fieldType)) return 'fluids'
  if (/DeferredRegister\s*<\s*Block/i.test(fieldType)) return 'blocks'
  return 'other'
}

/**
 * 解析一个 Java 文件。
 *
 * 输出结构供 agent 检索：类 → 字段 / 方法 / 注册调用，每项带行号。
 * 只做语法层面的浅解析，不构建 AST；目标是「找得到」，不是「编译级准确」。
 */
export function parseJava(text) {
  const masked = maskSource(text)
  const maskedLines = masked.split('\n')
  const originalLines = text.split('\n')
  const docs = extractJavadocs(text)

  const classes = []
  const imports = []
  let packageName = ''

  /** 作用域栈：type / method / block。 */
  const stack = []
  let pendingAnnotations = []
  let pendingDecl = null
  /** 跨行字段声明：第一行以 `=` 结尾，等到分号再落库。 */
  let pendingField = null

  const currentType = () => {
    for (let i = stack.length - 1; i >= 0; i -= 1) {
      if (stack[i].kind === 'type') return stack[i].entry
    }
    return null
  }

  for (let i = 0; i < maskedLines.length; i += 1) {
    const lineNo = i + 1
    const maskedLine = maskedLines[i]
    const maskedTrimmed = maskedLine.trim()
    const originalTrimmed = originalLines[i].trim()

    /**
     * 处理本行的花括号，维护作用域栈。
     *
     * 必须每行都调用——包括 `continue` 掉的行，否则类声明那一行的 `{`
     * 不会被压栈，后续字段与方法都找不到归属类。
     */
    const trackBraces = () => {
      for (const ch of maskedLine) {
        if (ch === '{') {
          if (pendingDecl) {
            stack.push({ kind: pendingDecl.kind, entry: pendingDecl.entry })
            pendingDecl = null
          } else {
            stack.push({ kind: 'block' })
          }
        } else if (ch === '}') {
          const scope = stack.pop()
          if (scope && (scope.kind === 'method' || scope.kind === 'type')) {
            scope.entry.endLine = lineNo
          }
        }
      }
    }

    /**
     * 跨行字段的续行：从声明行一直收集到分号。
     *
     * 真实施工里常见写法：
     *
     * ```java
     * public static final DeferredRegister<Item> ITEMS =
     *         DeferredRegister.create(ForgeRegistries.ITEMS, MODID);
     * ```
     *
     * 单行 FIELD_RE 匹配不到第一行，必须在这里补齐，否则字段缺失会连带
     * 导致注册点无法按 `items` / `blocks` 归类。
     */
    if (pendingField) {
      const semi = maskedLine.indexOf(';')
      const part = semi >= 0 ? originalLines[i].slice(0, semi).trim() : originalTrimmed
      if (part) pendingField.initParts.push(part)
      if (semi >= 0) {
        pendingField.owner.fields.push({
          name: pendingField.name,
          type: pendingField.type,
          line: pendingField.line,
          modifiers: pendingField.modifiers,
          init: pendingField.initParts.join(' ').trim(),
          javadoc: pendingField.javadoc,
          annotations: pendingField.annotations,
        })
        pendingField = null
      }
      trackBraces()
      continue
    }

    if (!packageName) {
      const pkg = maskedTrimmed.match(/^package\s+([\w$.]+)\s*;/)
      if (pkg) packageName = pkg[1]
    }
    if (maskedTrimmed.startsWith('import ')) {
      const imp = maskedTrimmed.match(/^import\s+(?:static\s+)?([\w$.*]+)\s*;/)
      if (imp) imports.push(imp[1])
      trackBraces()
      continue
    }

    // 注解累积到下一个声明
    if (maskedTrimmed.startsWith('@')) {
      const ann = originalTrimmed.match(/^@([\w$.]+)/)
      if (ann) pendingAnnotations.push(ann[1])
      trackBraces()
      continue
    }

    if (!maskedTrimmed) { trackBraces(); continue }

    // ── 类型声明 ──
    const typeMatch = maskedTrimmed.match(TYPE_RE)
    if (typeMatch) {
      const [, kind, name] = typeMatch
      const modsMatch = maskedTrimmed.match(MODIFIERS_RE)
      const mods = splitModifiers(modsMatch ? modsMatch[1] : [])
      const rest = maskedTrimmed.slice(typeMatch.index + typeMatch[0].length)
      const ext = rest.match(/extends\s+([\w$.<>,\s]+?)(?:\s+implements|\s*\{|$)/)
      const impl = rest.match(/implements\s+([\w$.<>,\s]+?)(?:\s*\{|$)/)

      const entry = {
        name,
        kind: kind === '@interface' ? 'annotation' : kind,
        line: lineNo,
        endLine: lineNo,
        modifiers: mods,
        extends: ext ? ext[1].trim() : '',
        implements: impl ? impl[1].split(',').map((s) => s.trim()).filter(Boolean) : [],
        javadoc: docs.get(lineNo) ?? '',
        annotations: pendingAnnotations,
        fields: [],
        methods: [],
        registrations: [],
      }
      classes.push(entry)
      pendingDecl = { kind: 'type', entry }
      pendingAnnotations = []
      trackBraces()
      continue
    }

    const owner = currentType()

    // ── 方法 / 构造 ──
    if (owner) {
      const modsMatch = maskedTrimmed.match(MODIFIERS_RE)
      const modsPrefix = modsMatch ? modsMatch[1] : ''
      // 泛型方法形如 `private static <T extends Block> RegistryObject<T> ...`，
      // 先剥掉修饰符与形参，才能用同一套方法正则匹配
      const declText = stripTypeParams(maskedTrimmed.slice(modsPrefix.length))
      const ctorName = declText.match(CTOR_RE)
      const methodName = declText.match(METHOD_RE)
      const isCtor = ctorName && ctorName[1] === owner.name
      const name = isCtor ? ctorName[1] : (methodName ? methodName[2] : '')
      const paramsRaw = isCtor ? ctorName[2] : (methodName ? methodName[3] : '')

      if (name && !NOT_METHOD.has(name)) {
        const mods = splitModifiers(modsPrefix)
        // 返回类型要去掉修饰符前缀，否则会得到「public void」
        const rawReturn = isCtor ? '' : (methodName ? methodName[1].trim() : '')
        const returnType = mods.length
          ? rawReturn.replace(new RegExp(`^(?:${mods.join('\\s+')})\\s+`), '')
          : rawReturn
        const params = paramsRaw
          ? paramsRaw.split(',').map((s) => s.trim()).filter(Boolean)
          : []

        const entry = {
          name,
          kind: isCtor ? 'constructor' : 'method',
          line: lineNo,
          endLine: lineNo,
          modifiers: mods,
          returns: returnType,
          params,
          signature: `${name}(${params.join(', ')})`,
          javadoc: docs.get(lineNo) ?? '',
          annotations: pendingAnnotations,
        }
        owner.methods.push(entry)
        pendingDecl = { kind: 'method', entry }
        pendingAnnotations = []
        // 无方法体的声明（抽象方法、接口方法）不需要等待花括号
        if (maskedTrimmed.endsWith(';')) pendingDecl = null
        trackBraces()
        continue
      }

      // ── 字段 ──
      // 只有类体顶层才是字段；方法体里的局部变量与 `return x;` 不能算字段。
      // 字段的初始化表达式里可能带括号调用，所以只检查 `=` 之前有没有
      // 括号；有则是方法声明，不是字段。
      const scope = stack[stack.length - 1]
      const inTypeBody = scope?.kind === 'type'
      const fieldMatch = inTypeBody ? maskedTrimmed.match(FIELD_RE) : null
      const beforeAssign = maskedTrimmed.split('=')[0]
      if (fieldMatch && !beforeAssign.includes('(')) {
        const modsMatch = maskedTrimmed.match(MODIFIERS_RE)
        const mods = splitModifiers(modsMatch ? modsMatch[1] : '')
        const initMatch = originalTrimmed.match(/=\s*(.+?);\s*$/)
        // 字段类型同样要去掉修饰符前缀
        const rawType = fieldMatch[1].trim()
        const fieldType = mods.length
          ? rawType.replace(new RegExp(`^(?:${mods.join('\\s+')})\\s+`), '')
          : rawType
        owner.fields.push({
          name: fieldMatch[2],
          type: fieldType,
          line: lineNo,
          modifiers: mods,
          init: initMatch ? initMatch[1].trim() : '',
          javadoc: docs.get(lineNo) ?? '',
          annotations: pendingAnnotations,
        })
        pendingAnnotations = []
      }

      // 跨行字段：本行只有「类型 名称 =」，初始化表达式在后续行。
      // 同样只在类体顶层识别，避免把方法体里的局部赋值当成字段。
      if (inTypeBody && !fieldMatch && !beforeAssign.includes('(')) {
        const headMatch = maskedTrimmed.match(FIELD_HEAD_RE)
        if (headMatch) {
          const modsMatch = maskedTrimmed.match(MODIFIERS_RE)
          const mods = splitModifiers(modsMatch ? modsMatch[1] : '')
          const rawType = headMatch[1].trim()
          const fieldType = mods.length
            ? rawType.replace(new RegExp(`^(?:${mods.join('\\s+')})\\s+`), '')
            : rawType
          const eq = maskedLine.indexOf('=')
          const firstPart = eq >= 0 ? originalLines[i].slice(eq + 1).trim() : ''
          pendingField = {
            owner,
            name: headMatch[2],
            type: fieldType,
            line: lineNo,
            modifiers: mods,
            javadoc: docs.get(lineNo) ?? '',
            annotations: pendingAnnotations,
            initParts: firstPart ? [firstPart] : [],
          }
          pendingAnnotations = []
        }
      }
    }

    trackBraces()
  }

  // ── 注册调用：<字段>.register("id", ...) ──
  // 必须扫原文而非掩码——id 本身是字符串字面量，掩码后就成了空格。
  // 为避开注释里的干扰，只在掩码对应位置可见时才算数。
  const found = []
  for (let i = 0; i < maskedLines.length; i += 1) {
    const maskedLine = maskedLines[i]
    // 掩码行里该位置的 register 必须仍然可见，说明不在注释里
    if (!/\.\s*register\s*\(/.test(maskedLine)) {
      // 掩码把字符串掏空了，退一步用「掩码有 register、原文有 id」的双重判断
      if (!/register/.test(maskedLine)) continue
    }
    for (const match of originalLines[i].matchAll(/([\w$]+)\s*\.\s*register\s*\(\s*"([a-z0-9_./-]+)"/g)) {
      // 该行若整行是注释（掩码行全为空格），跳过
      if (!maskedLine.trim()) continue
      found.push({ registry: match[1], id: match[2], line: i + 1 })
    }
  }

  // 把注册调用挂到所属类上，并补出注册表类别
  const topLevel = []
  for (const reg of found) {
    const owner = classes.find((entry) => reg.line >= entry.line && reg.line <= entry.endLine)
    const field = owner?.fields.find((f) => f.name === reg.registry)
    const kind = registryKindOf(field?.type)
    const enriched = { ...reg, kind, field: reg.registry }
    if (owner) owner.registrations.push(enriched)
    else topLevel.push(enriched)
  }

  return {
    package: packageName,
    imports,
    classes,
    registrations: [
      ...classes.flatMap((entry) => entry.registrations),
      ...topLevel,
    ],
  }
}

/** 计算文本的短哈希。 */
function hashText(text) {
  return createHash('sha1').update(text).digest('hex').slice(0, 16)
}

/** 递归列出 Java 源文件（相对路径，正斜杠）。 */
async function listJavaFiles(root) {
  const out = []
  async function walk(dir, prefix, depth) {
    if (depth > 24 || out.length >= MAX_FILES) return
    const entries = await fsp.readdir(dir, { withFileTypes: true }).catch(() => [])
    for (const entry of entries) {
      if (out.length >= MAX_FILES) return
      const rel = prefix ? `${prefix}/${entry.name}` : entry.name
      const full = join(dir, entry.name)
      if (entry.isDirectory()) {
        if (entry.name === 'build' || entry.name === '.gradle' || entry.name === 'out') continue
        await walk(full, rel, depth + 1)
      } else if (entry.isFile() && entry.name.endsWith('.java')) {
        out.push(rel)
      }
    }
  }
  if (await isDirectory(root)) await walk(root, '', 0)
  return out.sort()
}

/** 扫描全部 Java 文件，返回文件条目列表。 */
async function scanFiles(projectPath) {
  const root = javaRoot(projectPath)
  const rels = await listJavaFiles(root)
  const files = []

  for (const rel of rels) {
    const full = join(root, rel)
    const stat = await fsp.stat(full).catch(() => null)
    if (!stat || stat.size > MAX_FILE_BYTES) continue
    const text = await fsp.readFile(full, 'utf8').catch(() => null)
    if (text === null) continue

    const parsed = parseJava(text)
    files.push({
      path: `src/main/java/${rel}`,
      hash: hashText(text),
      bytes: stat.size,
      lines: text.split('\n').length,
      package: parsed.package,
      imports: parsed.imports,
      classes: parsed.classes,
      registrations: parsed.registrations,
      /** agent 写的语义注解；hash 与当前不符即视为失效 */
      annotation: null,
    })
  }

  return files
}

/**
 * 生成或增量刷新结构文档。
 *
 * 增量规则：以文件哈希为准。
 *   - 哈希未变 → 整条复用，保留已有 `annotation`；
 *   - 哈希改变 → 重新扫描，旧 `annotation` 搬过来但标记 `stale`；
 *   - 新增文件 → 全量扫描；
 *   - 删除文件 → 从文档移除。
 */
export async function refreshStructure(projectPath, options = {}) {
  const meta = await readProjectMeta(projectPath)
  if (!meta) throw new Error('该目录不是「模组工坊」项目')

  const previousRaw = await readJson(structureFile(projectPath), null)
  // 解析器升级后，即使文件哈希未变也必须重扫；但旧注解要保留，不能静默丢弃
  const parserChanged = Boolean(previousRaw && previousRaw.parserVersion !== PARSER_VERSION)
  const fullRescan = Boolean(options.force) || parserChanged
  const previousFiles = new Map(
    (Array.isArray(previousRaw?.files) ? previousRaw.files : []).map((file) => [file.path, file]),
  )

  const scanned = await scanFiles(projectPath)
  const files = []
  let reused = 0
  let rescanned = 0

  for (const file of scanned) {
    const old = previousFiles.get(file.path)
    if (old && old.hash === file.hash && !fullRescan) {
      // 完全未变：沿用旧条目（含注解）
      files.push(old)
      reused += 1
      continue
    }
    rescanned += 1
    if (old?.annotation) {
      // 文件变了，旧注解保留但标记失效，等 agent 重新确认
      file.annotation = { ...old.annotation, stale: true }
    }
    files.push(file)
  }

  const removed = [...previousFiles.keys()].filter((path) => !scanned.some((f) => f.path === path))

  const structure = buildDocument(files, {
    modid: meta.modid,
    reused,
    rescanned,
    removed,
    fileCount: scanned.length,
  })

  await writeJson(structureFile(projectPath), structure)
  return structure
}

/** 汇总出索引与统计。 */
function buildDocument(files, context) {
  const registrations = {}
  const packages = new Map()
  let classCount = 0
  let methodCount = 0

  for (const file of files) {
    classCount += file.classes.length
    for (const cls of file.classes) methodCount += cls.methods.length

    const pkg = file.package || '(默认包)'
    if (!packages.has(pkg)) packages.set(pkg, [])
    packages.get(pkg).push(file.path)

    for (const cls of file.classes) {
      for (const reg of cls.registrations) {
        if (!registrations[reg.kind]) registrations[reg.kind] = []
        registrations[reg.kind].push({
          id: reg.id,
          file: file.path,
          line: reg.line,
          class: cls.name,
          field: reg.field,
        })
      }
    }
  }

  for (const list of Object.values(registrations)) list.sort((a, b) => a.id.localeCompare(b.id))

  const annotated = files.filter((file) => file.annotation && !file.annotation.stale).length
  const stale = files.filter((file) => file.annotation?.stale).length

  return {
    schemaVersion: 1,
    parserVersion: PARSER_VERSION,
    generatedAt: new Date().toISOString(),
    modid: context.modid || '',
    /** scan = 只有确定性结构；annotated = 含 agent 注解 */
    mode: annotated > 0 ? 'annotated' : 'scan',
    source: 'src/main/java',
    totals: {
      files: files.length,
      classes: classCount,
      methods: methodCount,
      annotated,
      stale,
    },
    incremental: {
      reused: context.reused ?? 0,
      rescanned: context.rescanned ?? 0,
      removed: context.removed ?? [],
    },
    index: {
      registrations,
      packages: Object.fromEntries([...packages.entries()].sort((a, b) => a[0].localeCompare(b[0]))),
    },
    files,
  }
}

/** 读取结构文档，缺失时返回 null。 */
export async function readStructure(projectPath) {
  return readJson(structureFile(projectPath), null)
}

/**
 * 写入 agent 的语义注解。
 *
 * `members` 的键形如 `类名` 或 `类名#方法名`，值是功能描述。
 * 只更新指定文件，其它文件不动，避免 agent 一次改写整篇。
 */
export async function setAnnotation(projectPath, input) {
  // 参数名用 `file` 而非 `path`：api 层已把 `path` 用作项目路径
  const filePath = String(input.file ?? input.filePath ?? '')
  const structure = await readStructure(projectPath)
  if (!structure) throw new Error('结构文档不存在，请先生成')

  const file = structure.files.find((entry) => entry.path === filePath)
  if (!file) throw new Error(`结构文档里没有该文件：${filePath}`)

  const summary = typeof input.summary === 'string' ? input.summary.trim() : ''
  const membersIn = input.members && typeof input.members === 'object' ? input.members : {}

  const members = {}
  for (const [key, value] of Object.entries(membersIn)) {
    if (typeof value === 'string' && value.trim()) members[key] = value.trim()
  }

  file.annotation = {
    hash: file.hash,
    summary,
    members,
    stale: false,
    annotatedAt: new Date().toISOString(),
  }

  const annotated = structure.files.filter((entry) => entry.annotation && !entry.annotation.stale).length
  const stale = structure.files.filter((entry) => entry.annotation?.stale).length
  structure.mode = annotated > 0 ? 'annotated' : 'scan'
  structure.totals.annotated = annotated
  structure.totals.stale = stale

  await writeJson(structureFile(projectPath), structure)
  return { file: file.path, annotation: file.annotation, totals: structure.totals }
}

/**
 * 按 id 查注册位置。
 *
 * 供 agent 快速回答「某个物品/方块的注册代码在哪」。
 */
export function findRegistration(structure, id) {
  const hits = []
  for (const [kind, list] of Object.entries(structure?.index?.registrations ?? {})) {
    for (const reg of list) {
      if (reg.id === id || reg.id.startsWith(`${id}_`)) hits.push({ kind, ...reg })
    }
  }
  return hits
}

/**
 * 精简视图：只回位置与签名，不回方法体。
 *
 * 供 agent 首轮浏览，避免一次读入全部字段。
 */
export function compactStructure(structure) {
  if (!structure) return null
  return {
    schemaVersion: structure.schemaVersion,
    mode: structure.mode,
    totals: structure.totals,
    index: structure.index,
    files: structure.files.map((file) => ({
      path: file.path,
      package: file.package,
      lines: file.lines,
      stale: Boolean(file.annotation?.stale),
      summary: file.annotation?.summary ?? '',
      classes: file.classes.map((cls) => ({
        name: cls.name,
        kind: cls.kind,
        line: cls.line,
        endLine: cls.endLine,
        summary: file.annotation?.members?.[cls.name] ?? '',
        methods: cls.methods.map((method) => ({
          name: method.name,
          line: method.line,
          endLine: method.endLine,
          signature: method.signature,
          summary: file.annotation?.members?.[`${cls.name}#${method.name}`] ?? '',
        })),
      })),
    })),
  }
}

/** 校验注解里的成员键是否真实存在。 */
export function validateAnnotationKeys(file, members) {
  const known = new Set()
  for (const cls of file.classes) {
    known.add(cls.name)
    for (const method of cls.methods) known.add(`${cls.name}#${method.name}`)
  }
  const unknown = Object.keys(members).filter((key) => !known.has(key))
  return { known: [...known], unknown }
}
