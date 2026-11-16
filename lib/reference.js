/**
 * 原版参考（v0.5.1 P4）：从项目构建依赖的 mapped jar 读取反编译源码。
 *
 * 只读；不复制源码到项目。来源：
 *   1. 项目 Gradle 缓存中的 mapped jar（CFR 反编译后缓存）；
 *   2. 无缓存时用 javap -p 返回签名兜底。
 *
 * 注意：不索引教程模组；只使用项目自身依赖。
 */

import { promises as fsp } from 'node:fs'
import { spawn } from 'node:child_process'
import { createHash } from 'node:crypto'
import { dirname, join, resolve } from 'node:path'

import { dataDir, readJson } from './registry.js'
import { readProjectMeta } from './meta.js'

const CFR_VERSION = '0.152'
const CFR_URL = `https://repo1.maven.org/maven2/org/benf/cfr/${CFR_VERSION}/cfr-${CFR_VERSION}.jar`
const CLASS_RE = /^[a-zA-Z0-9_.$]+$/

function sha1(text) {
  return createHash('sha1').update(String(text)).digest('hex')
}

/** 项目级参考缓存目录（$DSH_HOME/mcmods-studio/cache/reference/<hash>）。 */
export function referenceCacheDir(projectPath) {
  return join(dataDir(), 'cache', 'reference', sha1(resolve(projectPath)).slice(0, 12))
}

function toolsDir() {
  return join(dataDir(), 'tools')
}

function cfrJarPath() {
  return join(toolsDir(), `cfr-${CFR_VERSION}.jar`)
}

/** 查找 JDK bin（JAVA_HOME 或常见安装目录），用于 javap。 */
async function findJdkBin() {
  if (process.env.JAVA_HOME) {
    const bin = join(process.env.JAVA_HOME, 'bin')
    const exe = process.platform === 'win32' ? 'javap.exe' : 'javap'
    if (await fsp.stat(join(bin, exe)).then((stat) => stat.isFile()).catch(() => false)) return bin
  }
  if (process.platform === 'win32') {
    for (const root of ['C:/Program Files/Java', 'C:/Program Files/Eclipse Adoptium', 'C:/Program Files/Microsoft']) {
      const entries = await fsp.readdir(root, { withFileTypes: true }).catch(() => [])
      for (const entry of entries) {
        if (!entry.isDirectory() || !/jdk|jre/i.test(entry.name)) continue
        const bin = join(root, entry.name, 'bin')
        if (await fsp.stat(join(bin, 'javap.exe')).then((stat) => stat.isFile()).catch(() => false)) return bin
      }
    }
  }
  return null
}

async function javaCommand() {
  const bin = await findJdkBin()
  const exe = (name) => (process.platform === 'win32' ? `${name}.exe` : name)
  if (bin) {
    return { java: join(bin, exe('java')), javap: join(bin, exe('javap')) }
  }
  return { java: 'java', javap: 'javap' }
}

function run(command, args, timeoutMs = 600000) {
  return new Promise((resolveRun, reject) => {
    const child = spawn(command, args, { shell: false, windowsHide: true })
    let out = ''
    let err = ''
    const timer = setTimeout(() => { child.kill(); reject(new Error('命令超时')) }, timeoutMs)
    child.stdout.on('data', (chunk) => { out += chunk })
    child.stderr.on('data', (chunk) => { err += chunk })
    child.on('error', (error) => { clearTimeout(timer); reject(error) })
    child.on('close', (code) => {
      clearTimeout(timer)
      if (code === 0) resolveRun(out)
      else reject(new Error((err || out).split(/\r?\n/).slice(0, 10).join('\n')))
    })
  })
}

async function readProperties(projectPath) {
  const text = await fsp.readFile(join(projectPath, 'gradle.properties'), 'utf8').catch(() => '')
  const map = {}
  for (const line of text.split(/\r?\n/)) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#')) continue
    const index = trimmed.indexOf('=')
    if (index > 0) map[trimmed.slice(0, index).trim()] = trimmed.slice(index + 1).trim()
  }
  return map
}

/** 在 Gradle 缓存中查找项目对应的 mapped jar。 */
export async function findMappedJar(projectPath) {
  const props = await readProperties(projectPath)
  const mc = props.minecraft_version
  const forge = props.forge_version
  if (!mc || !forge) return null
  const channel = props.mapping_channel ?? 'official'
  const mapping = props.mapping_version ?? mc
  const home = process.env.USERPROFILE || process.env.HOME || ''
  const base = join(home, '.gradle', 'caches', 'forge_gradle', 'minecraft_user_repo', 'net', 'minecraftforge', 'forge')
  const dirs = await fsp.readdir(base, { withFileTypes: true }).catch(() => [])
  const exact = `${mc}-${forge}_mapped_${channel}_${mapping}`
  const pick = async (dirName) => {
    const files = await fsp.readdir(join(base, dirName)).catch(() => [])
    const jar = files.find((name) => name.endsWith('.jar') && name.includes('mapped') && !name.includes('sources'))
    return jar ? join(base, dirName, jar) : null
  }
  if (dirs.some((entry) => entry.isDirectory() && entry.name === exact)) {
    const jar = await pick(exact)
    if (jar) return jar
  }
  for (const entry of dirs) {
    if (!entry.isDirectory()) continue
    if (!entry.name.startsWith(`${mc}-${forge}`)) continue
    if (!entry.name.includes('mapped')) continue
    const jar = await pick(entry.name)
    if (jar) return jar
  }
  return null
}

