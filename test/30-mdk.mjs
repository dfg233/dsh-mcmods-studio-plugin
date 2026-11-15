/**
 * 用例 30：MDK 模式（识别、安全解压、受控替换、校验、下载 URL）。
 */

import { promises as fsp } from 'node:fs'
import { dirname, join } from 'node:path'

import { equal, must, runSuite } from './helpers.mjs'
import { mdkUrl } from '../lib/mdk.js'

async function writeFile(root, rel, content) {
  const file = join(root, rel)
  await fsp.mkdir(dirname(file), { recursive: true })
  await fsp.writeFile(file, content, 'utf8')
}

function makeMdkEntries({ minecraft = '1.20.1', loader = '47.4.16', modid = 'examplemod' } = {}) {
  return {
    'gradle.properties': [
      'org.gradle.jvmargs=-Xmx3G',
      `minecraft_version=${minecraft}`,
      `forge_version=${loader}`,
      'mapping_channel=official',
      'mapping_version=1.20.1',
      `mod_id=${modid}`,
      'mod_name=Example Mod',
      'mod_license=All Rights Reserved',
      'mod_version=0.0.1',
      'mod_group_id=com.example.examplemod',
    ].join('\n') + '\n',
    'build.gradle': "plugins { id 'net.minecraftforge.gradle' version '[6.0,6.2)' }\n",
    'settings.gradle': "rootProject.name = 'examplemod'\n",
    'gradlew.bat': '@echo off\n',
    'src/main/resources/META-INF/mods.toml': [
      'modLoader="javafml"',
      '[[mods]]',
      'modId="${mod_id}"',
      'displayName="${mod_name}"',
      'version="${mod_version}"',
      'license="${mod_license}"',
    ].join('\n') + '\n',
    'src/main/java/com/example/examplemod/ExamplemodMod.java': [
      'package com.example.examplemod;',
      '',
      'import net.minecraftforge.fml.common.Mod;',
      '',
      '@Mod(ExamplemodMod.MODID)',
      'public class ExamplemodMod {',
      '    public static final String MODID = "examplemod";',
      '    public ExamplemodMod() {}',
      '}',
    ].join('\n') + '\n',
    'src/main/java/com/example/examplemod/Config.java': [
      'package com.example.examplemod;',
      '',
      'public class Config {',
      '    public Config() { ExamplemodMod.LOGGER.info("config"); }',
      '}',
    ].join('\n') + '\n',
    'src/main/java/com/example/examplemod/client/ClientSetup.java': [
      'package com.example.examplemod.client;',
      '',
      'public class ClientSetup {',
      '    public static final String MODID = "examplemod";',
      '}',
    ].join('\n') + '\n',
    'src/main/resources/assets/examplemod/lang/en_us.json': '{"item.examplemod.ruby": "Ruby"}\n',
  }
}

async function makeMdkDir(root, options) {
  const entries = makeMdkEntries(options)
  for (const [rel, content] of Object.entries(entries)) await writeFile(root, rel, content)
  return root
}

/** 最小 store 模式 zip（不压缩，CRC 写 0；本插件的解析不校验 CRC）。 */
function makeStoreZip(entries) {
  const locals = []
  const centrals = []
  let offset = 0
  let count = 0
  for (const [name, content] of Object.entries(entries)) {
    const data = Buffer.from(content, 'utf8')
    const nameBuf = Buffer.from(name, 'utf8')
    const local = Buffer.alloc(30)
    local.writeUInt32LE(0x04034b50, 0)
    local.writeUInt16LE(20, 4)
    local.writeUInt16LE(0x0800, 6)
    local.writeUInt16LE(0, 8)
    local.writeUInt32LE(0, 14)
    local.writeUInt32LE(data.length, 18)
    local.writeUInt32LE(data.length, 22)
    local.writeUInt16LE(nameBuf.length, 26)
    local.writeUInt16LE(0, 28)
    locals.push(local, nameBuf, data)

    const central = Buffer.alloc(46)
    central.writeUInt32LE(0x02014b50, 0)
    central.writeUInt16LE(20, 4)
    central.writeUInt16LE(20, 6)
    central.writeUInt16LE(0x0800, 8)
    central.writeUInt16LE(0, 10)
    central.writeUInt32LE(0, 16)
    central.writeUInt32LE(data.length, 20)
    central.writeUInt32LE(data.length, 24)
    central.writeUInt16LE(nameBuf.length, 28)
    central.writeUInt16LE(0, 30)
    central.writeUInt16LE(0, 32)
    central.writeUInt32LE(0, 38)
    central.writeUInt32LE(offset, 42)
    centrals.push(central, nameBuf)
    offset += 30 + nameBuf.length + data.length
    count += 1
  }
  const cd = Buffer.concat(centrals)
  const eocd = Buffer.alloc(22)
  eocd.writeUInt32LE(0x06054b50, 0)
  eocd.writeUInt16LE(count, 8)
  eocd.writeUInt16LE(count, 10)
  eocd.writeUInt32LE(cd.length, 12)
  eocd.writeUInt32LE(offset, 16)
  return Buffer.concat([...locals, cd, eocd])
}

