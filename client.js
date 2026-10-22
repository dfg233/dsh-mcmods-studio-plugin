/**
 * 「模组工坊」Client 半。
 *
 * 浏览器端注册两个座位：
 *   - sidebar.panellist（id: mc-mod-studio）：侧栏全局图标；
 *   - main（key: mc-mod-studio）：中央页面。
 *
 * 页面数据全部通过 POST /mcmods-studio/api 从 Host 半获取，
 * 本文件不直接访问文件系统。
 */

window.__ModuleLoader__.load({
  id: 'dsh-mcmods-studio-plugin',
  factory(require) {
    const React = require('react')
    const h = React.createElement
    const { useState, useEffect, useMemo, useRef, useCallback } = React

    const API = '/mcmods-studio/api'
    const KEY = 'mc-mod-studio'
    const STYLE_ID = 'mcmods-studio-styles'

    /** 注入插件页面样式：按钮悬停、按下、禁用态与卡片悬停。 */
    function ensureStyles() {
      if (typeof document === 'undefined') return
      if (document.getElementById(STYLE_ID)) return
      const style = document.createElement('style')
      style.id = STYLE_ID
      style.textContent = `
        .mcmods-root button {
          transition: background-color .12s ease, background-image .12s ease,
            border-color .12s ease, color .12s ease, transform .08s ease;
        }
        /* 悬停：叠加一层中性灰，效果与 DSH 原生按钮的灰色高亮一致；
           用 background-image 叠加而非替换 background-color，任何底色的按钮都适用。 */
        .mcmods-root button:hover:not(:disabled) {
          background-image: linear-gradient(
            rgba(128, 128, 128, .22),
            rgba(128, 128, 128, .22)
          ) !important;
          border-color: var(--dsw-alias-border-l2) !important;
        }
        .mcmods-root button:active:not(:disabled) {
          background-image: linear-gradient(
            rgba(128, 128, 128, .32),
            rgba(128, 128, 128, .32)
          ) !important;
          transform: translateY(1px);
        }
        .mcmods-root button:disabled {
          opacity: .55;
          cursor: not-allowed;
        }
        .mcmods-root button:focus-visible {
          outline: 2px solid var(--dsw-alias-brand-primary);
          outline-offset: 2px;
        }
        .mcmods-root .mcmods-card {
          transition: border-color .12s ease, box-shadow .12s ease;
        }
        .mcmods-root .mcmods-card:hover {
          border-color: var(--dsw-alias-border-l2);
          box-shadow: 0 4px 16px rgba(0, 0, 0, .14);
        }
      `
      document.head.appendChild(style)
    }

    // ── 基础工具 ─────────────────────────────────────────────

    async function call(action, payload) {
      const response = await fetch(API, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action, payload: payload || {} }),
      })
      const json = await response.json().catch(() => ({ ok: false, error: '响应解析失败' }))
      if (!json.ok) throw new Error(json.error || '请求失败')
      return json.data
    }

    const C = {
      bg: 'var(--dsw-alias-bg-base)',
      layer: 'var(--dsw-alias-bg-layer-1)',
      layer2: 'var(--dsw-alias-bg-layer-2)',
      border: 'var(--dsw-alias-border-l1)',
      border2: 'var(--dsw-alias-border-l2)',
      text: 'var(--dsw-alias-label-primary)',
      muted: 'var(--dsw-alias-label-secondary)',
      brand: 'var(--dsw-alias-brand-primary)',
      danger: 'var(--dsw-alias-state-error-primary)',
      success: 'var(--dsw-alias-state-success-primary)',
      warn: 'var(--dsw-alias-state-warn-primary)',
    }

    const S = {
      page: {
        height: '100%', display: 'flex', flexDirection: 'column',
        background: C.bg, color: C.text, minWidth: 0, boxSizing: 'border-box',
        fontFamily: 'inherit', fontSize: 13,
      },
      header: {
        display: 'flex', alignItems: 'center', gap: 12, padding: '12px 18px',
        borderBottom: `1px solid ${C.border}`, flexShrink: 0,
      },
      title: { fontSize: 15, fontWeight: 650, letterSpacing: '0.2px' },
      subtitle: { fontSize: 12, color: C.muted },
      tabs: {
        display: 'flex', gap: 4, padding: '8px 16px', borderBottom: `1px solid ${C.border}`,
        flexShrink: 0, overflowX: 'auto',
      },
      tab: (active) => ({
        padding: '6px 12px', borderRadius: 6, cursor: 'pointer', whiteSpace: 'nowrap',
        fontSize: 13, border: '1px solid transparent',
        background: active ? C.layer2 : 'transparent',
        color: active ? C.text : C.muted,
        borderColor: active ? C.border : 'transparent',
        fontWeight: active ? 600 : 400,
      }),
      body: { flex: 1, overflowY: 'auto', padding: '16px 18px 40px', minHeight: 0 },
      card: {
        background: C.layer, border: `1px solid ${C.border}`, borderRadius: 10,
        padding: 14, boxSizing: 'border-box',
      },
      sectionTitle: { fontSize: 13, fontWeight: 650, marginBottom: 8 },
      row: { display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' },
      btn: (kind) => {
        const danger = kind === 'danger'
        const ghost = kind === 'ghost'
        return {
          padding: '6px 12px', borderRadius: 7, cursor: 'pointer', fontSize: 12.5,
          border: `1px solid ${danger ? C.danger : C.border}`,
          background: ghost ? 'transparent' : C.layer2,
          color: danger ? C.danger : C.text,
          fontWeight: 500,
        }
      },
      input: {
        padding: '6px 9px', borderRadius: 7, border: `1px solid ${C.border}`,
        background: C.bg, color: C.text, fontSize: 12.5, boxSizing: 'border-box',
        outline: 'none', width: '100%',
      },
      label: { fontSize: 12, color: C.muted, marginBottom: 4, display: 'block' },
      hint: { fontSize: 11, color: C.muted, marginTop: 3, lineHeight: 1.5 },
      badge: (tone) => ({
        display: 'inline-flex', alignItems: 'center', gap: 4, padding: '1px 7px',
        borderRadius: 999, fontSize: 11, fontWeight: 600,
        border: `1px solid ${tone === 'danger' ? C.danger : tone === 'success' ? C.success : tone === 'warn' ? C.warn : C.border2}`,
        color: tone === 'danger' ? C.danger : tone === 'success' ? C.success : tone === 'warn' ? C.warn : C.muted,
        whiteSpace: 'nowrap',
      }),
      empty: { padding: 32, textAlign: 'center', color: C.muted, fontSize: 12.5, lineHeight: 1.8 },
      table: { width: '100%', borderCollapse: 'collapse', fontSize: 12.5 },
      th: { textAlign: 'left', padding: '7px 8px', borderBottom: `1px solid ${C.border}`, color: C.muted, fontWeight: 600 },
      td: { padding: '7px 8px', borderBottom: `1px solid ${C.border}` },
      overlay: {
        position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)',
        display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 60,
      },
      modal: {
        background: C.bg, border: `1px solid ${C.border2}`, borderRadius: 12,
        width: 'min(760px, 92vw)', maxHeight: '86vh', display: 'flex',
        flexDirection: 'column', boxShadow: '0 18px 60px rgba(0,0,0,0.45)',
      },
      modalHead: {
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '12px 16px', borderBottom: `1px solid ${C.border}`, flexShrink: 0,
      },
      modalBody: { padding: 16, overflowY: 'auto', minHeight: 0 },
      modalFoot: {
        display: 'flex', justifyContent: 'flex-end', gap: 8, padding: '10px 16px',
        borderTop: `1px solid ${C.border}`, flexShrink: 0,
      },
    }

    // ── 通用组件 ─────────────────────────────────────────────

    function Icon(props) {
      const size = props.size || 18
      const tint = props.active ? C.brand : C.muted
      return h('svg', {
        viewBox: '0 0 128 128', width: size, height: size, 'aria-hidden': true,
        style: { display: 'block', flexShrink: 0 },
      },
        h('rect', { x: 6, y: 6, width: 116, height: 116, rx: 26, fill: tint, opacity: props.active ? 0.24 : 0.16 }),
        h('path', { d: `M${64} ${26} L${94} ${44} L${64} ${62} L${34} ${44} Z`, fill: tint, opacity: 0.95 }),
        h('path', { d: `M${34} ${44} L${64} ${62} L${64} ${98} L${34} ${80} Z`, fill: tint, opacity: 0.62 }),
        h('path', { d: `M${94} ${44} L${64} ${62} L${64} ${98} L${94} ${80} Z`, fill: tint, opacity: 0.78 }),
      )
    }

    function Modal(props) {
      useEffect(() => {
        const onKey = (event) => { if (event.key === 'Escape') props.onClose() }
        window.addEventListener('keydown', onKey)
        return () => window.removeEventListener('keydown', onKey)
      }, [props.onClose])
      return h('div', { style: S.overlay, onMouseDown: (e) => { if (e.target === e.currentTarget) props.onClose() } },
        h('div', { style: S.modal },
          h('div', { style: S.modalHead },
            h('div', { style: S.sectionTitle }, props.title),
            h('button', { style: S.btn('ghost'), onClick: props.onClose }, '关闭'),
          ),
          h('div', { style: S.modalBody }, props.children),
          props.footer ? h('div', { style: S.modalFoot }, props.footer) : null,
        ),
      )
    }

    function Field(props) {
      return h('div', { style: { marginBottom: 12, minWidth: 0 } },
        h('label', { style: S.label }, props.label, props.required ? h('span', { style: { color: C.danger } }, ' *') : null),
        props.children,
        props.hint ? h('div', { style: S.hint }, props.hint) : null,
      )
    }

    function TextInput(props) {
      return h('input', {
        style: { ...S.input, ...(props.style || {}) },
        value: props.value ?? '',
        placeholder: props.placeholder || '',
        onChange: (e) => props.onChange(e.target.value),
        spellCheck: false,
      })
    }

    function NumberInput(props) {
      return h('input', {
        type: 'number', style: { ...S.input, ...(props.style || {}) },
        value: props.value ?? 0,
        min: props.min, max: props.max, step: props.step || 1,
        onChange: (e) => props.onChange(e.target.value === '' ? 0 : Number(e.target.value)),
      })
    }

    function Select(props) {
      return h('select', {
        style: { ...S.input, ...(props.style || {}) },
        value: props.value ?? '',
        onChange: (e) => props.onChange(e.target.value),
      }, (props.options || []).map((option) => h('option', { key: option.value, value: option.value }, option.label)))
    }

    function Textarea(props) {
      return h('textarea', {
        style: { ...S.input, minHeight: 64, resize: 'vertical', fontFamily: 'inherit', ...(props.style || {}) },
        value: props.value ?? '',
        placeholder: props.placeholder || '',
        onChange: (e) => props.onChange(e.target.value),
      })
    }

    function Toggle(props) {
      return h('label', { style: { display: 'inline-flex', alignItems: 'center', gap: 8, cursor: 'pointer' } },
        h('input', {
          type: 'checkbox', checked: Boolean(props.value),
          onChange: (e) => props.onChange(e.target.checked),
        }),
        h('span', { style: { fontSize: 12.5 } }, props.label || ''),
      )
    }

    function TagsInput(props) {
      const [draft, setDraft] = useState('')
      const values = Array.isArray(props.value) ? props.value : []
      const add = () => {
        const next = draft.trim()
        if (!next) return
        if (!values.includes(next)) props.onChange([...values, next])
        setDraft('')
      }
      return h('div', null,
        h('div', { style: { display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 6 } },
          values.length === 0 ? h('span', { style: { ...S.hint, marginTop: 0 } }, '暂未添加') : null,
          values.map((value) => h('span', {
            key: value, style: { ...S.badge('idle'), gap: 6, padding: '2px 8px' },
          },
            h('code', { style: { fontSize: 11 } }, value),
            h('span', {
              style: { cursor: 'pointer', opacity: 0.7 }, title: '移除',
              onClick: () => props.onChange(values.filter((v) => v !== value)),
            }, '×'),
          )),
        ),
        h('div', { style: { display: 'flex', gap: 6 } },
          h(TextInput, {
            value: draft, placeholder: '输入后按回车，例如 minecraft:planks',
            onChange: setDraft,
          }),
          h('button', { style: S.btn(), onClick: add }, '添加'),
        ),
      )
    }

    function Tabs(props) {
      return h('div', { style: S.tabs },
        props.tabs.map((tab) => h('div', {
          key: tab.id, style: S.tab(tab.id === props.value), onClick: () => props.onChange(tab.id),
        }, tab.label)),
      )
    }

    // ── 极简 markdown 渲染 ───────────────────────────────────

    function renderInline(text) {
      const nodes = []
      let rest = String(text || '')
      let key = 0
      const pattern = /(\*\*[^*]+\*\*|`[^`]+`)/g
      let last = 0
      let match
      while ((match = pattern.exec(rest))) {
        if (match.index > last) nodes.push(rest.slice(last, match.index))
        const token = match[0]
        if (token.startsWith('**')) nodes.push(h('strong', { key: key++ }, token.slice(2, -2)))
        else nodes.push(h('code', { key: key++, style: { background: C.layer2, padding: '1px 4px', borderRadius: 4, fontSize: 11.5 } }, token.slice(1, -1)))
        last = match.index + token.length
      }
      if (last < rest.length) nodes.push(rest.slice(last))
      return nodes
    }

    function Markdown(props) {
      const lines = String(props.text || '').split(/\r?\n/)
      const blocks = []
      let i = 0
      let key = 0
      while (i < lines.length) {
        const line = lines[i]
        if (/^```/.test(line)) {
          const code = []
          i++
          while (i < lines.length && !/^```/.test(lines[i])) { code.push(lines[i]); i++ }
          i++
          blocks.push(h('pre', {
            key: key++, style: {
              background: C.layer2, border: `1px solid ${C.border}`, borderRadius: 8,
              padding: 10, overflowX: 'auto', fontSize: 11.5, lineHeight: 1.6,
            },
          }, code.join('\n')))
          continue
        }
        if (/^\s*\|/.test(line) && /^\s*\|/.test(lines[i + 1] || '')) {
          const rows = []
          while (i < lines.length && /^\s*\|/.test(lines[i])) {
            rows.push(lines[i].trim().replace(/^\||\|$/g, '').split('|').map((s) => s.trim()))
            i++
          }
          const header = rows[0] || []
          const body = rows.slice(2)
          blocks.push(h('table', { key: key++, style: { ...S.table, margin: '8px 0' } },
            h('thead', null, h('tr', null, header.map((cell, idx) => h('th', { key: idx, style: S.th }, renderInline(cell))))),
            h('tbody', null, body.map((row, r) => h('tr', { key: r }, row.map((cell, c) => h('td', { key: c, style: S.td }, renderInline(cell)))))),
          ))
          continue
        }
        const heading = line.match(/^(#{1,4})\s+(.*)$/)
        if (heading) {
          const level = heading[1].length
          blocks.push(h(`h${Math.min(level + 1, 6)}`, {
            key: key++, style: {
              fontSize: level <= 2 ? 16 : 14, fontWeight: 650,
              margin: '16px 0 8px', color: C.text,
            },
          }, renderInline(heading[2])))
          i++
          continue
        }
        if (/^>\s?/.test(line)) {
          const quote = []
          while (i < lines.length && /^>\s?/.test(lines[i])) { quote.push(lines[i].replace(/^>\s?/, '')); i++ }
          blocks.push(h('div', {
            key: key++, style: {
              borderLeft: `3px solid ${C.brand}`, paddingLeft: 10, margin: '8px 0',
              color: C.muted, fontSize: 12, lineHeight: 1.7,
            },
          }, quote.map((q, idx) => h('div', { key: idx }, renderInline(q)))))
          continue
        }
        if (/^\s*[-*]\s+/.test(line)) {
          const list = []
          while (i < lines.length && /^\s*[-*]\s+/.test(lines[i])) { list.push(lines[i].replace(/^\s*[-*]\s+/, '')); i++ }
          blocks.push(h('ul', { key: key++, style: { margin: '6px 0', paddingLeft: 20, lineHeight: 1.8 } },
            list.map((item, idx) => h('li', { key: idx }, renderInline(item)))))
          continue
        }
        if (/^\s*---+\s*$/.test(line)) {
          blocks.push(h('hr', { key: key++, style: { border: 'none', borderTop: `1px solid ${C.border}`, margin: '14px 0' } }))
          i++
          continue
        }
        if (line.trim() === '') { i++; continue }
        const paragraph = []
        while (i < lines.length && lines[i].trim() !== '' && !/^(#{1,4})\s+/.test(lines[i]) && !/^```/.test(lines[i]) && !/^\s*\|/.test(lines[i]) && !/^\s*[-*]\s+/.test(lines[i])) {
          paragraph.push(lines[i]); i++
        }
        blocks.push(h('p', { key: key++, style: { margin: '8px 0', lineHeight: 1.75, fontSize: 12.5 } },
          renderInline(paragraph.join(' '))))
      }
      return h('div', null, blocks)
    }

    // ── 状态与数据 ───────────────────────────────────────────

    // ── 跨面板共享状态（主面板与右侧栏联动） ─────────────────

    /** 当前打开的项目与选中物品，供右侧栏等其它面板读取。 */
    const studioState = { projectPath: null, itemId: null }
    const studioListeners = new Set()
    let cachedSchema = null

    function getStudioState() {
      return studioState
    }

    function setStudioState(patch) {
      Object.assign(studioState, patch)
      for (const listener of [...studioListeners]) {
        try { listener() } catch { /* 监听器异常不影响主流程 */ }
      }
    }

    function subscribeStudioState(listener) {
      studioListeners.add(listener)
      return () => { studioListeners.delete(listener) }
    }

    function useStudioData() {
      const [boot, setBoot] = useState(null)
      const [error, setError] = useState('')
      const [busy, setBusy] = useState(false)
      const [project, setProject] = useState(null)
      const [assets, setAssets] = useState(null)

      const refreshBoot = useCallback(async () => {
        const data = await call('boot')
        setBoot(data)
        cachedSchema = data?.schema || null
        return data
      }, [])

      const open = useCallback(async (path) => {
        setBusy(true)
        setError('')
        try {
          const data = await call('project.open', { path })
          setProject(data)
          setStudioState({ projectPath: path, itemId: null })
          setAssets(await call('assets.list', { path }))
        } catch (err) {
          setError(err.message)
        } finally {
          setBusy(false)
        }
      }, [])

      useEffect(() => {
        refreshBoot().then((data) => {
          const first = data?.registry?.projects?.find((p) => !p.missing)
          if (first) open(first.path)
        }).catch((err) => setError(err.message))
      }, [refreshBoot, open])

      return { boot, setBoot, error, setError, busy, setBusy, project, setProject, assets, setAssets, refreshBoot, open }
    }

    // ── 项目页 ───────────────────────────────────────────────

    function ProjectTab(props) {
      const { boot, project, refreshBoot, open, setError } = props
      const [scanning, setScanning] = useState(null)
      const [scanError, setScanError] = useState('')
      const [root, setRoot] = useState(boot?.registry?.root || '')

      const projects = boot?.registry?.projects || []

      /** 已登记项目的路径集合（作为旧版扫描结果的兜底判断）。 */
      const importedPaths = useMemo(() => {
        const normalize = (value) => String(value || '').replace(/[\\/]+$/, '').toLowerCase()
        return new Set(projects.map((item) => normalize(item.path)))
      }, [projects])

      /**
       * 是否已导入：以项目目录内的 `.mcstudio/studio.json` 标记为准（由 Host 扫描时读出）；
       * 旧版返回没有 imported 字段时，退回注册表路径比较。
       */
      const isImported = (candidate) => {
        if (typeof candidate?.imported === 'boolean') return candidate.imported
        const normalize = (value) => String(value || '').replace(/[\\/]+$/, '').toLowerCase()
        return importedPaths.has(normalize(candidate?.path))
      }

      const scan = async () => {
        setScanError('')
        try {
          setScanning(await call('projects.scan', { root }))
        } catch (err) {
          setScanError(err.message)
        }
      }

      const addCandidate = async (candidate) => {
        try {
          await call('projects.add', { path: candidate.path })
          await refreshBoot()
          await open(candidate.path)
          setScanning(null)
        } catch (err) {
          setError(err.message)
        }
      }

      const importCandidate = (candidate) => {
        props.onImport(candidate)
      }

      const remove = async (path) => {
        if (!window.confirm('从列表中移除该项目？（不会删除任何文件）')) return
        await call('projects.remove', { path })
        await refreshBoot()
        if (project?.path === path) props.onCloseProject()
      }

      const saveRoot = async () => {
        try {
          await call('registry.setRoot', { root })
          await refreshBoot()
        } catch (err) {
          setError(err.message)
        }
      }

      return h('div', { style: { display: 'flex', flexDirection: 'column', gap: 16 } },
        h('div', { style: { ...S.card, display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' } },
          h('div', { style: { minWidth: 260 } },
            h('div', { style: S.sectionTitle }, '当前项目'),
            project
              ? h('div', { style: { display: 'flex', flexDirection: 'column', gap: 4 } },
                  h('div', { style: { fontSize: 16, fontWeight: 650 } }, project.meta.name),
                  h('div', { style: { ...S.hint, marginTop: 0 } },
                    `modid ${project.meta.modid} · ${project.meta.loader} · Minecraft ${project.meta.minecraft} · v${project.meta.version}`),
                  h('div', { style: { ...S.hint, marginTop: 2, wordBreak: 'break-all' } }, project.path),
                )
              : h('div', { style: { ...S.hint, marginTop: 0 } }, '尚未打开项目。请从下方列表选择，或新建/导入一个。'),
          ),
          h('div', { style: { display: 'flex', gap: 8, alignItems: 'flex-start' } },
            h('button', { style: S.btn(), onClick: props.onCreate }, '新建项目'),
            h('button', { style: S.btn(), onClick: props.onImportNew }, '导入已有工程'),
            project ? h('button', {
              style: S.btn(),
              onClick: async () => {
                try {
                  const result = await call('docs.export', { path: project.path })
                  window.alert(`已导出 ${result.files.length} 个文档到 docs/ 目录。`)
                } catch (err) { setError(err.message) }
              },
            }, '导出文档') : null,
          ),
        ),

        h('div', { style: S.card },
          h('div', { style: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 } },
            h('div', { style: S.sectionTitle }, `项目列表（${projects.length}）`),
            h('button', { style: S.btn('ghost'), onClick: async () => { await refreshBoot() } }, '刷新'),
          ),
          projects.length === 0
            ? h('div', { style: S.empty }, '还没有项目。点击「新建项目」或「导入已有工程」开始。')
            : h('table', { style: S.table },
                h('thead', null, h('tr', null,
                  h('th', { style: S.th }, '名称'),
                  h('th', { style: S.th }, 'modid'),
                  h('th', { style: S.th }, '加载器'),
                  h('th', { style: S.th }, '路径'),
                  h('th', { style: S.th }, ''),
                )),
                h('tbody', null, projects.map((item) => h('tr', { key: item.path },
                  h('td', { style: S.td },
                    h('div', { style: { fontWeight: 600 } }, item.name || '（未命名）'),
                    item.missing ? h('div', { style: { ...S.hint, marginTop: 2, color: C.danger } }, '目录不存在') : null,
                  ),
                  h('td', { style: S.td }, h('code', null, item.modid || '—')),
                  h('td', { style: S.td }, item.loader || '—'),
                  h('td', { style: { ...S.td, fontSize: 11.5, color: C.muted, wordBreak: 'break-all' } }, item.path),
                  h('td', { style: { ...S.td, whiteSpace: 'nowrap' } },
                    item.isStudio && !item.missing
                      ? h('button', { style: S.btn(), onClick: () => open(item.path) }, '打开')
                      : h('button', { style: S.btn(), onClick: () => props.onImport({ path: item.path }) }, '导入'),
                    h('button', { style: { ...S.btn('ghost'), marginLeft: 6, color: C.danger }, onClick: () => remove(item.path) }, '移除'),
                  ),
                ))),
              ),
        ),

        h('div', { style: S.card },
          h('div', { style: S.sectionTitle }, '扫描已有工程'),
          h('div', { style: { ...S.row, marginBottom: 8 } },
            h('div', { style: { flex: '1 1 320px' } }, h(TextInput, { value: root, onChange: setRoot, placeholder: '扫描根目录，例如 D:\\program' })),
            h('button', {
              style: S.btn(), onClick: async () => {
                const picked = await pickFolder()
                if (picked) setRoot(picked)
              },
            }, '浏览…'),
            h('button', { style: S.btn(), onClick: saveRoot }, '保存为默认根目录'),
            h('button', { style: S.btn(), onClick: scan }, '开始扫描'),
          ),
          scanError ? h('div', { style: { color: C.danger, fontSize: 12 } }, scanError) : null,
          scanning
            ? (scanning.candidates.length === 0
                ? h('div', { style: S.empty }, '该目录下没有发现模组工程或工坊项目。')
                : h('div', { style: { display: 'flex', flexDirection: 'column', gap: 6 } },
                    scanning.candidates.map((candidate) => {
                      const imported = isImported(candidate)
                      return h('div', {
                        key: candidate.path,
                        style: {
                          display: 'flex', alignItems: 'center', gap: 10, padding: '8px 10px',
                          border: `1px solid ${C.border}`, borderRadius: 8, background: C.layer2,
                          opacity: imported ? 0.86 : 1,
                        },
                      },
                        h('div', { style: { flex: 1, minWidth: 0 } },
                          h('div', { style: { display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' } },
                            h('span', { style: { fontWeight: 600 } }, candidate.name || candidate.path),
                            imported ? h('span', { style: S.badge('success') }, '已导入') : null,
                            candidate.isStudio && !imported
                              ? h('span', { style: S.badge('idle') }, '已有工坊数据')
                              : null,
                          ),
                          h('div', { style: { ...S.hint, marginTop: 2, wordBreak: 'break-all' } },
                            [
                              candidate.modid,
                              candidate.loader,
                              candidate.kind === 'studio' ? '工坊项目' : '模组工程',
                              imported && candidate.importedAt
                                ? `导入于 ${new Date(candidate.importedAt).toLocaleString('zh-CN')}`
                                : '',
                              imported && candidate.legacy ? '旧数据，打开后自动补标记' : '',
                            ].filter(Boolean).join(' · ')),
                        ),
                        imported
                          ? h('div', { style: { display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 } },
                              h('button', { style: S.btn('ghost'), onClick: () => open(candidate.path) }, '打开'))
                          : h('button', {
                              style: S.btn(),
                              onClick: () => (candidate.isStudio ? addCandidate(candidate) : importCandidate(candidate)),
                            }, '导入'),
                      )
                    }),
                  ))
            : null,
        ),
      )
    }

    // ── 功能页 ───────────────────────────────────────────────

    function FeaturesTab(props) {
      const { project, setProject, schema, setError } = props
      const [editing, setEditing] = useState(null)

      if (!project) return h('div', { style: S.empty }, '请先在「项目」中打开一个项目。')

      const features = project.features || []
      const statuses = schema.statuses
      const priorities = schema.priorities

      const save = async (feature) => {
        try {
          const result = await call('features.save', { path: project.path, feature })
          const next = features.filter((f) => f.id !== result.feature.id)
          next.push(result.feature)
          setProject({ ...project, features: next })
          setEditing(null)
        } catch (err) { setError(err.message) }
      }

      const remove = async (id) => {
        if (!window.confirm('删除这条功能记录？')) return
        try {
          const result = await call('features.delete', { path: project.path, id })
          setProject({ ...project, features: result.features })
        } catch (err) { setError(err.message) }
      }

      return h('div', { style: { display: 'flex', flexDirection: 'column', gap: 12 } },
        h('div', { style: S.row },
          h('div', { style: { ...S.sectionTitle, flex: 1 } }, `功能列表（${features.length}）`),
          h('button', { style: S.btn(), onClick: () => setEditing({ name: '', description: '', status: 'idea', priority: 'medium', version: '', notes: '' }) }, '新增功能'),
        ),
        features.length === 0
          ? h('div', { style: S.empty }, '还没有功能条目。先为模组列出要实现的功能，它们会参与文档导出。')
          : h('div', { style: { display: 'flex', flexDirection: 'column', gap: 8 } },
              features.map((feature) => h('div', {
                key: feature.id,
                style: { ...S.card, display: 'flex', gap: 12, alignItems: 'flex-start' },
              },
                h('div', { style: { flex: 1, minWidth: 0 } },
                  h('div', { style: { display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' } },
                    h('span', { style: { fontSize: 13.5, fontWeight: 650 } }, feature.name),
                    h('span', { style: S.badge(statuses.find((s) => s.id === feature.status)?.tone || 'idle') },
                      statuses.find((s) => s.id === feature.status)?.label || feature.status),
                    h('span', { style: S.badge('idle') }, `优先级 ${priorities.find((p) => p.id === feature.priority)?.label || feature.priority}`),
                    feature.version ? h('span', { style: S.badge('idle') }, feature.version) : null,
                  ),
                  feature.description ? h('div', { style: { ...S.hint, marginTop: 6, fontSize: 12 } }, feature.description) : null,
                  feature.notes ? h('div', { style: { ...S.hint, marginTop: 4, fontSize: 11.5 } }, `备注：${feature.notes}`) : null,
                ),
                h('div', { style: { display: 'flex', gap: 6, flexShrink: 0 } },
                  h('button', { style: S.btn('ghost'), onClick: () => setEditing(feature) }, '编辑'),
                  h('button', { style: { ...S.btn('ghost'), color: C.danger }, onClick: () => remove(feature.id) }, '删除'),
                ),
              )),
            ),
        editing ? h(FeatureEditor, {
          feature: editing,
          schema,
          onCancel: () => setEditing(null),
          onSave: save,
        }) : null,
      )
    }

    function FeatureEditor(props) {
      const [draft, setDraft] = useState(() => ({ ...props.feature }))
      const set = (key, value) => setDraft((prev) => ({ ...prev, [key]: value }))
      return h(Modal, {
        title: props.feature.id ? '编辑功能' : '新增功能',
        onClose: props.onCancel,
        footer: [
          h('button', { key: 'cancel', style: S.btn('ghost'), onClick: props.onCancel }, '取消'),
          h('button', { key: 'save', style: S.btn(), onClick: () => props.onSave(draft) }, '保存'),
        ],
      },
        h(Field, { label: '功能名称', required: true },
          h(TextInput, { value: draft.name, onChange: (v) => set('name', v), placeholder: '例如：红宝石系列工具' })),
        h(Field, { label: '功能说明' },
          h(Textarea, { value: draft.description, onChange: (v) => set('description', v), placeholder: '这个功能提供什么玩法？' })),
        h('div', { style: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 } },
          h(Field, { label: '状态' }, h(Select, {
            value: draft.status, onChange: (v) => set('status', v),
            options: props.schema.statuses.map((s) => ({ value: s.id, label: s.label })),
          })),
          h(Field, { label: '优先级' }, h(Select, {
            value: draft.priority, onChange: (v) => set('priority', v),
            options: props.schema.priorities.map((p) => ({ value: p.id, label: p.label })),
          })),
        ),
        h('div', { style: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 } },
          h(Field, { label: '目标版本' }, h(TextInput, { value: draft.version, onChange: (v) => set('version', v), placeholder: '例如 0.1.0' })),
          h(Field, { label: '关联物品（可选）' }, h(TextInput, {
            value: (draft.items || []).join(', '),
            onChange: (v) => set('items', v.split(',').map((s) => s.trim()).filter(Boolean)),
            placeholder: 'ruby, ruby_sword',
          })),
        ),
        h(Field, { label: '备注' }, h(Textarea, { value: draft.notes, onChange: (v) => set('notes', v) })),
      )
    }

    // ── 物品页 ───────────────────────────────────────────────

    /** 画布自动排布：每个物品的默认落点。 */
    const CANVAS_COLUMNS = 4
    const CANVAS_CELL_W = 172
    const CANVAS_CELL_H = 152

    function defaultSlot(index) {
      return {
        x: (index % CANVAS_COLUMNS) * CANVAS_CELL_W,
        y: Math.floor(index / CANVAS_COLUMNS) * CANVAS_CELL_H,
      }
    }

    function ItemsTab(props) {
      const { project, setProject, assets, schema, setError, reloadAssets } = props
      const [view, setView] = useState('list')
      const [query, setQuery] = useState('')
      const [editing, setEditing] = useState(null)
      const [images, setImages] = useState({})
      const [positions, setPositions] = useState({})
      const [drag, setDrag] = useState(null)
      const positionsRef = useRef({})
      const movedRef = useRef(false)

      const items = project?.items || []
      const filtered = useMemo(() => items.filter((item) => {
        if (!query.trim()) return true
        const q = query.trim().toLowerCase()
        return item.id.includes(q) || item.displayName.toLowerCase().includes(q)
      }), [items, query])

      useEffect(() => {
        if (!project) return
        let alive = true
        call('assets.readMany', { path: project.path, ids: items.map((i) => i.id) })
          .then((data) => { if (alive) setImages(data.images || {}) })
          .catch(() => {})
        return () => { alive = false }
      }, [project?.path, items.length])

      // 画布位置：首次出现时按顺序排布，之后保留用户拖动过的位置
      useEffect(() => {
        setPositions((prev) => {
          const next = { ...prev }
          let changed = false
          items.forEach((item, index) => {
            if (next[item.id]) return
            const placed = item.canvas && (item.canvas.x !== 0 || item.canvas.y !== 0)
            next[item.id] = placed ? { x: item.canvas.x, y: item.canvas.y } : defaultSlot(index)
            changed = true
          })
          return changed ? next : prev
        })
      }, [items])

      useEffect(() => { positionsRef.current = positions }, [positions])

      const persistPosition = async (id, position) => {
        const item = items.find((entry) => entry.id === id)
        if (!item) return
        try {
          const result = await call('items.save', { path: project.path, item: { ...item, canvas: position } })
          setProject({ ...project, items: items.map((entry) => (entry.id === id ? result.item : entry)) })
        } catch (err) {
          setError(err.message)
        }
      }

      // 拖动：在 window 上监听，避免指针移出卡片后丢失
      useEffect(() => {
        if (!drag) return
        const onMove = (event) => {
          const dx = event.clientX - drag.startX
          const dy = event.clientY - drag.startY
          if (Math.abs(dx) + Math.abs(dy) > 3) movedRef.current = true
          setPositions((prev) => ({
            ...prev,
            [drag.id]: { x: Math.max(0, drag.baseX + dx), y: Math.max(0, drag.baseY + dy) },
          }))
        }
        const onUp = () => {
          const position = positionsRef.current[drag.id]
          if (position) persistPosition(drag.id, position)
          setDrag(null)
        }
        window.addEventListener('pointermove', onMove)
        window.addEventListener('pointerup', onUp)
        return () => {
          window.removeEventListener('pointermove', onMove)
          window.removeEventListener('pointerup', onUp)
        }
      }, [drag])

      if (!project) return h('div', { style: S.empty }, '请先在「项目」中打开一个项目。')

      const saveItem = async (item) => {
        try {
          const result = await call('items.save', { path: project.path, item })
          const next = items.filter((i) => i.id !== result.item.id)
          next.push(result.item)
          setProject({ ...project, items: next })
          setEditing(null)
          reloadAssets()
        } catch (err) { setError(err.message) }
      }

      const removeItem = async (id) => {
        if (!window.confirm(`删除物品 ${id}？`)) return
        try {
          await call('items.delete', { path: project.path, id })
          setProject({ ...project, items: items.filter((i) => i.id !== id) })
          reloadAssets()
        } catch (err) { setError(err.message) }
      }

      const newItem = () => {
        const base = 'new_item'
        let id = base
        let index = 1
        while (items.some((i) => i.id === id)) id = `${base}_${index++}`
        setEditing({
          id, displayName: '新物品', type: 'item',
          properties: Object.fromEntries(schema.fields.map((f) => [f.key, Array.isArray(f.default) ? [...f.default] : f.default])),
          tags: [], description: '', notes: '', canvas: { x: 0, y: 0 },
        })
      }

      return h('div', { style: { display: 'flex', flexDirection: 'column', gap: 12 } },
        h('div', { style: { ...S.row } },
          h('div', { style: { flex: 1, minWidth: 180 } },
            h(TextInput, { value: query, onChange: setQuery, placeholder: '搜索注册名或显示名…' })),
          h('div', { style: { display: 'flex', border: `1px solid ${C.border}`, borderRadius: 8, overflow: 'hidden' } },
            h('button', {
              style: { ...S.btn('ghost'), borderRadius: 0, border: 'none', background: view === 'list' ? C.layer2 : 'transparent' },
              onClick: () => setView('list'),
            }, '列表'),
            h('button', {
              style: { ...S.btn('ghost'), borderRadius: 0, border: 'none', background: view === 'canvas' ? C.layer2 : 'transparent' },
              onClick: () => setView('canvas'),
            }, '画布'),
          ),
          h('button', { style: S.btn(), onClick: newItem }, '新建物品'),
        ),

        filtered.length === 0
          ? h('div', { style: S.empty }, items.length === 0 ? '还没有物品。新建一个物品，填写属性后会生成属性文档。' : '没有匹配的物品。')
          : view === 'list'
            ? h('div', { style: S.card, padding: 0, overflow: 'hidden' },
                h('table', { style: S.table },
                  h('thead', null, h('tr', null,
                    h('th', { style: S.th }, '贴图'),
                    h('th', { style: S.th }, '注册名'),
                    h('th', { style: S.th }, '显示名'),
                    h('th', { style: S.th }, '类型'),
                    h('th', { style: S.th }, '堆叠'),
                    h('th', { style: S.th }, '耐久'),
                    h('th', { style: S.th }, ''),
                  )),
                  h('tbody', null, filtered.map((item) => h('tr', { key: item.id },
                    h('td', { style: S.td },
                      images[item.id]
                        ? h('img', { src: images[item.id], width: 24, height: 24, style: { imageRendering: 'pixelated', borderRadius: 4, display: 'block' } })
                        : h('span', { style: { ...S.hint, marginTop: 0 } }, '—')),
                    h('td', { style: S.td }, h('code', null, item.id)),
                    h('td', { style: S.td }, item.displayName),
                    h('td', { style: S.td }, schema.types.find((t) => t.id === item.type)?.label || item.type),
                    h('td', { style: S.td }, String(item.properties.maxStackSize)),
                    h('td', { style: S.td }, item.properties.maxDamage > 0 ? String(item.properties.maxDamage) : '—'),
                    h('td', { style: { ...S.td, whiteSpace: 'nowrap' } },
                      h('button', { style: S.btn(), onClick: () => { setStudioState({ itemId: item.id }); setEditing(item) } }, '编辑'),
                      h('button', { style: { ...S.btn('ghost'), marginLeft: 6, color: C.danger }, onClick: () => removeItem(item.id) }, '删除'),
                    ),
                  ))),
                ),
              )
            : h('div', null,
                h('div', { style: { ...S.hint, marginTop: 0, marginBottom: 8 } },
                  '拖动卡片可自由排布，松开后自动保存位置；点击卡片编辑属性。'),
                h('div', {
                  style: {
                    position: 'relative',
                    minHeight: 420,
                    height: Math.max(420, ...Object.values(positions).map((p) => p.y + 176)),
                    border: `1px solid ${C.border}`,
                    borderRadius: 10,
                    backgroundColor: C.layer,
                    backgroundImage: `radial-gradient(circle, ${C.border} 1px, transparent 1px)`,
                    backgroundSize: '18px 18px',
                    overflow: 'auto',
                  },
                }, filtered.map((item) => {
                  const position = positions[item.id] || { x: 0, y: 0 }
                  const active = drag !== null && drag.id === item.id
                  return h('div', {
                    key: item.id,
                    style: {
                      ...S.card, position: 'absolute', left: position.x, top: position.y,
                      width: 152, padding: 10, cursor: active ? 'grabbing' : 'grab',
                      userSelect: 'none', zIndex: active ? 5 : 1,
                      display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6,
                      boxShadow: active ? '0 10px 26px rgba(0,0,0,0.35)' : 'none',
                    },
                    onPointerDown: (event) => {
                      event.preventDefault()
                      movedRef.current = false
                      setDrag({
                        id: item.id,
                        startX: event.clientX,
                        startY: event.clientY,
                        baseX: position.x,
                        baseY: position.y,
                      })
                    },
                    onClick: () => {
                      if (movedRef.current) {
                        movedRef.current = false
                        return
                      }
                      setStudioState({ itemId: item.id })
                      setEditing(item)
                    },
                  },
                    h('div', {
                      style: {
                        width: 64, height: 64, background: C.layer2, borderRadius: 8,
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        border: `1px solid ${C.border}`,
                      },
                    },
                      images[item.id]
                        ? h('img', { src: images[item.id], width: 48, height: 48, style: { imageRendering: 'pixelated' } })
                        : h('span', { style: { fontSize: 11, color: C.muted } }, '无贴图'),
                    ),
                    h('div', { style: { fontSize: 12.5, fontWeight: 600, textAlign: 'center', wordBreak: 'break-all' } }, item.displayName),
                    h('code', { style: { fontSize: 10.5, color: C.muted } }, item.id),
                    h('div', { style: { display: 'flex', gap: 4 } },
                      h('span', { style: S.badge('idle') }, schema.types.find((t) => t.id === item.type)?.label || item.type),
                      item.properties.maxStackSize === 1 ? h('span', { style: S.badge('warn') }, '不可堆叠') : null,
                    ),
                  )
                })),
              ),

        editing ? h(ItemEditor, {
          item: editing,
          schema,
          assets,
          project,
          images,
          onCancel: () => setEditing(null),
          onSave: saveItem,
          setError,
        }) : null,
      )
    }

    function ItemEditor(props) {
      const { schema, item, project, images, setError } = props
      const [draft, setDraft] = useState(() => JSON.parse(JSON.stringify(item)))
      const [uploading, setUploading] = useState(false)
      const fileRef = useRef(null)

      const set = (key, value) => setDraft((prev) => ({ ...prev, [key]: value }))
      const setProperty = (key, value) => setDraft((prev) => ({
        ...prev, properties: { ...prev.properties, [key]: value },
      }))

      const groups = useMemo(() => {
        const out = []
        for (const field of schema.fields) {
          if (!out.includes(field.group)) out.push(field.group)
        }
        return out
      }, [schema])

      const upload = async (file) => {
        if (!file) return
        setUploading(true)
        try {
          const buffer = await file.arrayBuffer()
          let binary = ''
          const bytes = new Uint8Array(buffer)
          for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i])
          await call('assets.upload', { path: project.path, id: draft.id, base64: btoa(binary) })
          props.onReload && props.onReload()
          setError('')
          window.alert('贴图已保存。')
        } catch (err) {
          setError(err.message)
        } finally {
          setUploading(false)
        }
      }

      return h(Modal, {
        title: item.id ? `编辑物品：${item.displayName}` : '新建物品',
        onClose: props.onCancel,
        footer: [
          h('button', { key: 'cancel', style: S.btn('ghost'), onClick: props.onCancel }, '取消'),
          h('button', { key: 'save', style: S.btn(), onClick: () => props.onSave(draft) }, '保存'),
        ],
      },
        h('div', { style: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 } },
          h(Field, { label: '注册名（id）', required: true, hint: '只能包含小写字母、数字和下划线' },
            h(TextInput, { value: draft.id, onChange: (v) => set('id', v.toLowerCase()) })),
          h(Field, { label: '显示名' },
            h(TextInput, { value: draft.displayName, onChange: (v) => set('displayName', v) })),
          h(Field, { label: '类型' }, h(Select, {
            value: draft.type, onChange: (v) => set('type', v),
            options: schema.types.map((t) => ({ value: t.id, label: t.label })),
          })),
          h(Field, { label: '贴图' },
            h('div', { style: { display: 'flex', gap: 10, alignItems: 'center' } },
              h('div', {
                style: {
                  width: 48, height: 48, borderRadius: 8, border: `1px solid ${C.border}`,
                  background: C.layer2, display: 'flex', alignItems: 'center', justifyContent: 'center',
                },
              },
                images[draft.id]
                  ? h('img', { src: images[draft.id], width: 40, height: 40, style: { imageRendering: 'pixelated' } })
                  : h('span', { style: { fontSize: 10, color: C.muted } }, '无'),
              ),
              h('button', { style: S.btn(), disabled: uploading, onClick: () => fileRef.current && fileRef.current.click() },
                uploading ? '上传中…' : '上传 PNG'),
              h('input', {
                ref: fileRef, type: 'file', accept: 'image/png', style: { display: 'none' },
                onChange: (e) => upload(e.target.files && e.target.files[0]),
              }),
            )),
        ),
        h(Field, { label: '描述' }, h(Textarea, { value: draft.description, onChange: (v) => set('description', v) })),

        groups.map((group) => h('div', { key: group, style: { marginTop: 14 } },
          h('div', { style: { ...S.sectionTitle, marginBottom: 6 } }, group),
          h('div', { style: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 10 } },
            schema.fields.filter((f) => f.group === group).map((field) => h(Field, {
              key: field.key, label: field.label, hint: field.hint,
            }, renderField(field, draft.properties[field.key], (v) => setProperty(field.key, v)))),
          ),
        )),

        h('div', { style: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginTop: 8 } },
          h(Field, { label: '自定义标签', hint: '逗号分隔，例如 minecraft:planks, c:gems' },
            h(TextInput, {
              value: (draft.tags || []).join(', '),
              onChange: (v) => set('tags', v.split(',').map((s) => s.trim()).filter(Boolean)),
            })),
          h(Field, { label: '备注' }, h(TextInput, { value: draft.notes, onChange: (v) => set('notes', v) })),
        ),
      )
    }

    function renderField(field, value, onChange) {
      if (field.type === 'number') {
        return h(NumberInput, { value, onChange, min: field.min, max: field.max, step: field.step })
      }
      if (field.type === 'boolean') {
        return h(Toggle, { value, onChange, label: '启用' })
      }
      if (field.type === 'select') {
        return h(Select, { value, onChange, options: field.options })
      }
      if (field.type === 'textarea') {
        return h(Textarea, { value, onChange })
      }
      if (field.type === 'tags') {
        return h(TagsInput, { value, onChange })
      }
      return h(TextInput, { value, onChange })
    }

    // ── 素材页 ───────────────────────────────────────────────

    function AssetsTab(props) {
      const { project, assets, reloadAssets, setError } = props
      const [modelEditing, setModelEditing] = useState(null)
      const [modelText, setModelText] = useState('')
      const [images, setImages] = useState({})
      const [modelError, setModelError] = useState('')

      useEffect(() => {
        if (!project) return
        let alive = true
        const ids = (assets?.textures || []).map((t) => t.id)
        if (ids.length === 0) { setImages({}); return }
        call('assets.readMany', { path: project.path, ids })
          .then((data) => { if (alive) setImages(data.images || {}) })
          .catch(() => {})
        return () => { alive = false }
      }, [project?.path, assets?.textures?.length])

      if (!project) return h('div', { style: S.empty }, '请先在「项目」中打开一个项目。')
      if (!assets) return h('div', { style: S.empty }, '正在读取素材…')

      const openModel = async (id) => {
        setModelError('')
        try {
          const data = await call('assets.model.get', { path: project.path, id })
          setModelText(data.text || JSON.stringify({ parent: 'minecraft:item/generated', textures: { layer0: `${assets.modid}:item/${id}` } }, null, 2))
          setModelEditing(id)
        } catch (err) { setError(err.message) }
      }

      const saveModel = async () => {
        setModelError('')
        try {
          await call('assets.model.save', { path: project.path, id: modelEditing, model: modelText })
          setModelEditing(null)
          await reloadAssets()
        } catch (err) { setModelError(err.message) }
      }

      const upload = async (id, file) => {
        if (!file) return
        try {
          const buffer = await file.arrayBuffer()
          let binary = ''
          const bytes = new Uint8Array(buffer)
          for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i])
          await call('assets.upload', { path: project.path, id, base64: btoa(binary) })
          await reloadAssets()
        } catch (err) { setError(err.message) }
      }

      const removeTexture = async (id) => {
        if (!window.confirm(`删除 ${id} 的贴图？`)) return
        try {
          await call('assets.delete', { path: project.path, id })
          await reloadAssets()
        } catch (err) { setError(err.message) }
      }

      const textureIds = new Set(assets.textures.map((t) => t.id))
      const modelIds = new Set(assets.models.map((m) => m.id))

      return h('div', { style: { display: 'flex', flexDirection: 'column', gap: 14 } },
        h('div', { style: { ...S.card, display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, flexWrap: 'wrap' } },
          h('div', null,
            h('div', { style: S.sectionTitle }, '素材目录'),
            h('div', { style: { ...S.hint, marginTop: 0, wordBreak: 'break-all' } }, assets.root),
            h('div', { style: { ...S.hint, marginTop: 2 } }, assets.standard ? '标准 gradle 资源路径' : '插件数据目录（项目还不是 gradle 工程）'),
          ),
          h('div', { style: { display: 'flex', gap: 8 } },
            h('span', { style: S.badge('idle') }, `贴图 ${assets.textures.length}`),
            h('span', { style: S.badge('idle') }, `模型 ${assets.models.length}`),
            assets.missing.length ? h('span', { style: S.badge('warn') }, `缺失 ${assets.missing.length}`) : null,
          ),
        ),

        h('div', { style: S.card },
          h('div', { style: S.sectionTitle }, '贴图'),
          h('div', { style: { display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(132px, 1fr))', gap: 10 } },
            (project.items || []).map((item) => h('div', {
              key: item.id,
              style: {
                border: `1px solid ${textureIds.has(item.id) ? C.border : C.warn}`,
                borderRadius: 9, padding: 8, background: C.layer2,
                display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6,
              },
            },
              h('div', {
                style: {
                  width: 64, height: 64, background: C.bg, borderRadius: 6,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  border: `1px solid ${C.border}`,
                },
              },
                images[item.id]
                  ? h('img', { src: images[item.id], width: 48, height: 48, style: { imageRendering: 'pixelated' } })
                  : h('span', { style: { fontSize: 10.5, color: C.muted } }, '缺失'),
              ),
              h('code', { style: { fontSize: 10.5, textAlign: 'center', wordBreak: 'break-all' } }, item.id),
              h('div', { style: { display: 'flex', gap: 4 } },
                h('button', { style: S.btn(), onClick: () => {
                  const input = document.createElement('input')
                  input.type = 'file'; input.accept = 'image/png'
                  input.onchange = (event) => upload(item.id, event.target.files && event.target.files[0])
                  input.click()
                } }, textureIds.has(item.id) ? '替换' : '上传'),
                textureIds.has(item.id) ? h('button', {
                  style: { ...S.btn('ghost'), color: C.danger }, onClick: () => removeTexture(item.id),
                }, '删除') : null,
              ),
            )),
          ),
          (project.items || []).length === 0 ? h('div', { style: S.empty }, '还没有物品，先去「物品」页新建。') : null,
        ),

        h('div', { style: S.card },
          h('div', { style: S.sectionTitle }, '模型'),
          assets.models.length === 0
            ? h('div', { style: S.empty }, '还没有模型。新建物品时会自动生成 item/generated 模型。')
            : h('div', { style: { display: 'flex', flexDirection: 'column', gap: 6 } },
                assets.models.map((model) => h('div', {
                  key: model.id,
                  style: {
                    display: 'flex', alignItems: 'center', gap: 10, padding: '8px 10px',
                    border: `1px solid ${C.border}`, borderRadius: 8,
                  },
                },
                  h('code', { style: { fontSize: 12, flex: 1 } }, model.id),
                  h('span', { style: { ...S.hint, marginTop: 0, fontSize: 11 } }, model.parent || '无父模型'),
                  h('button', { style: S.btn(), onClick: () => openModel(model.id) }, '编辑 JSON'),
                )),
              ),
          h('div', { style: { ...S.hint, marginTop: 8 } }, '没有模型但已有贴图的物品会显示在「缺失」计数中。'),
        ),

        modelEditing ? h(Modal, {
          title: `模型：${modelEditing}`,
          onClose: () => setModelEditing(null),
          footer: [
            h('button', { key: 'cancel', style: S.btn('ghost'), onClick: () => setModelEditing(null) }, '取消'),
            h('button', { key: 'save', style: S.btn(), onClick: saveModel }, '保存'),
          ],
        },
          modelError ? h('div', { style: { color: C.danger, fontSize: 12, marginBottom: 8 } }, modelError) : null,
          h('textarea', {
            value: modelText,
            onChange: (e) => setModelText(e.target.value),
            spellCheck: false,
            style: {
              ...S.input, minHeight: 320, fontFamily: 'ui-monospace, Consolas, monospace',
              fontSize: 12, lineHeight: 1.6,
            },
          }),
        ) : null,
      )
    }

    // ── 教程页 ───────────────────────────────────────────────

    function GuideTab(props) {
      return h('div', { style: S.card },
        props.guide
          ? h(Markdown, { text: props.guide })
          : h('div', { style: S.empty }, '构建教程缺失：插件 docs/BUILD-GUIDE.md 尚未生成。'),
      )
    }

    // ── 主页面 ───────────────────────────────────────────────

    function StudioPage() {
      const data = useStudioData()
      const { boot, project, assets, setProject, setAssets, error, setError, busy, refreshBoot, open } = data
      const [tab, setTab] = useState('project')
      const [createOpen, setCreateOpen] = useState(false)
      const [importTarget, setImportTarget] = useState(null)

      const reloadAssets = useCallback(async () => {
        if (!project) return
        try {
          setAssets(await call('assets.list', { path: project.path }))
        } catch (err) { setError(err.message) }
      }, [project, setAssets, setError])

      const tabs = [
        { id: 'project', label: '项目' },
        { id: 'features', label: '功能列表' },
        { id: 'items', label: '物品' },
        { id: 'assets', label: '贴图与模型' },
        { id: 'guide', label: '构建教程' },
      ]

      return h('div', { className: 'mcmods-root', style: S.page },
        h('div', { style: S.header },
          h(Icon, { size: 26, active: true }),
          h('div', null,
            h('div', { style: S.title }, '模组工坊'),
            h('div', { style: S.subtitle },
              project
                ? `${project.meta.name} · ${project.meta.modid} · ${project.meta.loader} · MC ${project.meta.minecraft}`
                : `Minecraft 1.20.1 · Forge / NeoForge / Fabric`),
          ),
          h('div', { style: { flex: 1 } }),
          busy ? h('span', { style: S.badge('idle') }, '处理中…') : null,
          project ? h('button', {
            style: S.btn('ghost'),
            onClick: async () => {
              const result = await call('docs.export', { path: project.path })
              window.alert(`已导出 ${result.files.length} 个文档到 docs/。`)
            },
          }, '导出文档') : null,
        ),

        h(Tabs, { tabs, value: tab, onChange: setTab }),

        error ? h('div', {
          style: {
            margin: '10px 18px 0', padding: '8px 12px', borderRadius: 8,
            border: `1px solid ${C.danger}`, color: C.danger, fontSize: 12,
            display: 'flex', justifyContent: 'space-between', gap: 10,
          },
        },
          h('span', null, error),
          h('span', { style: { cursor: 'pointer' }, onClick: () => setError('') }, '×'),
        ) : null,

        h('div', { style: S.body },
          !boot
            ? h('div', { style: S.empty }, '正在加载…')
            : tab === 'project'
              ? h(ProjectTab, {
                  boot, project, refreshBoot, open, setError,
                  onCreate: () => setCreateOpen(true),
                  onImportNew: () => setImportTarget({ path: '', name: '', modid: '' }),
                  onImport: (candidate) => setImportTarget(candidate),
                  onCloseProject: () => { setProject(null); setAssets(null); setStudioState({ projectPath: null, itemId: null }) },
                })
              : tab === 'features'
                ? h(FeaturesTab, { project, setProject, schema: boot.schema, setError })
                : tab === 'items'
                  ? h(ItemsTab, { project, setProject, assets, schema: boot.schema, setError, reloadAssets })
                  : tab === 'assets'
                    ? h(AssetsTab, { project, assets, reloadAssets, setError })
                    : h(GuideTab, { guide: boot.guide }),
        ),

        createOpen ? h(CreateProjectModal, {
          defaultRoot: boot ? boot.registry.root : '',
          onClose: () => setCreateOpen(false),
          onCreated: async (path) => {
            setCreateOpen(false)
            await refreshBoot()
            await open(path)
            setTab('project')
          },
          setError,
        }) : null,

        importTarget ? h(ImportProjectModal, {
          candidate: importTarget,
          onClose: () => setImportTarget(null),
          onImported: async (path) => {
            setImportTarget(null)
            await refreshBoot()
            await open(path)
            setTab('project')
          },
          setError,
        }) : null,
      )
    }

    // ── 目录选择 ─────────────────────────────────────────────

    /** 客户端上下文（由 apply 注入），用于调用 uiWorkspace 等客户端服务。 */
    let appCtx = null

    /** 调起 DSH 原生目录选择器；用户取消或服务不可用时返回 null。 */
    async function pickFolder() {
      try {
        const workspace = appCtx && typeof appCtx.get === 'function' ? appCtx.get('uiWorkspace') : null
        if (!workspace || typeof workspace.pickDirectory !== 'function') return null
        const picked = await workspace.pickDirectory()
        return typeof picked === 'string' && picked ? picked : null
      } catch {
        return null
      }
    }

    /** 路径输入框 + 「浏览…」按钮：手动填写与目录选择器两用。 */
    function PathField(props) {
      const [picking, setPicking] = useState(false)
      const [note, setNote] = useState('')
      const browse = async () => {
        setPicking(true)
        setNote('')
        try {
          const picked = await pickFolder()
          if (picked) props.onChange(picked)
          else setNote('没有选择目录，或当前环境不支持目录选择器，请手动填写路径')
        } finally {
          setPicking(false)
        }
      }
      return h(Field, { label: props.label, required: props.required, hint: props.hint },
        h('div', { style: { display: 'flex', flexDirection: 'column', gap: 6 } },
          h('div', { style: { display: 'flex', gap: 8, alignItems: 'center' } },
            h('div', { style: { flex: 1, minWidth: 0 } },
              h(TextInput, { value: props.value, onChange: props.onChange, placeholder: props.placeholder })),
            h('button', {
              type: 'button',
              style: { ...S.btn(), whiteSpace: 'nowrap', flexShrink: 0 },
              disabled: picking,
              onClick: browse,
            }, picking ? '选择中…' : '浏览…'),
          ),
          note ? h('div', { style: { fontSize: 11, color: C.danger } }, note) : null,
        ))
    }

    function CreateProjectModal(props) {
      const [draft, setDraft] = useState({
        path: props.defaultRoot ? `${props.defaultRoot}\\my-mod` : '',
        name: '我的模组', modid: 'mymod', version: '0.1.0', loader: 'neoforge', description: '',
      })
      const [submitting, setSubmitting] = useState(false)
      const set = (key, value) => setDraft((prev) => ({ ...prev, [key]: value }))
      const submit = async () => {
        setSubmitting(true)
        try {
          const project = await call('project.create', draft)
          props.onCreated(project.path)
        } catch (err) {
          props.setError(err.message)
        } finally {
          setSubmitting(false)
        }
      }
      return h(Modal, {
        title: '新建模组项目',
        onClose: props.onClose,
        footer: [
          h('button', { key: 'cancel', style: S.btn('ghost'), onClick: props.onClose }, '取消'),
          h('button', { key: 'ok', style: S.btn(), disabled: submitting, onClick: submit }, submitting ? '创建中…' : '创建'),
        ],
      },
        h(PathField, {
          label: '项目目录', required: true,
          hint: '任意目录都可以作为项目目录；须为空目录或尚不存在的路径。可点「浏览…」选择文件夹',
          value: draft.path, onChange: (v) => set('path', v),
          placeholder: '例如 D:\\program\\my-mod',
        }),
        h('div', { style: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 } },
          h(Field, { label: '项目名称' }, h(TextInput, { value: draft.name, onChange: (v) => set('name', v) })),
          h(Field, { label: 'modid', required: true }, h(TextInput, { value: draft.modid, onChange: (v) => set('modid', v.toLowerCase()) })),
          h(Field, { label: '初始版本' }, h(TextInput, { value: draft.version, onChange: (v) => set('version', v) })),
          h(Field, { label: '加载器' }, h(Select, {
            value: draft.loader, onChange: (v) => set('loader', v),
            options: [
              { value: 'forge', label: 'Forge' },
              { value: 'neoforge', label: 'NeoForge' },
              { value: 'fabric', label: 'Fabric' },
            ],
          })),
        ),
        h(Field, { label: '描述' }, h(Textarea, { value: draft.description, onChange: (v) => set('description', v) })),
        h('div', { style: S.hint }, '目标版本固定为 Minecraft 1.20.1。插件只创建设计与文档目录，不生成 gradle 工程。'),
      )
    }

    function ImportProjectModal(props) {
      const [draft, setDraft] = useState({
        path: props.candidate.path || '',
        name: props.candidate.name || '',
        modid: props.candidate.modid || '',
        version: '',
      })
      const [submitting, setSubmitting] = useState(false)
      const set = (key, value) => setDraft((prev) => ({ ...prev, [key]: value }))
      const submit = async () => {
        setSubmitting(true)
        try {
          const project = await call('project.import', draft)
          props.onImported(project.path)
        } catch (err) {
          props.setError(err.message)
        } finally {
          setSubmitting(false)
        }
      }
      return h(Modal, {
        title: '导入已有模组工程',
        onClose: props.onClose,
        footer: [
          h('button', { key: 'cancel', style: S.btn('ghost'), onClick: props.onClose }, '取消'),
          h('button', { key: 'ok', style: S.btn(), disabled: submitting, onClick: submit }, submitting ? '导入中…' : '导入'),
        ],
      },
        h(PathField, {
          label: '工程目录', required: true,
          hint: '读取 fabric.mod.json / mods.toml / 构建脚本，扫描贴图、模型与 Java 注册名；可点「浏览…」选择文件夹',
          value: draft.path, onChange: (v) => set('path', v),
          placeholder: '例如 D:\\program\\my-mod',
        }),
        h('div', { style: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 } },
          h(Field, { label: '项目名称' }, h(TextInput, { value: draft.name, onChange: (v) => set('name', v) })),
          h(Field, { label: 'modid', required: true, hint: '识别不到描述文件时必须手动填写' },
            h(TextInput, { value: draft.modid, onChange: (v) => set('modid', v.toLowerCase()) })),
          h(Field, { label: '版本' }, h(TextInput, { value: draft.version, onChange: (v) => set('version', v) })),
        ),
        h('div', { style: S.hint }, '导入会在工程目录写入 .mcstudio/ 数据与 docs/mcstudio-snapshot.md 快照，不会修改 Java 或 gradle 文件。'),
      )
    }

    // ── 右侧栏面板 ───────────────────────────────────────────

    const LOADER_LABELS = { forge: 'Forge', neoforge: 'NeoForge', fabric: 'Fabric' }

    /** 一行「标签 — 值」。 */
    function InfoRow(props) {
      return h('div', {
        style: {
          display: 'flex', justifyContent: 'space-between', gap: 12,
          padding: '4px 0', fontSize: 12.5, borderBottom: `1px solid ${C.border}`,
        },
      },
        h('span', { style: { color: C.muted, flexShrink: 0 } }, props.label),
        h('span', { style: { textAlign: 'right', wordBreak: 'break-all' } }, props.value),
      )
    }

    /** 右侧栏「模组工坊」标签：项目概览 + 选中物品属性。 */
    function SidebarStudioPanel() {
      const [state, setState] = useState({ ...getStudioState() })
      const [data, setData] = useState(null)
      const [error, setError] = useState('')

      useEffect(() => subscribeStudioState(() => setState({ ...getStudioState() })), [])

      useEffect(() => {
        const path = state.projectPath
        if (!path) {
          setData(null)
          setError('')
          return
        }
        let alive = true
        call('project.open', { path })
          .then((result) => {
            if (!alive) return
            setData(result)
            setError('')
          })
          .catch((err) => {
            if (!alive) return
            setData(null)
            setError(err.message)
          })
        return () => { alive = false }
      }, [state.projectPath])

      const meta = data?.meta || null
      const items = data?.items || []
      const features = data?.features || []
      const item = state.itemId ? items.find((entry) => entry.id === state.itemId) : null
      const typeLabel = item
        ? (cachedSchema?.types?.find((type) => type.id === item.type)?.label || item.type)
        : ''
      const properties = item?.properties || {}
      const statusCount = features.filter((f) => f.status === 'done').length

      return h('div', {
        className: 'mcmods-root',
        style: {
          display: 'flex', flexDirection: 'column', height: '100%', minHeight: 0,
          background: C.bg, color: C.text,
        },
      },
        h('div', { style: { ...S.header, padding: '10px 14px' } },
          h('div', { style: { minWidth: 0 } },
            h('div', { style: S.title }, '模组工坊'),
            h('div', { style: { ...S.subtitle, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' } },
              meta ? meta.name : 'Minecraft 1.20.1'),
          ),
        ),
        h('div', { style: { ...S.body, padding: '12px 14px 28px' } },
          error ? h('div', { style: { ...S.hint, color: C.danger, marginBottom: 8 } }, error) : null,
          !state.projectPath
            ? h('div', { style: S.empty }, '还没有打开项目。', h('br'), '在左侧「模组工坊」页面新建或打开一个项目。')
            : !meta
              ? h('div', { style: S.empty }, error ? '读取失败' : '读取中…')
              : h('div', { style: { display: 'flex', flexDirection: 'column', gap: 12 } },
                  h('div', { style: S.card },
                    h('div', { style: S.sectionTitle }, '项目概览'),
                    h(InfoRow, { label: '名称', value: meta.name }),
                    h(InfoRow, { label: 'modid', value: meta.modid }),
                    h(InfoRow, { label: '加载器', value: LOADER_LABELS[meta.loader] || meta.loader }),
                    h(InfoRow, { label: '版本', value: meta.version || '—' }),
                    h(InfoRow, { label: '物品', value: `${items.length} 个` }),
                    h(InfoRow, { label: '功能', value: `${features.length} 项（已完成 ${statusCount}）` }),
                  ),
                  item
                    ? h('div', { style: S.card },
                        h('div', { style: { ...S.row, justifyContent: 'space-between', marginBottom: 6 } },
                          h('div', { style: S.sectionTitle }, item.displayName),
                          h('span', { style: S.badge('idle') }, typeLabel),
                        ),
                        h(InfoRow, { label: 'ID', value: item.id }),
                        h(InfoRow, { label: '最大堆叠', value: String(properties.maxStackSize ?? '—') }),
                        properties.maxDamage > 0
                          ? h(InfoRow, { label: '耐久', value: String(properties.maxDamage) })
                          : null,
                        item.canvas
                          ? h(InfoRow, { label: '画布坐标', value: `${item.canvas.x}, ${item.canvas.y}` })
                          : null,
                        item.tags && item.tags.length
                          ? h(InfoRow, { label: '标签', value: item.tags.join('、') })
                          : null,
                        item.description
                          ? h('div', { style: { ...S.hint, marginTop: 8 } }, item.description)
                          : null,
                      )
                    : h('div', { style: S.empty }, '在主面板的物品列表或画布中点选一个物品，这里会显示它的属性。'),
                ),
        ),
      )
    }

    // ── 注册 ─────────────────────────────────────────────────

    return {
      inject: ['slots'],
      apply(ctx) {
        appCtx = ctx
        ensureStyles()
        const slots = ctx.slots || ctx.get('slots')
        if (!slots) return

        slots.inject('main', () => slots.register({ name: 'main', key: KEY }, StudioPage))

        // 侧栏图标区（与「上下文洞察」同一区域）
        slots.inject('sidebar.panellist', () => slots.register({
          name: 'sidebar.panellist', id: KEY, order: 2, label: '模组工坊',
        }, Icon))

        // 右侧栏标签：项目概览与选中物品属性
        ctx.inject(['sidebarRightTabs'], (sub) => {
          const disposers = []
          const keep = (value) => { if (typeof value === 'function') disposers.push(value) }
          try {
            const tabs = sub.sidebarRightTabs
            if (!tabs || typeof tabs.register !== 'function') return
            keep(tabs.register({
              id: KEY,
              kind: KEY,
              title: () => '模组工坊',
              guide: [{
                order: 30,
                title: () => '模组工坊',
                description: () => '项目概览与选中物品的属性',
                icon: Icon,
              }],
            }))
            keep(sub.slots.inject('sidebar.right.pane.tab', () => sub.slots.register({
              name: 'sidebar.right.pane.tab', key: KEY,
            }, SidebarStudioPanel)))
          } catch {
            for (const dispose of disposers) dispose()
            return
          }
          return () => { for (const dispose of disposers) dispose() }
        })
      },
    }
  },
})
