/**
 * 测试基础设施。
 *
 * 目标：让每个用例在独立临时目录里跑，不碰真实注册表，也不依赖 DSH 运行时。
 * 用法见同目录下 0x-*.mjs。
 */

import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { deflateSync } from 'node:zlib'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
export const PLUGIN_ROOT = join(here, '..')

/** 断言失败时抛出，带可读信息。 */
export function must(condition, message) {
  if (!condition) throw new Error(`断言失败：${message}`)
}

/** 断言两个值相等。 */
export function equal(actual, expected, message) {
  if (actual !== expected) {
    throw new Error(`断言失败：${message}\n  期望：${JSON.stringify(expected)}\n  实际：${JSON.stringify(actual)}`)
  }
}

/** 断言抛错且信息包含片段。 */
export async function rejects(fn, snippet, message) {
  try {
    await fn()
  } catch (error) {
    const text = String(error?.message ?? error)
    if (snippet && !text.includes(snippet)) {
      throw new Error(`断言失败：${message}\n  期望包含：${snippet}\n  实际错误：${text}`)
    }
    return text
  }
  throw new Error(`断言失败：${message}\n  期望抛错，但没有抛`)
}

/**
 * 建立一个隔离的测试工作区。
 *
 * - `home` 作为 DSH_HOME，注册表写在里面，测试结束整个删掉；
 * - `root` 作为项目根目录，模拟用户放工程的位置。
 */
export async function createWorkspace() {
  const base = await mkdtemp(join(tmpdir(), 'mcstudio-test-'))
  const home = join(base, 'home')
  const root = join(base, 'projects')
  await mkdir(home, { recursive: true })
  await mkdir(root, { recursive: true })

  process.env.DSH_HOME = home

  const { dispatch, setPluginRoot } = await import('../lib/api.js')
  setPluginRoot(PLUGIN_ROOT)

  return {
    base,
    home,
    root,
    /** 调用接口动作。 */
    call: (action, payload) => dispatch(action, payload),
    /** 生成工作区内的路径。 */
    path: (...segments) => join(root, ...segments),
    /** 写文件（自动建父目录）。 */
    async write(file, content = '') {
      await mkdir(dirname(file), { recursive: true })
      await writeFile(file, content)
    },
    async cleanup() {
      await rm(base, { recursive: true, force: true })
    },
  }
}

/* ── 素材构造 ────────────────────────────────────────────── */

const CRC_TABLE = (() => {
  const table = new Uint32Array(256)
  for (let i = 0; i < 256; i += 1) {
    let c = i
    for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
    table[i] = c >>> 0
  }
  return table
})()

function crc32(buffer) {
  let crc = 0xffffffff
  for (const byte of buffer) crc = CRC_TABLE[(crc ^ byte) & 0xff] ^ (crc >>> 8)
  return (crc ^ 0xffffffff) >>> 0
}

function chunk(type, data) {
  const length = Buffer.alloc(4)
  length.writeUInt32BE(data.length, 0)
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data])
  const crc = Buffer.alloc(4)
  crc.writeUInt32BE(crc32(body), 0)
  return Buffer.concat([length, body, crc])
}

/** 生成一张纯色 PNG，返回 base64（不含 data: 前缀）。 */
export function makePngBase64(width = 16, height = 16) {
  const signature = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])

  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(width, 0)
  ihdr.writeUInt32BE(height, 4)
  ihdr[8] = 8   // bit depth
  ihdr[9] = 6   // color type: RGBA
  ihdr[10] = 0  // compression
  ihdr[11] = 0  // filter
  ihdr[12] = 0  // interlace

  // 每行：1 字节 filter(0) + width*4 字节像素
  const raw = Buffer.alloc(height * (1 + width * 4))
  for (let y = 0; y < height; y += 1) {
    const offset = y * (1 + width * 4)
    raw[offset] = 0
    for (let x = 0; x < width; x += 1) {
      const p = offset + 1 + x * 4
      raw[p] = 200; raw[p + 1] = 60; raw[p + 2] = 60; raw[p + 3] = 255
    }
  }

  const png = Buffer.concat([
    signature,
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw)),
    chunk('IEND', Buffer.alloc(0)),
  ])
  return png.toString('base64')
}

/* ── 工程构造 ────────────────────────────────────────────── */

