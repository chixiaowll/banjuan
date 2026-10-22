import React, { forwardRef } from 'react'
import { Square, Circle, MoveUpRight, Pencil, Highlighter, Type, Grid3x3, Undo2, Redo2, Pin, Download, FileInput, X, Check } from 'lucide-react'
import { useT, type MessageKey } from '@banjuan/shared-ui/src/i18n/index.js'
import { COLORS, WIDTHS, FONT_SIZES, type ShapeStyle, type ToolKind } from './shapes.js'

const TOOLS: Array<{ kind: ToolKind; label: MessageKey; icon: React.ReactNode }> = [
  { kind: 'rect', label: 'screenshot.toolRect', icon: <Square size={16} /> },
  { kind: 'ellipse', label: 'screenshot.toolEllipse', icon: <Circle size={16} /> },
  { kind: 'arrow', label: 'screenshot.toolArrow', icon: <MoveUpRight size={16} /> },
  { kind: 'pen', label: 'screenshot.toolPen', icon: <Pencil size={16} /> },
  { kind: 'highlighter', label: 'screenshot.toolHighlighter', icon: <Highlighter size={16} /> },
  { kind: 'text', label: 'screenshot.toolText', icon: <Type size={16} /> },
  { kind: 'mosaic', label: 'screenshot.toolMosaic', icon: <Grid3x3 size={16} /> },
  { kind: 'number', label: 'screenshot.toolNumber', icon: <span style={{ fontSize: 14, lineHeight: '16px' }}>①</span> },
]

export interface ToolbarProps {
  tool: ToolKind | null
  onTool: (t: ToolKind | null) => void
  style: ShapeStyle
  onStyle: (s: ShapeStyle) => void
  /** Style panel shown for this kind (the active tool, or the selected shape); null hides it. */
  styleFor: ToolKind | null
  canUndo: boolean
  canRedo: boolean
  onUndo: () => void
  onRedo: () => void
  canInsert: boolean
  onAction: (a: 'pin' | 'save' | 'insert' | 'copy') => void
  onCancel: () => void
  busy: boolean
}

const btn = (active: boolean, disabled = false): React.CSSProperties => ({
  width: 30, height: 30, display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
  border: 'none', borderRadius: 6, cursor: disabled ? 'default' : 'pointer', padding: 0,
  background: active ? '#e8f0fe' : 'transparent', color: disabled ? '#bbb' : active ? '#1a73e8' : '#333',
})
const divider = <div style={{ width: 1, alignSelf: 'stretch', margin: '4px 2px', background: '#e5e5e5' }} />

/** Tools | undo redo | pin save insert | cancel done — with the style panel underneath when relevant. */
export const Toolbar = forwardRef<HTMLDivElement, ToolbarProps>(function Toolbar(p, ref) {
  const t = useT()
  return (
    <div ref={ref} onPointerDown={e => e.stopPropagation()} onDoubleClick={e => e.stopPropagation()}
      style={{ background: '#fff', borderRadius: 8, boxShadow: '0 2px 12px rgba(0,0,0,0.25)', padding: 4, font: '12px -apple-system, sans-serif' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 2 }}>
        {TOOLS.map(x => (
          <button key={x.kind} title={t(x.label)} style={btn(p.tool === x.kind)} onClick={() => p.onTool(p.tool === x.kind ? null : x.kind)}>{x.icon}</button>
        ))}
        {divider}
        <button title={t('screenshot.undo')} style={btn(false, !p.canUndo)} disabled={!p.canUndo} onClick={p.onUndo}><Undo2 size={16} /></button>
        <button title={t('screenshot.redo')} style={btn(false, !p.canRedo)} disabled={!p.canRedo} onClick={p.onRedo}><Redo2 size={16} /></button>
        {divider}
        <button title={t('screenshot.pin')} style={btn(false, p.busy)} disabled={p.busy} onClick={() => p.onAction('pin')}><Pin size={16} /></button>
        <button title={t('screenshot.save')} style={btn(false, p.busy)} disabled={p.busy} onClick={() => p.onAction('save')}><Download size={16} /></button>
        <button title={p.canInsert ? t('screenshot.insertNote') : t('screenshot.insertUnavailable')} style={btn(false, !p.canInsert || p.busy)}
          disabled={!p.canInsert || p.busy} onClick={() => p.onAction('insert')}><FileInput size={16} /></button>
        {divider}
        <button title={t('screenshot.cancel')} style={btn(false)} onClick={p.onCancel}><X size={16} /></button>
        <button title={t('screenshot.done')} style={{ ...btn(false, p.busy), background: '#1a73e8', color: '#fff' }} disabled={p.busy} onClick={() => p.onAction('copy')}><Check size={16} /></button>
      </div>
      {p.styleFor && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '6px 4px 2px', borderTop: '1px solid #eee', marginTop: 4 }}>
          {p.styleFor === 'text'
            ? FONT_SIZES.map((s, i) => (
                <button key={s} title={t('screenshot.fontSize')} style={{ ...btn(p.style.fontSize === s), width: 26, height: 22, fontSize: 11 + i * 2 }} onClick={() => p.onStyle({ ...p.style, fontSize: s })}>A</button>
              ))
            : WIDTHS.map(w => (
                <button key={w} title={t('screenshot.size')} style={{ ...btn(p.style.width === w), width: 26, height: 22 }} onClick={() => p.onStyle({ ...p.style, width: w })}>
                  <span style={{ width: w + 3, height: w + 3, borderRadius: '50%', background: '#333' }} />
                </button>
              ))}
          <div style={{ width: 1, height: 16, background: '#e5e5e5', margin: '0 2px' }} />
          {COLORS.map(c => (
            <button key={c} title={t('screenshot.color')} onClick={() => p.onStyle({ ...p.style, color: c })}
              style={{ width: 18, height: 18, borderRadius: 4, cursor: 'pointer', padding: 0, background: c, border: p.style.color === c ? '2px solid #1a73e8' : '1px solid #ccc' }} />
          ))}
        </div>
      )}
    </div>
  )
})
