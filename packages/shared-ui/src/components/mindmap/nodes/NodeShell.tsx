import React, { useRef, useEffect, useState, useCallback } from 'react'
import { MoreHorizontal } from 'lucide-react'
import { Handle, Position } from '@xyflow/react'
import { motion } from 'framer-motion'
import type { MindmapNodeData } from '../useMindmapStore.js'
import { useMindmapStore } from '../useMindmapStore.js'
import { useNodeSizeStore } from '../useNodeSizeStore.js'
import { getTheme, getNodeStyleForLevel } from '../themes.js'
import type { ShapeName } from '../shapes.js'
import BlockPreview from '../../notes/BlockPreview.js'

function hasBlockContent(content: string | undefined | null): boolean {
  if (!content) return false
  try {
    const blocks = JSON.parse(content)
    if (!Array.isArray(blocks)) return false
    return blocks.some((b: any) => {
      if (b.content?.length > 0) return true
      if (b.type && b.type !== 'paragraph') return true
      return false
    })
  } catch {
    return false
  }
}

interface Props {
  id: string
  data: MindmapNodeData
  selected: boolean
  icon?: string
  accentColor?: string
  children: React.ReactNode
}

export default function NodeShell({ id, data, selected, icon, accentColor, children }: Props) {
  const containerRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLTextAreaElement>(null)
  const editStartedRef = useRef(0)
  const { editingNodeId, setEditingNodeId, updateNodeData, theme: themeName, dropTarget } = useMindmapStore()
  const setNodeSize = useNodeSizeStore(s => s.setNodeSize)
  const [editValue, setEditValue] = useState(data.title)
  const isEditing = editingNodeId === id

  const theme = getTheme(themeName)
  const isFloatingRoot = data.floating && !data.parentId
  const levelStyle = getNodeStyleForLevel(theme, data.depth, isFloatingRoot)
  const shape = (data.shape ?? levelStyle.shape) as ShapeName
  const fill = data.color ?? levelStyle.fill
  const isUnderline = shape === 'underline'

  useEffect(() => {
    const el = containerRef.current
    if (!el) return
    const measure = () => {
      const w = el.offsetWidth
      const h = el.offsetHeight
      if (w > 0 && h > 0) {
        setNodeSize(id, w, h)
      }
    }
    measure()
    const ro = new ResizeObserver(measure)
    ro.observe(el)
    return () => ro.disconnect()
  }, [id, data.title, data.collapsed, data.content, isEditing, setNodeSize])

  useEffect(() => {
    setEditValue(data.title)
  }, [data.title])

  useEffect(() => {
    if (isEditing) {
      editStartedRef.current = Date.now()
      requestAnimationFrame(() => {
        inputRef.current?.focus()
        inputRef.current?.select()
      })
    }
  }, [isEditing])

  const handleDoubleClick = useCallback((e: React.MouseEvent) => {
    e.stopPropagation()
    if (!isEditing) setEditingNodeId(id)
  }, [id, isEditing, setEditingNodeId])

  const handleEditKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      updateNodeData(id, { title: editValue })
      setEditingNodeId(null)
    } else if (e.key === 'Escape') {
      setEditValue(data.title)
      setEditingNodeId(null)
    }
  }, [id, editValue, data.title, updateNodeData, setEditingNodeId])

  const handleEditBlur = useCallback(() => {
    if (Date.now() - editStartedRef.current < 200) return
    updateNodeData(id, { title: editValue })
    setEditingNodeId(null)
  }, [id, editValue, updateNodeData, setEditingNodeId])

  const isDropInside = dropTarget?.nodeId === id && dropTarget?.position === 'inside'
  const isDropBefore = dropTarget?.nodeId === id && dropTarget?.position === 'before'
  const isDropAfter = dropTarget?.nodeId === id && dropTarget?.position === 'after'

  const borderColor = isDropInside ? '#3182ce' : selected ? '#4A90D9' : (accentColor ?? levelStyle.stroke)
  const borderWidth = isDropInside ? 2 : selected ? 2 : 1
  const radius = isUnderline ? 0 : (levelStyle.borderRadius ?? 8)
  const hasContent = hasBlockContent(data.content)

  const containerStyle: React.CSSProperties = {
    background: isDropInside ? 'rgba(49,130,206,0.08)' : isUnderline ? 'transparent' : fill,
    border: 'none',
    borderBottom: isUnderline ? `2px solid ${levelStyle.stroke}` : undefined,
    borderRadius: radius,
    outline: isUnderline ? 'none' : `${borderWidth}px solid ${borderColor}`,
    outlineOffset: -borderWidth,
    padding: `${levelStyle.padding.y}px ${levelStyle.padding.x}px`,
    fontSize: levelStyle.fontSize,
    fontWeight: levelStyle.fontWeight,
    color: levelStyle.color,
    boxShadow: levelStyle.shadow,
    borderLeft: isFloatingRoot ? `3px solid ${levelStyle.stroke}` : undefined,
    display: 'flex',
    flexDirection: hasContent ? 'column' : 'row',
    alignItems: hasContent ? 'flex-start' : 'center',
    gap: hasContent ? 4 : 6,
    cursor: 'pointer',
    minWidth: 60,
    width: hasContent ? 420 : 'max-content',
    maxHeight: hasContent ? 260 : undefined,
    overflow: hasContent ? 'hidden' : undefined,
    whiteSpace: hasContent ? 'normal' : 'pre',
  }

  const dropLineStyle: React.CSSProperties = {
    position: 'absolute',
    left: 0,
    right: 0,
    height: 2,
    background: '#3182ce',
    borderRadius: 1,
    pointerEvents: 'none',
  }

  return (
    <motion.div
      ref={containerRef}
      style={{ ...containerStyle, position: 'relative' }}
      onDoubleClick={handleDoubleClick}
      initial={false}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.2, ease: 'easeOut' }}
    >
      {isDropBefore && <div style={{ ...dropLineStyle, top: -4 }} />}
      {isDropAfter && <div style={{ ...dropLineStyle, bottom: -4 }} />}
      <Handle type="target" id="target-left" position={Position.Left} style={{ opacity: 0, width: 1, height: 1 }} />
      <Handle type="target" id="target-right" position={Position.Right} style={{ opacity: 0, width: 1, height: 1 }} />
      <Handle type="source" id="source-left" position={Position.Left} style={{ opacity: 0, width: 1, height: 1 }} />

      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 6 }}>
        {icon && <span style={{ fontSize: levelStyle.fontSize + 2, lineHeight: 1 }}>{icon}</span>}

        {isEditing ? (
          <textarea
            ref={inputRef}
            className="nodrag nopan nowheel"
            value={editValue}
            rows={editValue.split('\n').length}
            onChange={e => setEditValue(e.target.value)}
            onKeyDown={handleEditKeyDown}
            onBlur={handleEditBlur}
            onPointerDown={e => e.stopPropagation()}
            onClick={e => e.stopPropagation()}
            style={{
              border: 'none', outline: 'none', background: 'transparent',
              fontSize: levelStyle.fontSize, fontWeight: levelStyle.fontWeight,
              color: levelStyle.color, minWidth: 60, width: '100%',
              padding: 0, margin: 0, resize: 'none',
              fontFamily: 'inherit', lineHeight: 'inherit',
            }}
          />
        ) : children}

        {data.collapsed && (
          <span style={{ opacity: 0.5, marginLeft: 4, display: 'flex', alignItems: 'center' }}><MoreHorizontal size={12} /></span>
        )}
      </div>

      {hasContent && !isEditing && (
        <div
          className="nodrag nopan nowheel"
          style={{
            width: '100%',
            borderTop: `1px solid ${levelStyle.stroke ?? 'rgba(0,0,0,0.08)'}`,
            marginTop: 2,
            paddingTop: 4,
            fontSize: Math.max(12, levelStyle.fontSize - 2),
            maxHeight: 200,
            overflow: 'hidden',
            pointerEvents: 'all',
          }}
        >
            <BlockPreview content={data.content!} compact />
        </div>
      )}

      <Handle type="source" id="source-right" position={Position.Right} style={{ opacity: 0, width: 1, height: 1 }} />
    </motion.div>
  )
}