/**
 * 在指定目录写一个 NeoForge 1.20.1 工程骨架。
 * 传入选项可覆盖 gradle.properties / mods.toml / 资源。
 */
export async function writeNeoForgeProject(workspace, dir, options = {}) {
  const {
    modid = 'testmod',
    name = '测试模组',
    version = '1.0.0',
    gradleExtra = '',
    toml = null,
    items = ['ruby'],
    blocks = ['ruby_block'],
  } = options

  await workspace.write(join(dir, 'gradle.properties'), [
    `mod_id=${modid}`,
    `mod_name=${name}`,
    `mod_version=${version}`,
    `mod_group_id=com.example.${modid}`,
    'mod_authors=Tester',
    'mod_license=MIT',
    'minecraft_version=1.20.1',
    'neo_version=47.1.79',
    gradleExtra,
  ].filter(Boolean).join('\n'))

  await workspace.write(join(dir, 'build.gradle'), "plugins { id 'net.neoforged.gradle.userdev' }")

  await workspace.write(
    join(dir, 'src/main/resources/META-INF/mods.toml'),
    toml ?? [
      'modLoader="javafml"',
      'loaderVersion="[47,)"',
      '[[mods]]',
      `modId="${modid}"`,
      `displayName="${name}"`,
      `version="${version}"`,
    ].join('\n'),
  )

  for (const id of items) {
    await workspace.write(join(dir, `src/main/resources/assets/${modid}/textures/item/${id}.png`), 'png')
    await workspace.write(join(dir, `src/main/resources/assets/${modid}/models/item/${id}.json`), '{"parent":"item/generated"}')
  }
  for (const id of blocks) {
    await workspace.write(join(dir, `src/main/resources/assets/${modid}/textures/block/${id}.png`), 'png')
    await workspace.write(join(dir, `src/main/resources/assets/${modid}/models/block/${id}.json`), '{"parent":"block/cube_all"}')
    await workspace.write(join(dir, `src/main/resources/assets/${modid}/blockstates/${id}.json`), '{}')
  }

  return dir
}

/** 在指定目录写一个 Fabric 1.20.1 工程骨架。 */
export async function writeFabricProject(workspace, dir, options = {}) {
  const { modid = 'fabmod', name = 'Fabric 模组', version = '2.0.0', modJson = null } = options

  await workspace.write(join(dir, 'gradle.properties'), [
    `mod_version=${version}`,
    `maven_group=com.example.${modid}`,
    `archives_base_name=${modid}`,
    'minecraft_version=1.20.1',
    'loader_version=0.15.11',
    'yarn_mappings=1.20.1+build.10',
  ].join('\n'))

  await workspace.write(join(dir, 'build.gradle'), 'plugins { id "fabric-loom" }')
  await workspace.write(
    join(dir, 'src/main/resources/fabric.mod.json'),
    JSON.stringify(modJson ?? { schemaVersion: 1, id: modid, version, name, environment: '*' }),
  )
  await workspace.write(join(dir, `src/main/resources/assets/${modid}/textures/item/gem.png`), 'png')

  return dir
}

/* ── 运行器 ──────────────────────────────────────────────── */

/**
 * 依次执行用例，输出结果并返回退出码。
 * 每个用例是 `{ name, run }`，`run` 接收 workspace。
 */
export async function runSuite(suiteName, cases) {
  let passed = 0
  let failed = 0
  const failures = []

  console.log(`\n${suiteName}`)
  console.log('─'.repeat(60))

  for (const testCase of cases) {
    const workspace = await createWorkspace()
    const started = Date.now()
    try {
      await testCase.run(workspace)
      passed += 1
      const cost = Date.now() - started
      console.log(`  ✓ ${testCase.name}${cost > 200 ? ` (${cost}ms)` : ''}`)
    } catch (error) {
      failed += 1
      failures.push({ name: testCase.name, error })
      console.log(`  ✗ ${testCase.name}`)
      console.log(`      ${String(error?.message ?? error).split('\n').join('\n      ')}`)
    } finally {
      await workspace.cleanup().catch(() => {})
    }
  }

  console.log('─'.repeat(60))
  console.log(`  通过 ${passed}，失败 ${failed}`)

  if (failed > 0) {
    console.log('\n失败详情：')
    for (const item of failures) {
      console.log(`\n[${item.name}]`)
      console.log(String(item.error?.stack ?? item.error))
    }
  }

  return failed === 0 ? 0 : 1
}
