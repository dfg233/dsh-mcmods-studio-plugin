/**
 * 用例 26：Gradle 脚手架（版本矩阵、参数推断、预览、写入、幂等、拒绝）。
 */

import { readFile, stat } from 'node:fs/promises'
import { join } from 'node:path'

import { equal, must, runSuite } from './helpers.mjs'
import { inferParams } from '../lib/scaffold.js'
import { listMatrix, resolveMatrix, supports } from '../lib/version-matrix.js'

async function newProject(ws, modid = 'scaffoldmod', loader = 'forge') {
  const dir = ws.path(modid)
  await ws.call('project.create', { path: dir, name: '脚手架测试', modid, loader })
  return dir
}

const cases = [
  {
    name: '版本矩阵覆盖三个加载器',
    async run() {
      equal(listMatrix().length, 3, '应有 forge / neoforge / fabric 三组')
      equal(resolveMatrix('forge', '1.20.1').loaderVersion, '47.4.16', 'forge 版本')
      equal(resolveMatrix('neoforge', '1.20.1').loaderVersion, '47.1.106', 'neoforge 版本')
      equal(resolveMatrix('fabric', '1.20.1').loaderVersion, '0.15.11', 'fabric 版本')
      equal(supports('forge', '1.19.2'), false, '不支持的 MC 版本应拒绝')
      equal(resolveMatrix('unknown', '1.20.1'), null, '未知 loader 返回 null')
    },
  },
  {
    name: '从描述推断参数',
    async run(ws) {
      const dir = await newProject(ws, 'infermod', 'neoforge')
      const params = inferParams({
        description: '用 NeoForge 1.20.1 做一个 Ruby 物品模组',
        modid: 'rubymod',
        name: 'Ruby Mod',
      }, { name: 'Ruby Mod', modid: 'rubymod', loader: 'neoforge', group: 'com.example.rubymod' })
      equal(params.loader, 'neoforge', '应从描述识别 neoforge')
      equal(params.minecraft, '1.20.1', '默认 1.20.1')
      equal(params.ClassName, 'RubymodMod', '类名应由 modid 生成')
      equal(params.package, 'com.example.rubymod', '包名来自项目 group')
      equal(params.packagePath, 'com/example/rubymod', '包路径应转目录')
      must(params.modDescription.includes('Ruby'), '描述应保留')
    },
  },
  {
    name: '预览列出完整工程文件',
    async run(ws) {
      const dir = await newProject(ws, 'previewmod')
      const result = await ws.call('scaffold.preview', { path: dir, loader: 'forge', minecraft: '1.20.1' })
      equal(result.params.loader, 'forge', '参数应回显')
      equal(result.source, 'builtin', '应回显 source=builtin')
      const paths = result.files.map((file) => file.path)
      for (const expected of ['build.gradle', 'settings.gradle', 'gradle.properties', 'gradlew', 'gradlew.bat']) {
        must(paths.includes(expected), `应包含 ${expected}`)
      }
      must(paths.some((path) => path === 'src/main/java/com/example/previewmod/PreviewmodMod.java'), '应包含主类')
      must(paths.includes('src/main/resources/META-INF/mods.toml'), 'forge 应包含 mods.toml')
      equal(result.conflicts.length, 0, '空目录不应有冲突')
    },
  },
  {
    name: '已存在文件默认跳过',
    async run(ws) {
      const dir = await newProject(ws, 'conflictmod')
      await ws.write(join(dir, 'build.gradle'), '// existing\n')
      const result = await ws.call('scaffold.preview', { path: dir, loader: 'forge' })
      const build = result.files.find((file) => file.path === 'build.gradle')
      equal(build.action, 'skip', '已存在文件应跳过')
      must(result.conflicts.some((item) => item.path === 'build.gradle'), '应报告冲突')
    },
  },
  {
    name: '应用脚手架写入文件',
    async run(ws) {
      const dir = await newProject(ws, 'applymod')
      const result = await ws.call('scaffold.apply', { path: dir, loader: 'forge', modid: 'applymod', name: 'Apply Mod' })
      equal(result.created.length > 0, true, '应写入文件')
      equal(result.conflicts.length, 0, '空目录不应有冲突')
      const properties = await readFile(join(dir, 'gradle.properties'), 'utf8')
      must(properties.includes('mod_id=applymod'), 'gradle.properties 应写入 modid')
      const main = await readFile(join(dir, 'src/main/java/com/example/applymod/ApplymodMod.java'), 'utf8')
      must(main.includes('@Mod(ApplymodMod.MODID)'), '主类应写入 @Mod')
      const wrapper = await stat(join(dir, 'gradle/wrapper/gradle-wrapper.jar'))
      must(wrapper.size > 1000, '应复制 wrapper jar')
    },
  },
  {
    name: '重复应用不覆盖已有文件',
    async run(ws) {
      const dir = await newProject(ws, 'idempotentmod')
      const first = await ws.call('scaffold.apply', { path: dir, loader: 'forge' })
      must(first.created.length > 0, '首次应写入')
      const second = await ws.call('scaffold.apply', { path: dir, loader: 'forge' })
      equal(second.created.length, 0, '再次应用不应写入新文件')
      equal(second.skipped, first.created.length, '应全部跳过')
    },
  },
  {
    name: '非法组合与非法 modid 被拒绝',
    async run(ws) {
      const dir = await newProject(ws, 'invalidmod')
      let message = ''
      try {
        await ws.call('scaffold.preview', { path: dir, loader: 'minecraft', minecraft: '1.20.1' })
      } catch (error) { message = error.message }
      must(message.includes('不支持的组合'), `应拒绝未知加载器，实际「${message}」`)

      message = ''
      try {
        await ws.call('scaffold.preview', { path: dir, loader: 'forge', modid: 'Bad Mod' })
      } catch (error) { message = error.message }
      must(message.includes('modid'), `应拒绝非法 modid，实际「${message}」`)
    },
  },
  {
    name: 'project.create 同时生成 Gradle 工程',
    async run(ws) {
      const dir = ws.path('scaffoldcreate')
      const project = await ws.call('project.create', {
        path: dir, name: '脚手架创建', modid: 'scaffoldcreate', loader: 'forge', scaffold: true,
      })
      must(project.scaffold, '应返回脚手架结果')
      must(project.scaffold.created.length > 0, '应写入文件')
      must(!project.scaffoldError, '不应有错误')
      const build = await readFile(join(dir, 'build.gradle'), 'utf8')
      must(build.includes('net.minecraftforge.gradle'), 'build.gradle 应写入')
    },
  },
  {
    name: 'scaffold 工具预览',
    async run(ws) {
      const dir = await newProject(ws, 'toolmod')
      const result = await ws.call('agent.call', {
        tool: 'scaffold',
        args: { action: 'preview', project: dir, description: '用 Fabric 1.20.1 建一个工具模组', modid: 'toolmod' },
      })
      equal(result.params.loader, 'fabric', '工具应从描述识别 fabric')
      must(result.files.some((file) => file.path === 'src/main/resources/fabric.mod.json'), 'fabric 应包含 fabric.mod.json')
    },
  },
  {
    name: '中文项目名派生英文 Gradle 字段',
    async run(ws) {
      const dir = await newProject(ws, 'zhmod')
      const result = await ws.call('scaffold.preview', { path: dir, loader: 'forge', name: '我的模组', modid: 'zhmod', license: '' })
      equal(result.params.name, '我的模组', '显示名保留中文')
      equal(result.params.gradleName, 'Zhmod', '英文名由 modid 派生')
      equal(result.params.gradleLicense, 'All Rights Reserved', '空 license 回退')
      const props = result.files.find((f) => f.path === 'gradle.properties')
      must(props.content.includes('mod_name=Zhmod'), 'gradle.properties 用英文名')
      must(props.content.includes('mod_license=All Rights Reserved'), 'license 非空')

      const zh = await ws.call('scaffold.preview', { path: dir, loader: 'forge', name: '中文名', modid: 'zhmod', license: '保留所有权利' })
      equal(zh.params.gradleLicense, 'All Rights Reserved', '中文 license 回退')
    },
  },
  {
    name: '三个加载器的 Gradle 字段均为 ASCII',
    async run(ws) {
      for (const [loader, modid] of [['forge', 'asciiforge'], ['neoforge', 'ascineo'], ['fabric', 'ascifabric']]) {
        const dir = await newProject(ws, modid)
        const result = await ws.call('scaffold.preview', { path: dir, loader, name: '中文项目', description: '中文描述' })
        const files = result.files.filter((f) => f.path === 'gradle.properties' || f.path.endsWith('fabric.mod.json'))
        must(files.length > 0, `${loader} 应有配置文件`)
        for (const file of files) {
          const bad = [...file.content].filter((ch) => {
            const code = ch.charCodeAt(0)
            return code > 0x7e || (code < 0x20 && ch !== '\n' && ch !== '\r' && ch !== '\t')
          })
          must(bad.length === 0, `${loader} 的 ${file.path} 应为 ASCII，含：${JSON.stringify(bad.slice(0, 5))}`)
        }
        if (loader === 'fabric') {
          const mod = JSON.parse(result.files.find((f) => f.path.endsWith('fabric.mod.json')).content)
          must(mod.name && mod.license === 'All Rights Reserved', 'fabric.mod.json name/license 非空')
        }
      }
    },
  },
  {
    name: '作者写入 gradle.properties',
    async run(ws) {
      const dir = ws.path('authormod')
      const project = await ws.call('project.create', {
        path: dir, name: 'Author Mod', modid: 'authormod', loader: 'forge', authors: 'Besson', scaffold: true,
      })
      equal(project.meta.authors, 'Besson', 'meta 记录作者')
      const props = await readFile(join(dir, 'gradle.properties'), 'utf8')
      must(props.includes('mod_authors=Besson'), 'gradle.properties 写入作者')
      must(props.includes('mod_group_id=com.besson.authormod'), 'mod_group_id 含作者段')
      const main = await readFile(join(dir, 'src/main/java/com/besson/authormod/AuthormodMod.java'), 'utf8').catch(() => '')
      must(main.includes('package com.besson.authormod;'), 'Java 目录与包名一致')
    },
  },
]

process.exitCode = await runSuite('26 · Gradle 脚手架', cases)
