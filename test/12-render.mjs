/**
 * 用例 12：客户端渲染结构。
 *
 * 验证「给定 props 会渲染出什么」，包括空态、条件分支、按钮与列表项。
 * 不验证样式数值与鼠标交互（后者需要真实 DOM）。
 */

import { equal, must, runSuite } from './helpers.mjs'
import { buttons, countTag, hasText, loadClient, tags, texts } from './render-harness.mjs'

/** 构造一个最小项目。 */
function makeProject(overrides = {}) {
  return {
    path: 'D:/demo',
    meta: { name: '演示', modid: 'demomod', loader: 'neoforge', minecraft: '1.20.1', version: '1.0.0' },
    items: [],
    features: [],
    ...overrides,
  }
}

const schema = {
  fields: [
    { key: 'maxStackSize', label: '最大堆叠', type: 'number', group: '基础属性', default: 64, min: 1, max: 64, unit: '个' },
    { key: 'rarity', label: '稀有度', type: 'select', group: '基础属性', default: 'common', options: [{ value: 'common', label: '常见' }] },
    { key: 'glint', label: '附魔光效', type: 'boolean', group: '基础属性', default: false },
    { key: 'itemTags', label: '物品标签', type: 'tags', group: '标签属性', default: [] },
  ],
  types: [
    { id: 'item', label: '普通物品' },
    { id: 'block', label: '方块' },
    { id: 'material', label: '材料' },
  ],
  statuses: [
    { id: 'idea', label: '构思', tone: 'idle' },
    { id: 'done', label: '已完成', tone: 'success' },
  ],
  priorities: [{ id: 'high', label: '高' }, { id: 'medium', label: '中' }],
}