async function newProject(ws, modid) {
  const dir = ws.path(modid)
  await ws.call('project.create', { path: dir, name: 'MDK 测试', modid, loader: 'forge' })
  return dir
}

const cases = [
  {
    name: '识别本地 MDK 目录',
    async run(ws) {
      const mdk = await makeMdkDir(join(ws.path('mdk'), 'forge'))
      const info = await ws.call('scaffold.inspect', { dir: mdk })
      equal(info.kind, 'forge', '识别为 forge')
      equal(info.minecraft, '1.20.1', 'MC 版本')
      equal(info.loaderVersion, '47.4.16', 'loader 版本')
      equal(info.errors.length, 0, '无错误')
    },
  },
  {
    name: '从本地 MDK 目录构建',
    async run(ws) {
      const mdk = await makeMdkDir(join(ws.path('mdk2'), 'forge'))
      const dir = await newProject(ws, 'mdkdir')
      const result = await ws.call('scaffold.apply', {
        path: dir, source: 'mdk', dir: mdk,
        modid: 'mymod', name: 'My Mod', authors: 'Besson',
      })
      equal(result.params.modid, 'mymod', '参数回显')
      must(result.params.package === 'com.besson.mymod', '作者段生成包名')
      must(result.files.length > 0, '应复制文件')
      const props = await fsp.readFile(join(dir, 'gradle.properties'), 'utf8')
      must(props.includes('mod_id=mymod'), 'gradle.properties 已替换 mod_id')
      must(props.includes('mod_group_id=com.besson.mymod'), 'mod_group_id 含作者段')
      const settings = await fsp.readFile(join(dir, 'settings.gradle'), 'utf8')
      must(settings.includes("rootProject.name = 'mymod'"), 'settings.gradle 已替换')
      const main = await fsp.readFile(join(dir, 'src/main/java/com/besson/mymod/MymodMod.java'), 'utf8')
      must(main.includes('package com.besson.mymod;'), 'Java 目录与包名一致')
      must(main.includes('class MymodMod'), '主类类名已替换')
      const exampleDir = await fsp.stat(join(dir, 'src/main/java/com/example')).then(() => true).catch(() => false)
      equal(exampleDir, false, '旧 example 目录已清理')
      const toml = await fsp.readFile(join(dir, 'src/main/resources/META-INF/mods.toml'), 'utf8')
      must(toml.includes('${mod_id}'), 'mods.toml 保留 Gradle 占位符')
    },
  },
  {
    name: '从 MDK zip 构建',
    async run(ws) {
      const zipDir = ws.path('zips')
      const zipPath = join(zipDir, 'forge-mdk.zip')
      await fsp.mkdir(zipDir, { recursive: true })
      await fsp.writeFile(zipPath, makeStoreZip(makeMdkEntries()))
      const info = await ws.call('scaffold.inspect', { archive: zipPath })
      equal(info.kind, 'forge', 'zip 识别为 forge')
      const dir = await newProject(ws, 'mdkzip')
      const result = await ws.call('scaffold.apply', {
        path: dir, source: 'mdk', archive: zipPath, modid: 'zipmod', name: 'Zip Mod',
      })
      must(result.files.some((file) => file.endsWith('gradle.properties')), 'zip 解压出 gradle.properties')
      const props = await fsp.readFile(join(dir, 'gradle.properties'), 'utf8')
      must(props.includes('mod_id=zipmod'), 'zip 工程 mod_id 已替换')
    },
  },
  {
    name: '路径穿越的 zip 被拒绝',
    async run(ws) {
      const zipDir = ws.path('evil')
      const zipPath = join(zipDir, 'evil.zip')
      await fsp.mkdir(zipDir, { recursive: true })
      const entries = makeMdkEntries()
      entries['../evil.txt'] = 'evil'
      await fsp.writeFile(zipPath, makeStoreZip(entries))
      const dir = await newProject(ws, 'mdkevil')
      let message = ''
      try {
        await ws.call('scaffold.apply', { path: dir, source: 'mdk', archive: zipPath, modid: 'evilmod', name: 'Evil' })
      } catch (error) { message = error.message }
      must(message.includes('路径不安全') || message.includes('越界'), `应拒绝路径穿越，实际「${message}」`)
      const escaped = await fsp.stat(join(dir, '..', 'evil.txt')).then(() => true).catch(() => false)
      equal(escaped, false, '不应写出目标目录')
    },
  },
  {
    name: '符号链接 zip 被拒绝',
    async run(ws) {
      const zipDir = ws.path('symlink')
      const zipPath = join(zipDir, 'symlink.zip')
      await fsp.mkdir(zipDir, { recursive: true })
      const entries = makeMdkEntries()
      entries['src/main/resources/link.txt'] = 'target'
      const buffer = makeStoreZip(entries)
      // 把最后一个条目的 external attr 标记为符号链接
      const eocd = buffer.length - 22
      const count = buffer.readUInt16LE(eocd + 10)
      let pos = buffer.readUInt32LE(eocd + 16)
      for (let index = 0; index < count; index += 1) {
        const nameLen = buffer.readUInt16LE(pos + 28)
        const extraLen = buffer.readUInt16LE(pos + 30)
        const commentLen = buffer.readUInt16LE(pos + 32)
        if (index === count - 1) buffer.writeUInt32LE(0xa0000000, pos + 38)
        pos += 46 + nameLen + extraLen + commentLen
      }
      await fsp.writeFile(zipPath, buffer)
      const dir = await newProject(ws, 'mdksym')
      let message = ''
      try {
        await ws.call('scaffold.apply', { path: dir, source: 'mdk', archive: zipPath, modid: 'symmod', name: 'Sym' })
      } catch (error) { message = error.message }
      must(message.includes('符号链接'), `应拒绝符号链接，实际「${message}」`)
    },
  },
  {
    name: '版本不在矩阵内被拒绝',
    async run(ws) {
      const mdk = await makeMdkDir(join(ws.path('badver'), 'forge'), { minecraft: '1.19.2' })
      const info = await ws.call('scaffold.inspect', { dir: mdk })
      must(info.errors.some((error) => error.includes('版本不在矩阵')), '应提示版本不在矩阵')
    },
  },
  {
    name: '目标目录非空被拒绝',
    async run(ws) {
      const mdk = await makeMdkDir(join(ws.path('nonempty'), 'forge'))
      const dir = await newProject(ws, 'mdknonempty')
      await ws.write(join(dir, 'extra.txt'), 'extra')
      let message = ''
      try {
        await ws.call('scaffold.apply', { path: dir, source: 'mdk', dir: mdk, modid: 'nonempty', name: 'Non' })
      } catch (error) { message = error.message }
      must(message.includes('目标目录非空'), `应拒绝非空目录，实际「${message}」`)
    },
  },
  {
    name: '预览 MDK 文件清单',
    async run(ws) {
      const mdk = await makeMdkDir(join(ws.path('preview'), 'forge'))
      const dir = await newProject(ws, 'mdkpreview')
      const result = await ws.call('scaffold.preview', { path: dir, source: 'mdk', dir: mdk, modid: 'previewmod', name: 'Preview' })
      equal(result.kind, 'forge', '预览返回 loader')
      equal(result.source, 'mdk', '应回显 source=mdk')
      must(result.files.some((file) => file.path === 'gradle.properties' && file.action === 'create'), '应列出待创建文件')
      equal(result.conflicts.length, 0, '空目录无冲突')
    },
  },
  {
    name: '下载 URL 与白名单',
    async run() {
      const url = mdkUrl('forge', '1.20.1')
      must(url.includes('maven.minecraftforge.net'), 'forge 下载源正确')
      must(url.includes('47.4.16'), '使用矩阵推荐版本')
      let message = ''
      try { mdkUrl('minecraft', '1.20.1') } catch (error) { message = error.message }
      must(message.includes('不支持'), `未知加载器应拒绝，实际「${message}」`)
    },
  },
  {
    name: '整包迁移示例类与资源',
    async run(ws) {
      const mdk = await makeMdkDir(join(ws.path('migrate'), 'forge'))
      const dir = await newProject(ws, 'migratemod')
      await ws.call('scaffold.apply', {
        path: dir, source: 'mdk', dir: mdk,
        modid: 'migratemod', name: 'Migrate Mod', package: 'com.example.migratemod',
      })
      const config = await fsp.readFile(join(dir, 'src/main/java/com/example/migratemod/Config.java'), 'utf8').catch(() => '')
      must(config.includes('package com.example.migratemod;'), 'Config 包名已迁移')
      must(config.includes('MigratemodMod.LOGGER'), 'Config 引用新主类')
      const client = await fsp.readFile(join(dir, 'src/main/java/com/example/migratemod/client/ClientSetup.java'), 'utf8').catch(() => '')
      must(client.includes('"migratemod"'), 'ClientSetup 的 modid 已替换')
      const oldDir = await fsp.stat(join(dir, 'src/main/java/com/example/examplemod')).then(() => true).catch(() => false)
      equal(oldDir, false, '旧示例包目录已删除')
      const lang = await fsp.readFile(join(dir, 'src/main/resources/assets/migratemod/lang/en_us.json'), 'utf8').catch(() => '')
      must(lang.includes('item.migratemod.ruby'), '资源目录与内容已迁移')
    },
  },
  {
    name: '迁移后残留示例被拒绝',
    async run(ws) {
      const mdk = await makeMdkDir(join(ws.path('residual'), 'forge'))
      await writeFile(mdk, 'src/main/resources/residual.json', '{"id": "examplemod"}\n')
      const dir = await newProject(ws, 'residualmod')
      let message = ''
      try {
        await ws.call('scaffold.apply', { path: dir, source: 'mdk', dir: mdk, modid: 'residualmod', name: 'Residual' })
      } catch (error) { message = error.message }
      must(message.includes('仍有示例残留'), `应拒绝残留，实际「${message}」`)
    },
  },
  {
    name: '安装 Parchment 映射',
    async run(ws) {
      const mdk = await makeMdkDir(join(ws.path('parchment'), 'forge'))
      const dir = await newProject(ws, 'parchmod')
      await ws.call('scaffold.apply', { path: dir, source: 'mdk', dir: mdk, modid: 'parchmod', name: 'Parch Mod' })
      const build = await fsp.readFile(join(dir, 'build.gradle'), 'utf8')
      must(build.includes('org.parchmentmc.librarian.forgegradle'), 'build.gradle 含 librarian')
      const settings = await fsp.readFile(join(dir, 'settings.gradle'), 'utf8')
      must(settings.includes('maven.parchmentmc.org'), 'settings.gradle 含 Parchment Maven')
      const props = await fsp.readFile(join(dir, 'gradle.properties'), 'utf8')
      must(props.includes('mapping_channel=parchment'), 'mapping 切换为 parchment')
      must(props.includes('mapping_version=2023.09.03-1.20.1'), 'mapping 版本正确')
    },
  },
  {
    name: 'official 映射可回退',
    async run(ws) {
      const mdk = await makeMdkDir(join(ws.path('official'), 'forge'))
      const dir = await newProject(ws, 'officialmod')
      await ws.call('scaffold.apply', {
        path: dir, source: 'mdk', dir: mdk, modid: 'officialmod', name: 'Official', mapping: 'official',
      })
      const build = await fsp.readFile(join(dir, 'build.gradle'), 'utf8')
      must(!build.includes('librarian.forgegradle'), 'official 不安装 librarian')
      const props = await fsp.readFile(join(dir, 'gradle.properties'), 'utf8')
      must(props.includes('mapping_channel=official'), 'official 保持原映射')
    },
  },
]

process.exitCode = await runSuite('30 · MDK 模式', cases)
