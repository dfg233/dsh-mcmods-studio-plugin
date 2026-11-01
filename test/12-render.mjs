/**
 * 用例 12：客户端渲染结构。
 *
 * 验证「给定 props 会渲染出什么」，包括空态、条件分支、按钮与列表项。
 * 不验证样式数值与鼠标交互（后者需要真实 DOM）。
 */

import { equal, must, runSuite } from './helpers.mjs'
import { buttons, countTag, hasText, loadClient, tags, texts, walk } from './render-harness.mjs'

/** 在元素树里找第一个匹配的组件节点（type 为函数）。 */
function findComponent(tree, predicate) {
  let found = null
  walk(tree, (node) => {
    if (found || typeof node.type !== 'function') return
    if (node.props && predicate(node)) found = node
  })
  return found
}

/** 点击文本完全匹配且带 onClick 的元素（页签等）。 */
function clickText(tree, label) {
  let target = null
  walk(tree, (node) => {
    if (target || node.type === '#text') return
    if (typeof node.props?.onClick === 'function' && texts(node).some((text) => text === label)) target = node
  })
  if (!target) throw new Error(`找不到可点击元素：${label}`)
  target.props.onClick()
  return target
}

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

/** 语言页的模拟返回。 */
function makeLangData() {
  return {
    modid: 'demomod',
    standard: true,
    root: 'D:/demo/src/main/resources/assets/demomod',
    files: {
      zh_cn: 'src/main/resources/assets/demomod/lang/zh_cn.json',
      en_us: 'src/main/resources/assets/demomod/lang/en_us.json',
    },
    entries: [
      {
        key: 'item.demomod.ruby', kind: 'item', id: 'ruby', displayName: '红宝石',
        zh: '红宝石', en: 'Ruby', zhFromEn: false, missing: [], keyMissing: false,
      },
      {
        key: 'block.demomod.ruby_block', kind: 'block', id: 'ruby_block', displayName: '红宝石块',
        zh: '红宝石块', en: '', zhFromEn: false, missing: ['en_us'], keyMissing: false,
      },
    ],
    others: [{ key: 'item.demomod.removed', zh: '旧物品', en: '' }],
    stats: { total: 2, missingZh: 0, missingEn: 1, missingKey: 0, unknown: 1 },
    warning: null,
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
      const props = {
        schema,
        item: {
          id: 'ruby', displayName: '红宝石', type: 'material',
          properties: { maxStackSize: 64, rarity: 'common', glint: false, itemTags: [] },
          tags: [], description: '', notes: '', canvas: { x: 0, y: 0 },
        },
        project: makeProject(), images: {}, setError: () => {},
        onSave: () => {}, onCancel: () => {},
      }
      let tree = client.render(client.components.ItemEditor, props)

      must(hasText(tree, '注册名（id）'), '基础页应渲染注册名')
      must(hasText(tree, '上传 PNG'), '基础页应渲染贴图上传入口')
      must(hasText(tree, '中文名') && hasText(tree, '英文名'), '语言应并入基础页')
      must(hasText(tree, '描述'), '基础页应渲染描述')
      must(!hasText(tree, '最大堆叠'), '默认页不应显示属性字段')
      must(!hasText(tree, '配方类型'), '默认页不应显示配方字段')

      clickText(tree, '属性')
      client.reactEnv.reset()
      tree = client.components.ItemEditor(props)
      must(hasText(tree, '最大堆叠'), '属性页应渲染数字字段标签')
      must(hasText(tree, '稀有度'), '属性页应渲染下拉字段标签')
      must(hasText(tree, '基础属性'), '属性页应渲染分组标题')

      clickText(tree, '配方')
      client.reactEnv.reset()
      tree = client.components.ItemEditor(props)
      must(hasText(tree, '配方类型'), '配方页应渲染配方字段')

      clickText(tree, '标签')
      client.reactEnv.reset()
      tree = client.components.ItemEditor(props)
      must(hasText(tree, '资源标签'), '标签页应渲染资源标签')

      clickText(tree, '模型与备注')
      client.reactEnv.reset()
      tree = client.components.ItemEditor(props)
      must(hasText(tree, '物品模型'), '模型页应渲染模型选择')
    },
  },
  {
    name: '物品编辑器切换页签不丢失输入',
    async run() {
      const client = await loadClient()
      const props = {
        schema,
        item: {
          id: 'ruby', displayName: '红宝石', type: 'material',
          properties: { maxStackSize: 64 }, tags: [], description: '', notes: '', canvas: { x: 0, y: 0 },
        },
        project: makeProject(), setError: () => {},
        onSave: () => {}, onCancel: () => {},
      }
      let tree = client.render(client.components.ItemEditor, props)
      const nameInput = findComponent(tree, (node) => node.props.value === '红宝石')
      must(nameInput, '应渲染显示名输入框')
      nameInput.props.onChange('红宝石剑')

      client.reactEnv.reset()
      tree = client.components.ItemEditor(props)
      clickText(tree, '属性')
      client.reactEnv.reset()
      tree = client.components.ItemEditor(props)
      clickText(tree, '基础')
      client.reactEnv.reset()
      tree = client.components.ItemEditor(props)

      must(findComponent(tree, (node) => node.props.value === '红宝石剑'), '切页后显示名应保留')
    },
  },
  {
    name: '想法编辑器渲染目标、验收与内容清单',
    async run() {
      const client = await loadClient()
      const tree = client.render(client.components.FeatureEditor, {
        feature: {
          id: 'f1', name: '电子锁', description: '', status: 'idea', priority: 'high',
          goal: '给门加锁', loop: '装锁 → 配钥匙', acceptance: ['错误钥匙打不开'],
          assumptions: [], openQuestions: [], systems: ['lock-core'], constraints: [],
          content: [{ kind: 'item', id: 'electronic_lock', status: 'planned' }],
          items: [], notes: '', version: '',
        },
        schema, project: makeProject(), setError: () => {},
        onSave: () => {}, onCancel: () => {},
      })
      must(hasText(tree, '目标'), '应渲染目标字段')
      must(hasText(tree, '验收条件'), '应渲染验收字段')
      must(hasText(tree, '内容清单'), '应渲染内容清单')
      must(hasText(tree, 'item:electronic_lock:planned'), '应回填内容状态')
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
    name: '计划页渲染系统与任务',
    async run() {
      const client = await loadClient({
        handler: async (action) => {
          if (action === 'workbench.plan') {
            return {
              ideas: [{ id: 'f_1', name: '锁想法' }],
              systems: [{
                id: 'lock-core', name: '锁核心', responsibility: '维护锁状态',
                invariants: ['服务端权威'], dependsOn: [], status: 'stable',
              }],
              tasks: [{
                id: 't_1', title: '新增电子锁', systemId: 'lock-core', status: 'todo',
                goal: '新增类型', allowedPaths: [{ path: 'a.java', mode: 'modify' }],
                acceptance: ['编译通过'], verify: [{ id: 'compile-java' }],
              }],
            }
          }
          return {}
        },
      })
      const tree = await client.renderSettled(client.components.PlanTab, {
        project: makeProject(), setError: () => {},
      })

      must(hasText(tree, '锁核心'), '应显示系统卡')
      must(hasText(tree, '新增电子锁'), '应显示任务卡')
      must(hasText(tree, '系统'), '应有系统分组')
      must(hasText(tree, '任务'), '应有任务分组')
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
    name: '物品页提供常驻历史记录入口',
    async run() {
      const client = await loadClient()
      const tree = client.render(client.components.ItemsTab, {
        project: makeProject(), setProject: () => {}, assets: null,
        schema, setError: () => {}, reloadAssets: () => {},
      })

      must(hasText(tree, '历史记录'), '应有常驻历史记录按钮')
      must(!hasText(tree, '回滚上次内容'), '单次回滚提示应移除')
      must(!hasText(tree, '上次内容写入已备份'), '单次备份提示应移除')
    },
  },
  {
    name: '历史弹窗列出步骤、状态与可回滚操作',
    async run() {
      const client = await loadClient({
        handler: async (action) => {
          if (action !== 'content.history.list') return {}
          return {
            entries: [
              {
                id: 'h4', sequence: 4, at: '2026-10-31T04:30:00.000Z', itemId: 'ruby_sword',
                title: '红宝石剑：语言', status: 'rolledBack',
                files: [{ kind: 'lang', path: 'a.json' }], latest: false,
              },
              {
                id: 'h3', sequence: 3, at: '2026-10-31T04:20:00.000Z', itemId: 'ruby_sword',
                title: '红宝石剑：配方', status: 'active',
                files: [{ kind: 'recipe', path: 'b.json' }, { kind: 'model', path: 'c.json' }], latest: false,
              },
              {
                id: 'h2', sequence: 2, at: '2026-10-31T04:10:00.000Z', itemId: 'ruby_sword',
                title: '红宝石剑：模型', status: 'active',
                files: [{ kind: 'model', path: 'c.json' }], latest: true,
              },
            ],
            total: 3,
            counts: { active: 2, rolledBack: 1, archived: 0, failed: 0 },
            itemId: 'ruby_sword',
            includeArchived: false,
            options: { rollbackMode: 'toStep', keepBackups: true, scope: 'currentItem', maxEntries: 50 },
            warning: null,
          }
        },
      })
      const tree = await client.renderSettled(client.components.HistoryModal, {
        project: makeProject(), itemId: 'ruby_sword',
        onClose: () => {}, onRolledBack: () => {}, setError: () => {},
      })

      must(hasText(tree, '红宝石剑：配方'), '应显示步骤标题')
      must(hasText(tree, '已回滚'), '应标记已回滚步骤')
      must(hasText(tree, '最新一步'), '最新 active 步骤不可回滚')
      must(hasText(tree, '回到这一步'), '较早的 active 步骤应可回滚')
      must(hasText(tree, '当前物品') && hasText(tree, '全部'), '应有范围切换')
      must(hasText(tree, '显示已归档'), '应有归档开关')
      must(hasText(tree, '2 个文件'), '应显示文件数')
    },
  },
  {
    name: 'Pattern 与材料键输入保留换行，保存时才解析',
    async run() {
      const client = await loadClient({
        handler: async (action) => {
          if (action === 'content.get') {
            return {
              lang: { zh: '', en: '' },
              recipe: {
                type: 'shaped', pattern: [' R '], keys: ['R=ruby'], ingredients: [],
                count: 1, experience: 0, cookingTime: 200,
              },
              model: { parent: 'minecraft:item/generated' },
              tags: [],
            }
          }
          return { files: [] }
        },
      })
      const item = {
        id: 'ruby_sword', displayName: '红宝石剑', type: 'tool',
        properties: { maxStackSize: 1, rarity: 'common', glint: false, itemTags: [] },
        tags: [], description: '', notes: '', canvas: { x: 0, y: 0 },
        createdAt: '2026-10-30T00:00:00.000Z',
      }
      let saved = null
      const props = {
        schema, item, project: makeProject(), images: {}, setError: () => {},
        onSave: (draft, content) => { saved = content; return true },
        onCancel: () => {},
      }

      let tree = await client.renderSettled(client.components.ItemEditor, props)
      clickText(tree, '配方')
      client.reactEnv.reset()
      tree = client.components.ItemEditor(props)

      const patternInput = findComponent(tree, (node) => node.props.value === ' R ')
      must(patternInput, '应渲染 Pattern 输入框')

      // 模拟按 Enter：空行与末尾换行必须原样留在输入框里
      const typedPattern = ' R \n\n R \n S \n'
      patternInput.props.onChange(typedPattern)
      client.reactEnv.reset()
      tree = client.components.ItemEditor(props)
      must(
        findComponent(tree, (node) => node.props.value === typedPattern),
        '输入的多行文本应原样保留（含空行与末尾换行）',
      )

      const keysInput = findComponent(tree, (node) => node.props.value === 'R=ruby')
      must(keysInput, '应渲染材料键输入框')
      keysInput.props.onChange('R=ruby\nS=minecraft:stick\n')
      client.reactEnv.reset()
      tree = client.components.ItemEditor(props)

      must(
        findComponent(tree, (node) => node.props.value === 'R=ruby\nS=minecraft:stick\n'),
        '材料键输入应保留末尾换行',
      )

      // 弹窗 footer 由 Modal 内部渲染，渲染树里拿不到按钮；
      // 保存前的解析走同一个纯函数，直接验证它。
      const payload = client.helpers.contentPayload({
        lang: { zh: '红宝石剑', en: '' },
        recipe: {
          type: 'shaped',
          patternText: typedPattern,
          keysText: 'R=ruby\nS=minecraft:stick\n',
          ingredientsText: '',
          count: 1, experience: 0, cookingTime: 200,
        },
        model: { parent: 'minecraft:item/generated' },
        tagsText: 'minecraft:planks\n\nruby:lockable\n',
      })
      equal(payload.recipe.pattern.length, 3, '应解析出三行 pattern')
      equal(payload.recipe.pattern[0], ' R ', 'pattern 空格应保留')
      equal(payload.recipe.pattern[2], ' S ', 'pattern 第三行应保留')
      equal(payload.recipe.keys.length, 2, '应解析出两个材料键')
      equal(payload.recipe.keys[1], 'S=minecraft:stick', '材料键第二行应保留')
      equal(payload.tags.length, 2, '资源标签空行应被忽略')
    },
  },
  {
    name: '物品编辑器显示已上传的贴图',
    async run() {
      const client = await loadClient()
      const item = {
        id: 'ruby', displayName: '红宝石', type: 'material',
        properties: { maxStackSize: 64, rarity: 'common', glint: false, itemTags: [] },
        tags: [], description: '', notes: '', canvas: { x: 0, y: 0 },
      }
      const dataUrl = 'data:image/png;base64,AAAA'
      const tree = client.render(client.components.ItemEditor, {
        schema, item, project: makeProject(),
        imageFor: (id) => (id === 'ruby' ? dataUrl : ''),
        setError: () => {}, onSave: () => {}, onCancel: () => {},
      })

      let preview = null
      walk(tree, (node) => {
        if (!preview && node.type === 'img' && node.props.src === dataUrl) preview = node
      })
      must(preview, '编辑器应按 imageFor 渲染贴图预览')
    },
  },
  {
    name: '物品页把缩略图映射传给编辑器',
    async run() {
      const dataUrl = 'data:image/png;base64,BBBB'
      const client = await loadClient({
        handler: async (action) => {
          if (action === 'assets.readMany') return { images: { 'item/ruby': dataUrl } }
          if (action === 'agent.validate') return { errors: [], warnings: [] }
          return {}
        },
      })
      const project = makeProject({
        items: [{
          id: 'ruby', displayName: '红宝石', type: 'material',
          properties: { maxStackSize: 64, maxDamage: 0 }, canvas: { x: 0, y: 0 },
        }],
      })
      const props = {
        project, setProject: () => {}, assets: null, schema, setError: () => {}, reloadAssets: () => {},
      }
      let tree = await client.renderSettled(client.components.ItemsTab, props)

      const edit = buttons(tree).find((entry) => entry.text === '编辑')
      must(edit, '应有编辑按钮')
      edit.node.props.onClick()

      client.reactEnv.reset()
      tree = client.components.ItemsTab(props)

      const editor = findComponent(tree, (node) => node.type === client.components.ItemEditor)
      must(editor, '应打开物品编辑器')
      equal(editor.props.imageFor('ruby'), dataUrl, '编辑器应拿到按 thumbKey 映射的贴图')
    },
  },
  {
    name: '语言页渲染物品语言键与统计',
    async run() {
      const client = await loadClient({
        handler: async (action) => (action === 'lang.list' ? makeLangData() : {}),
      })
      const tree = await client.renderSettled(client.components.LangTab, {
        project: makeProject(), setError: () => {},
      })

      must(hasText(tree, 'lang/zh_cn.json'), '应显示语言文件路径')
      must(hasText(tree, 'item.demomod.ruby'), '应显示语言键')
      must(hasText(tree, '红宝石块'), '应显示方块行')
      must(hasText(tree, '其他键（1）'), '应显示其他键统计')
      must(hasText(tree, '保存修改（0）'), '无修改时按钮显示 0')
      must(hasText(tree, '缺英文'), '应有缺英文筛选')
    },
  },
  {
    name: '语言页按缺失筛选',
    async run() {
      const client = await loadClient({
        handler: async (action) => (action === 'lang.list' ? makeLangData() : {}),
      })
      const props = { project: makeProject(), setError: () => {} }
      let tree = await client.renderSettled(client.components.LangTab, props)

      clickText(tree, '缺英文')
      client.reactEnv.reset()
      tree = client.components.LangTab(props)

      must(hasText(tree, '红宝石块'), '缺英文筛选应保留该行')
      must(!hasText(tree, 'Ruby'), '缺英文筛选应隐藏完整的行')
    },
  },
  {
    name: '语言页有修改时保存按钮可用',
    async run() {
      const client = await loadClient({
        handler: async (action) => (action === 'lang.list' ? makeLangData() : {}),
      })
      const props = { project: makeProject(), setError: () => {} }
      let tree = await client.renderSettled(client.components.LangTab, props)

      const zhInput = findComponent(tree, (node) => node.props.value === '红宝石')
      must(zhInput, '应渲染中文输入框')
      zhInput.props.onChange('红宝石（改）')

      client.reactEnv.reset()
      tree = client.components.LangTab(props)
      const saveButton = buttons(tree).find((entry) => entry.text.includes('保存修改（1）'))
      must(saveButton, '有修改时按钮应显示 1')
      must(saveButton.node.props.disabled === false, '保存按钮应可用')
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
