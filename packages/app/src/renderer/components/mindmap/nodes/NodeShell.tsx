import React, { useRef, useEffect, useState, useCallback } from 'react'
import { Handle, Position } from '@xyflow/react'
import { motion } from 'framer-motion'
import type { MindmapNodeData } from '../useMindmapStore.js'
import { useMindmapStore } from '../useMindmapStore.js'
import { useLayoutEngine } from '../useLayoutEngine.js'
import { getTheme, getNodeStyleForLevel } from '../themes.js'
import type { ShapeName } from '../shapes.js'

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
  const { editingNodeId, setEditingNodeId, updateNodeData, theme: themeName } = useMindmapStore()
  const { setNodeSize } = useLayoutEngine()
  const [editValue, setEditValue] = useState(data.title)
  const isEditing = editingNodeId === id

  const theme = getTheme(themeName)
  const levelStyle = getNodeStyleForLevel(theme, data.depth)
  const shape = (data.shape ?? levelStyle.shape) as ShapeName
  const fill = data.color ?? levelStyle.fill
  const isUnderline = shape === 'underline'

  useEffect(() => {
    if (containerRef.current) {
      const rect = containerRef.current.getBoundingClientRect()
      setNodeSize(id, rect.width, rect.height)
    }
  }, [id, data.title, data.nodeType, data.collapsed, isEditing, setNodeSize])

  useEffect(() => {
    setEditValue(data.title)
  }, [data.title])

  const handleDoubleClick = useCallback((e: React.MouseEvent) => {
    e.stopPropagation()
    setEditingNodeId(id)
  }, [id, setEditingNodeId])

  const handleEditKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault()
      updateNodeData(id, { title: editValue })
      setEditingNodeId(null)
    } else if (e.key === 'Escape') {
      setEditValue(data.title)
      setEditingNodeId(null)
    }
  }, [id, editValue, data.title, updateNodeData, setEditingNodeId])

  const handleEditBlur = useCallback(() => {
    updateNodeData(id, { title: editValue })
    setEditingNodeId(null)
  }, [id, editValue, updateNodeData, setEditingNodeId])

  const borderColor = selected ? '#4A90D9' : (accentColor ?? levelStyle.stroke)
  const borderWidth = selected ? 2 : 1

  const containerStyle: React.CSSProperties = {
    background: isUnderline ? 'transparent' : fill,
    border: isUnderline ? 'none' : `${borderWidth}px solid ${borderColor}`,
    borderBottom: isUnderline ? `2px solid ${levelStyle.stroke}` : undefined,
    borderRadius: isUnderline ? 0 : (levelStyle.borderRadius ?? 8),
    padding: `${levelStyle.padding.y}px ${levelStyle.padding.x}px`,
    fontSize: levelStyle.fontSize,
    fontWeight: levelStyle.fontWeight,
    color: levelStyle.color,
    boxShadow: levelStyle.shadow,
    display: 'flex',
    alignItems: 'center',
    gap: 6,
    cursor: 'pointer',
    minWidth: 60,
    whiteSpace: 'nowrap',
  }

  return (
    <motion.div
      ref={containerRef}
      style={containerStyle}
      onDoubleClick={handleDoubleClick}
      layout
      transition={{ duration: 0.3, ease: 'easeOut' }}
    >
      <Handle type="target" position={Position.Left} style={{ opacity: 0, width: 1, height: 1 }} />

      {icon && <span style={{ fontSize: levelStyle.fontSize + 2, lineHeight: 1 }}>{icon}</span>}

      {isEditing ? (
        <input
          autoFocus
          value={editValue}
          onChange={e => setEditValue(e.target.value)}
          onKeyDown={handleEditKeyDown}
          onBlur={handleEditBlur}
          style={{
            border: 'none', outline: 'none', background: 'transparent',
            fontSize: levelStyle.fontSize, fontWeight: levelStyle.fontWeight,
            color: levelStyle.color, width: Math.max(60, editValue.length * 10),
            padding: 0, margin: 0,
          }}
        />
      ) : children}

      {data.collapsed && (
        <span style={{ fontSize: 10, opacity: 0.5, marginLeft: 4 }}>...</span>
      )}

      <Handle type="source" position={Position.Right} style={{ opacity: 0, width: 1, height: 1 }} />
    </motion.div>
  )
}