const cases = [
  {
    name: '物品页空态显示引导文案',
    async run() {
      const client = await loadClient()
      const tree = client.render(client.components.ItemsTab, {
        project: makeProject(), setProject: () => {}, assets: null,
        schema, setError: () => {}, reloadAssets: () => {},
      })

      must(hasText(tree, '还没有物品'), '应显示空态')
      must(hasText(tree, '新建物品'), '应有新建按钮')
      must(hasText(tree, '列表') && hasText(tree, '画布'), '应有视图切换')
    },
  },
  {
    name: '物品页按物品数量渲染列表行',
    async run() {
      const client = await loadClient()
      const items = [
        { id: 'ruby', displayName: '红宝石', type: 'material', properties: { maxStackSize: 64, maxDamage: 0 }, canvas: { x: 0, y: 0 } },
        { id: 'ruby_sword', displayName: '红宝石剑', type: 'tool', properties: { maxStackSize: 1, maxDamage: 250 }, canvas: { x: 0, y: 0 } },
      ]
      const tree = client.render(client.components.ItemsTab, {
        project: makeProject({ items }), setProject: () => {}, assets: null,
        schema, setError: () => {}, reloadAssets: () => {},
      })

      must(hasText(tree, 'ruby'), '应显示注册名')
      must(hasText(tree, '红宝石'), '应显示显示名')
      must(hasText(tree, '250'), '应显示耐久')
      must(!hasText(tree, '还没有物品'), '有物品时不应显示空态')
    },
  },
  {
    name: '物品页有校验问题时显示提示条',
    async run() {
      const client = await loadClient({
        handler: async (action) => {
          if (action === 'agent.validate') {
            return {
              ok: false,
              errors: [{ level: 'error', code: 'item.property', message: '最大堆叠超限', target: 'ruby' }],
              warnings: [{ level: 'warning', code: 'asset.texture', message: '缺少贴图', target: 'ruby' }],
            }
          }
          if (action === 'assets.readMany') return { images: {} }
          return {}
        },
      })
      const tree = await client.renderSettled(client.components.ItemsTab, {
        project: makeProject(), setProject: () => {}, assets: null,
        schema, setError: () => {}, reloadAssets: () => {},
      })

      must(hasText(tree, '1 个错误'), '应显示错误数')
      must(hasText(tree, '1 个警告'), '应显示警告数')
      must(hasText(tree, '点击查看明细'), '应提示可展开')
    },
  },
  {
    name: '物品页无校验问题时隐藏提示条',
    async run() {
      const client = await loadClient({
        handler: async (action) => {
          if (action === 'agent.validate') return { ok: true, errors: [], warnings: [] }
          if (action === 'assets.readMany') return { images: {} }
          return {}
        },
      })
      const tree = await client.renderSettled(client.components.ItemsTab, {
        project: makeProject(), setProject: () => {}, assets: null,
        schema, setError: () => {}, reloadAssets: () => {},
      })

      must(!hasText(tree, '个错误'), '无问题时应隐藏提示条')
    },
  },
  {
    name: '构想页空态与新增按钮',
    async run() {
      const client = await loadClient()
      const tree = client.render(client.components.FeaturesTab, {
        project: makeProject(), setProject: () => {}, schema, setError: () => {},
      })

      must(hasText(tree, '还没有构想'), '应显示空态')
      must(hasText(tree, '新增构想'), '应有新增按钮')
      must(hasText(tree, '构想（0）'), '标题应带计数')
    },
  },
  {
    name: '构想页渲染条目与状态徽章',
    async run() {
      const client = await loadClient()
      const features = [
        { id: 'f1', name: '宝石挖掘', status: 'done', priority: 'high', description: '挖矿', notes: '' },
      ]
      const tree = client.render(client.components.FeaturesTab, {
        project: makeProject({ features }), setProject: () => {}, schema, setError: () => {},
      })

      must(hasText(tree, '宝石挖掘'), '应显示构想名')
      must(hasText(tree, '已完成'), '应显示状态标签')
      must(hasText(tree, '构想（1）'), '计数应为 1')
    },
  },
  {
    name: '项目页列出项目与路径',
    async run() {
      const client = await loadClient()
      const boot = {
        registry: {
          root: 'D:/program',
          projects: [
            { path: 'D:/program/a', name: '项目甲', modid: 'moda', loader: 'forge', missing: false, isStudio: true },
            { path: 'D:/program/b', name: '项目乙', modid: 'modb', loader: 'fabric', missing: true, isStudio: false },
          ],
        },
      }
      const tree = client.render(client.components.ProjectTab, {
        boot, project: null, refreshBoot: async () => {}, open: async () => {},
        onCreate: () => {}, onImport: () => {}, onReimport: () => {}, onCloseProject: () => {},
        setError: () => {},
      })

      must(hasText(tree, '项目甲'), '应显示第一个项目')
      must(hasText(tree, '项目乙'), '应显示第二个项目')
      must(hasText(tree, '目录不存在'), '缺失目录应有提示')
      must(hasText(tree, '扫描已有工程'), '应有扫描区')
    },
  },
  {
    name: '项目页按钮随状态变化',
    async run() {
      const client = await loadClient()
      const boot = {
        registry: {
          root: 'D:/program',
          projects: [
            { path: 'D:/program/a', name: '可打开', modid: 'moda', loader: 'forge', missing: false, isStudio: true },
            { path: 'D:/program/b', name: '待导入', modid: 'modb', loader: 'forge', missing: false, isStudio: false },
          ],
        },
      }
      const tree = client.render(client.components.ProjectTab, {
        boot, project: null, refreshBoot: async () => {}, open: async () => {},
        onCreate: () => {}, onImport: () => {}, onReimport: () => {}, onCloseProject: () => {},
        setError: () => {},
      })

      const labels = buttons(tree).map((entry) => entry.text)
      must(labels.includes('打开'), '工坊项目应有「打开」')
      must(labels.includes('导入'), '非工坊项目应有「导入」')
      must(labels.includes('详情'), '每行应有「详情」')
      must(labels.includes('重新导入'), '每行应有「重新导入」')
      must(labels.includes('移除'), '每行应有「移除」')
    },
  },
  {
    name: '素材页空态',
    async run() {
      const client = await loadClient()
      const tree = client.render(client.components.AssetsTab, {
        project: makeProject(), assets: { textures: [], models: [], missing: [], root: 'D:/x', standard: true },
        reloadAssets: () => {}, setError: () => {},
      })

      must(texts(tree).length > 0, '应渲染出内容')
      must(countTag(tree, 'div') > 0, '应有容器元素')
    },
  },
  {
    name: '教程页渲染 markdown 文本',
    async run() {
      const client = await loadClient()
      const tree = client.render(client.components.GuideTab, {
        guide: '# 构建教程\n\n准备 JDK 17。\n\n- 第一步\n- 第二步',
      })

      must(hasText(tree, '构建教程'), '应渲染标题（Markdown 以 props 传递原文）')
      must(hasText(tree, 'JDK 17'), '应渲染正文')
      must(hasText(tree, '第一步'), '应渲染列表项')
    },
  },
  {
    name: '物品编辑器渲染分组与字段',
    async run() {
      const client = await loadClient()
      const tree = client.render(client.components.ItemEditor, {
        schema,
        item: {
          id: 'ruby', displayName: '红宝石', type: 'material',
          properties: { maxStackSize: 64, rarity: 'common', glint: false, itemTags: [] },
          tags: [], description: '', notes: '', canvas: { x: 0, y: 0 },
        },
        project: makeProject(), images: {}, setError: () => {},
        onSave: () => {}, onCancel: () => {},
      })

      must(hasText(tree, '最大堆叠'), '应渲染数字字段标签')
      must(hasText(tree, '稀有度'), '应渲染下拉字段标签')
      must(hasText(tree, '基础属性'), '应渲染分组标题')
      must(hasText(tree, '上传 PNG'), '应渲染贴图上传入口')
    },
  },
  {
    name: '右侧栏未打开项目时显示引导',
    async run() {
      const client = await loadClient()
      const tree = client.render(client.components.SidebarStudioPanel, {})

      must(hasText(tree, '还没有打开项目'), '应显示引导文案')
      must(hasText(tree, '模组工坊'), '应显示标题')
    },
  },
  {
    name: 'InfoRow 渲染标签与值',
    async run() {
      const client = await loadClient()
      const tree = client.render(client.components.InfoRow, { label: '最大堆叠', value: '64' })

      must(hasText(tree, '最大堆叠'), '应渲染标签')
      must(hasText(tree, '64'), '应渲染值')
    },
  },
  {
    name: '素材页显示无 blockstate 方块贴图',
    async run() {
      const client = await loadClient({
        handler: async (action) => {
          if (action === 'assets.readMany') return { images: { 'block/ice_ether_block': 'data:image/png;base64,AA==' } }
          return {}
        },
      })
      const project = makeProject({
        items: [{ id: 'ice_ether_block', displayName: '寒冰方块', type: 'block', properties: { maxStackSize: 64, maxDamage: 0 }, canvas: { x: 0, y: 0 } }],
      })
      const assets = {
        modid: 'demomod', root: 'D:/demo/assets', standard: true,
        textures: [{ id: 'ice_ether_block', kind: 'block' }],
        models: [], blockModels: [], blocks: [], missing: ['ice_ether_block'], blockCount: 0,
      }
      const tree = await client.renderSettled(client.components.AssetsTab, {
        project, assets, reloadAssets: () => {}, setError: () => {},
      })

      must(hasText(tree, 'ice_ether_block'), '应列出方块条目')
      must(countTag(tree, 'img') >= 1, '应显示方块贴图缩略图')
    },
  },
  {
    name: '导入确认弹窗展示四类差异',
    async run() {
      const client = await loadClient({
        handler: async (action) => {
          if (action !== 'project.analyzeImport') return {}
          return {
            kind: 'registered',
            identity: {
              name: '演示', modid: 'demomod', version: '1.0.0',
              loader: 'neoforge', loaderRange: '47.1.79',
              minecraft: '1.20.1', source: 'gradle.properties',
            },
            notices: [{ level: 'info', code: 'loader.gradle', message: '加载器判定为 neoforge' }],
            diff: {
              created: [{ id: 'sapphire', type: 'item' }],
              kept: [{ id: 'ruby', type: 'item' }],
              typeConflicts: [{ id: 'ruby_block', from: 'item', to: 'block' }],
              missing: [{ id: 'old_item', type: 'item' }],
            },
          }
        },
      })

      const tree = await client.renderSettled(client.components.ImportConfirmModal, {
        path: 'D:/demo', onClose: () => {}, onConfirm: async () => {},
      })

      must(hasText(tree, '将新增（1）'), '应显示新增数')
      must(hasText(tree, '保持不变（1）'), '应显示保留数')
      must(hasText(tree, '本地有、工程里没有（1）'), '应显示无资源条目')
      must(hasText(tree, '类型冲突'), '应显示类型冲突卡片')
      must(hasText(tree, 'sapphire'), '应列出新增条目名')
      must(hasText(tree, 'old_item'), '应列出无资源条目名')
      must(hasText(tree, '判定提示'), '应显示判定提示')
    },
  },
  {
    name: '测试钩子未启用时不暴露组件',
    async run() {
      const { readFile } = await import('node:fs/promises')
      const source = await readFile('D:/program/dsh-mcmods-studio-plugin/client.js', 'utf8')

      let definition = null
      const fakeWindow = {
        __ModuleLoader__: { load: (value) => { definition = value } },
      }
      const fakeDocument = { getElementById: () => null, createElement: () => ({}), head: { appendChild() {} } }
      const run = new Function('window', 'document', 'fetch', 'setTimeout', 'console', source)
      run(fakeWindow, fakeDocument, async () => ({ json: async () => ({ ok: true, data: {} }) }), (fn) => fn(), console)

      const module = definition.factory(() => ({ createElement: () => {}, useState: (v) => [v, () => {}], useEffect: () => {}, useMemo: (f) => f(), useRef: (v) => ({ current: v }), useCallback: (f) => f }))
      equal(module.components, undefined, '未设置 __MCMODS_TEST__ 时不应暴露组件')
      must(module.apply, '仍应正常返回 apply')
    },
  },
]

process.exitCode = await runSuite('12 · 客户端渲染结构', cases)