/** javap 签名兜底。 */
async function javapSignature(projectPath, className) {
  const jar = await findMappedJar(projectPath)
  if (!jar) return null
  const { javap } = await javaCommand()
  try {
    const output = await run(javap, ['-p', '-cp', jar, className], 60000)
    return output.trim()
  } catch {
    return null
  }
}

/** 读取反编译源码（缓存存在）或签名兜底。 */
export async function getReference(projectPath, className) {
  const name = String(className ?? '').trim()
  if (!CLASS_RE.test(name)) throw new Error('类名不合法（应形如 net.minecraft.world.item.Item）')
  const cache = referenceCacheDir(projectPath)
  const sourcePath = join(cache, `${name.replace(/\./g, '/')}.java`)
  const content = await fsp.readFile(sourcePath, 'utf8').catch(() => null)
  if (content !== null) {
    const lines = content.split(/\r?\n/)
    return {
      className: name,
      source: 'decompiled',
      file: sourcePath,
      lineCount: lines.length,
      content: lines.slice(0, 400).join('\n'),
      truncated: lines.length > 400,
    }
  }
  const signature = await javapSignature(projectPath, name)
  if (signature) {
    return { className: name, source: 'javap', signature, content: signature }
  }
  return { className: name, source: 'unavailable', message: '未找到反编译缓存或 mapped jar' }
}

/** 在反编译缓存中搜索类名/内容。 */
export async function searchReference(projectPath, query) {
  const keyword = String(query ?? '').trim().toLowerCase()
  if (!keyword) throw new Error('搜索关键词为空')
  const cache = referenceCacheDir(projectPath)
  const results = []
  async function walk(dir, rel = '') {
    const entries = await fsp.readdir(dir, { withFileTypes: true }).catch(() => [])
    for (const entry of entries) {
      if (results.length >= 30) return
      const childRel = rel ? `${rel}/${entry.name}` : entry.name
      if (entry.isDirectory()) { await walk(join(dir, entry.name), childRel); continue }
      if (!entry.name.endsWith('.java')) continue
      if (entry.name.toLowerCase().includes(keyword)) {
        results.push({ className: childRel.replace(/\.java$/, '').replace(/\//g, '.'), file: join(dir, entry.name) })
        continue
      }
      if (results.length < 10) {
        const text = await fsp.readFile(join(dir, entry.name), 'utf8').catch(() => '')
        if (text.toLowerCase().includes(keyword)) {
          results.push({ className: childRel.replace(/\.java$/, '').replace(/\//g, '.'), file: join(dir, entry.name) })
        }
      }
    }
  }
  await walk(cache)
  return { query: keyword, cacheDir: cache, results }
}

/** 确保 CFR 可用（首次下载到插件工具目录）。 */
export async function ensureCfr() {
  const target = cfrJarPath()
  const exists = await fsp.stat(target).then((stat) => stat.isFile() && stat.size > 1000).catch(() => false)
  if (exists) return { jar: target, downloaded: false }
  await fsp.mkdir(toolsDir(), { recursive: true })
  const response = await fetch(CFR_URL, { redirect: 'follow' })
  if (!response.ok) throw new Error(`CFR 下载失败：HTTP ${response.status}`)
  const buffer = Buffer.from(await response.arrayBuffer())
  await fsp.writeFile(target, buffer)
  return { jar: target, downloaded: true, bytes: buffer.length, sha256: createHash('sha256').update(buffer).digest('hex') }
}

/** 反编译项目 mapped jar 到缓存目录（CFR）。 */
export async function decompileProject(projectPath) {
  const { jar } = await ensureCfr()
  const mapped = await findMappedJar(projectPath)
  if (!mapped) throw new Error('未找到项目依赖的 mapped jar（请先执行一次 gradle 构建）')
  const cache = referenceCacheDir(projectPath)
  await fsp.mkdir(cache, { recursive: true })
  const { java } = await javaCommand()
  await run(java, ['-jar', jar, mapped, '--outputdir', cache, '--silent', 'true'], 900000)
  return { mapped, cacheDir: cache }
}
