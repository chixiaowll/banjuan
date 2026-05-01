export interface EdgeLevelStyle {
  color: string
  width: number
  animated?: boolean
}

export interface NodeStyle {
  shape: 'rectangle' | 'roundedRect' | 'capsule' | 'diamond' | 'ellipse' | 'underline'
  fill: string
  stroke: string
  fontSize: number
  fontWeight: number
  color: string
  shadow?: string
  borderRadius?: number
  padding: { x: number; y: number }
}

export interface NodeTypeStyle {
  icon: string
  accentColor: string
}

export interface MindmapTheme {
  name: string
  canvas: { background: string; gridColor?: string; gridStyle?: 'dots' | 'lines' | 'none' }
  levels: {
    root: NodeStyle
    level1: NodeStyle
    level2: NodeStyle
    leaf: NodeStyle
  }
  edges: {
    type: 'bezier' | 'straight' | 'step'
    root: EdgeLevelStyle
    level1: EdgeLevelStyle
    level2: EdgeLevelStyle
    leaf: EdgeLevelStyle
  }
  relation: { color: string; width: number; dasharray: string; labelFont: string }
  nodeTypeStyles: {
    note: NodeTypeStyle
    document: NodeTypeStyle
    annotation: NodeTypeStyle
    image: { borderRadius: number; maxWidth: number }
    link: NodeTypeStyle
    tag: { shape: 'capsule'; accentColor: string }
  }
}

export function getNodeStyleForLevel(theme: MindmapTheme, depth: number): NodeStyle {
  if (depth === 0) return theme.levels.root
  if (depth === 1) return theme.levels.level1
  if (depth === 2) return theme.levels.level2
  return theme.levels.leaf
}

export function getEdgeStyleForLevel(theme: MindmapTheme, depth: number): EdgeLevelStyle {
  if (depth === 0) return theme.edges.root
  if (depth === 1) return theme.edges.level1
  if (depth === 2) return theme.edges.level2
  return theme.edges.leaf
}

const classic: MindmapTheme = {
  name: 'Classic',
  canvas: { background: '#ffffff', gridStyle: 'none' },
  levels: {
    root: { shape: 'roundedRect', fill: '#4A90D9', stroke: '#3A7BC8', fontSize: 18, fontWeight: 700, color: '#ffffff', shadow: '0 2px 8px rgba(74,144,217,0.3)', borderRadius: 12, padding: { x: 24, y: 14 } },
    level1: { shape: 'roundedRect', fill: '#E8F0FE', stroke: '#B8D4F0', fontSize: 15, fontWeight: 600, color: '#2C3E50', borderRadius: 8, padding: { x: 18, y: 10 } },
    level2: { shape: 'roundedRect', fill: '#F5F7FA', stroke: '#D5DDE5', fontSize: 13, fontWeight: 400, color: '#34495E', borderRadius: 6, padding: { x: 14, y: 8 } },
    leaf: { shape: 'roundedRect', fill: '#FAFBFC', stroke: '#E1E5EA', fontSize: 13, fontWeight: 400, color: '#5A6B7B', borderRadius: 6, padding: { x: 14, y: 8 } },
  },
  edges: {
    type: 'bezier',
    root: { color: '#4A90D9', width: 3, animated: false },
    level1: { color: '#8BB8E8', width: 2 },
    level2: { color: '#B8D4F0', width: 1.5 },
    leaf: { color: '#D5DDE5', width: 1.5 },
  },
  relation: { color: '#E67E22', width: 1.5, dasharray: '6 4', labelFont: '12px sans-serif' },
  nodeTypeStyles: {
    note: { icon: '📝', accentColor: '#27AE60' },
    document: { icon: '📄', accentColor: '#3498DB' },
    annotation: { icon: '💬', accentColor: '#F39C12' },
    image: { borderRadius: 8, maxWidth: 200 },
    link: { icon: '🔗', accentColor: '#8E44AD' },
    tag: { shape: 'capsule', accentColor: '#1ABC9C' },
  },
}

const business: MindmapTheme = {
  name: 'Business',
  canvas: { background: '#FAFAFA', gridStyle: 'none' },
  levels: {
    root: { shape: 'rectangle', fill: '#2C3E50', stroke: '#1A252F', fontSize: 18, fontWeight: 700, color: '#FFFFFF', borderRadius: 4, padding: { x: 24, y: 14 } },
    level1: { shape: 'rectangle', fill: '#ECF0F1', stroke: '#BDC3C7', fontSize: 15, fontWeight: 600, color: '#2C3E50', borderRadius: 4, padding: { x: 18, y: 10 } },
    level2: { shape: 'rectangle', fill: '#F8F9FA', stroke: '#DEE2E6', fontSize: 13, fontWeight: 400, color: '#495057', borderRadius: 3, padding: { x: 14, y: 8 } },
    leaf: { shape: 'rectangle', fill: '#FFFFFF', stroke: '#E9ECEF', fontSize: 13, fontWeight: 400, color: '#6C757D', borderRadius: 3, padding: { x: 14, y: 8 } },
  },
  edges: {
    type: 'straight',
    root: { color: '#2C3E50', width: 2.5 },
    level1: { color: '#7F8C8D', width: 2 },
    level2: { color: '#BDC3C7', width: 1.5 },
    leaf: { color: '#DEE2E6', width: 1 },
  },
  relation: { color: '#E74C3C', width: 1.5, dasharray: '6 4', labelFont: '12px sans-serif' },
  nodeTypeStyles: {
    note: { icon: '📝', accentColor: '#27AE60' },
    document: { icon: '📄', accentColor: '#2980B9' },
    annotation: { icon: '💬', accentColor: '#F39C12' },
    image: { borderRadius: 4, maxWidth: 180 },
    link: { icon: '🔗', accentColor: '#8E44AD' },
    tag: { shape: 'capsule', accentColor: '#16A085' },
  },
}

const colorful: MindmapTheme = {
  name: 'Colorful',
  canvas: { background: '#FFFFFF', gridStyle: 'none' },
  levels: {
    root: { shape: 'roundedRect', fill: '#FF6B6B', stroke: '#EE5A5A', fontSize: 18, fontWeight: 700, color: '#FFFFFF', shadow: '0 3px 10px rgba(255,107,107,0.3)', borderRadius: 16, padding: { x: 28, y: 16 } },
    level1: { shape: 'roundedRect', fill: '#PLACEHOLDER', stroke: '#PLACEHOLDER', fontSize: 15, fontWeight: 600, color: '#FFFFFF', borderRadius: 10, padding: { x: 18, y: 10 } },
    level2: { shape: 'roundedRect', fill: '#PLACEHOLDER', stroke: '#PLACEHOLDER', fontSize: 13, fontWeight: 400, color: '#333333', borderRadius: 8, padding: { x: 14, y: 8 } },
    leaf: { shape: 'roundedRect', fill: '#FAFAFA', stroke: '#E0E0E0', fontSize: 13, fontWeight: 400, color: '#555555', borderRadius: 6, padding: { x: 14, y: 8 } },
  },
  edges: {
    type: 'bezier',
    root: { color: '#FF6B6B', width: 3, animated: true },
    level1: { color: '#PLACEHOLDER', width: 2.5 },
    level2: { color: '#PLACEHOLDER', width: 2 },
    leaf: { color: '#CCCCCC', width: 1.5 },
  },
  relation: { color: '#9B59B6', width: 1.5, dasharray: '6 4', labelFont: '12px sans-serif' },
  nodeTypeStyles: {
    note: { icon: '📝', accentColor: '#2ECC71' },
    document: { icon: '📄', accentColor: '#3498DB' },
    annotation: { icon: '💬', accentColor: '#F1C40F' },
    image: { borderRadius: 12, maxWidth: 200 },
    link: { icon: '🔗', accentColor: '#9B59B6' },
    tag: { shape: 'capsule', accentColor: '#1ABC9C' },
  },
}

export const BRANCH_COLORS = ['#FF6B6B', '#FFA94D', '#FFD43B', '#69DB7C', '#4DABF7', '#9775FA']

const dark: MindmapTheme = {
  name: 'Dark',
  canvas: { background: '#1E1E2E', gridStyle: 'none' },
  levels: {
    root: { shape: 'roundedRect', fill: '#89B4FA', stroke: '#74A8F7', fontSize: 18, fontWeight: 700, color: '#1E1E2E', shadow: '0 2px 12px rgba(137,180,250,0.3)', borderRadius: 12, padding: { x: 24, y: 14 } },
    level1: { shape: 'roundedRect', fill: '#313244', stroke: '#45475A', fontSize: 15, fontWeight: 600, color: '#CDD6F4', borderRadius: 8, padding: { x: 18, y: 10 } },
    level2: { shape: 'roundedRect', fill: '#2A2A3C', stroke: '#3A3A4E', fontSize: 13, fontWeight: 400, color: '#BAC2DE', borderRadius: 6, padding: { x: 14, y: 8 } },
    leaf: { shape: 'roundedRect', fill: '#242436', stroke: '#333348', fontSize: 13, fontWeight: 400, color: '#A6ADC8', borderRadius: 6, padding: { x: 14, y: 8 } },
  },
  edges: {
    type: 'bezier',
    root: { color: '#89B4FA', width: 3, animated: true },
    level1: { color: '#585B70', width: 2 },
    level2: { color: '#45475A', width: 1.5 },
    leaf: { color: '#3A3A4E', width: 1.5 },
  },
  relation: { color: '#FAB387', width: 1.5, dasharray: '6 4', labelFont: '12px sans-serif' },
  nodeTypeStyles: {
    note: { icon: '📝', accentColor: '#A6E3A1' },
    document: { icon: '📄', accentColor: '#89B4FA' },
    annotation: { icon: '💬', accentColor: '#F9E2AF' },
    image: { borderRadius: 8, maxWidth: 200 },
    link: { icon: '🔗', accentColor: '#CBA6F7' },
    tag: { shape: 'capsule', accentColor: '#94E2D5' },
  },
}

const minimal: MindmapTheme = {
  name: 'Minimal',
  canvas: { background: '#FFFFFF', gridStyle: 'none' },
  levels: {
    root: { shape: 'underline', fill: 'transparent', stroke: '#333333', fontSize: 20, fontWeight: 700, color: '#111111', padding: { x: 8, y: 6 } },
    level1: { shape: 'underline', fill: 'transparent', stroke: '#666666', fontSize: 15, fontWeight: 500, color: '#333333', padding: { x: 6, y: 4 } },
    level2: { shape: 'underline', fill: 'transparent', stroke: '#999999', fontSize: 13, fontWeight: 400, color: '#555555', padding: { x: 6, y: 4 } },
    leaf: { shape: 'underline', fill: 'transparent', stroke: '#CCCCCC', fontSize: 13, fontWeight: 400, color: '#777777', padding: { x: 6, y: 4 } },
  },
  edges: {
    type: 'straight',
    root: { color: '#333333', width: 2 },
    level1: { color: '#888888', width: 1.5 },
    level2: { color: '#BBBBBB', width: 1 },
    leaf: { color: '#DDDDDD', width: 1 },
  },
  relation: { color: '#E74C3C', width: 1, dasharray: '4 3', labelFont: '11px sans-serif' },
  nodeTypeStyles: {
    note: { icon: '📝', accentColor: '#27AE60' },
    document: { icon: '📄', accentColor: '#3498DB' },
    annotation: { icon: '💬', accentColor: '#F39C12' },
    image: { borderRadius: 4, maxWidth: 160 },
    link: { icon: '🔗', accentColor: '#8E44AD' },
    tag: { shape: 'capsule', accentColor: '#16A085' },
  },
}

const organic: MindmapTheme = {
  name: 'Organic',
  canvas: { background: '#FFF8F0', gridStyle: 'none' },
  levels: {
    root: { shape: 'roundedRect', fill: '#D35400', stroke: '#BA4A00', fontSize: 18, fontWeight: 700, color: '#FFFFFF', shadow: '0 3px 10px rgba(211,84,0,0.25)', borderRadius: 20, padding: { x: 28, y: 16 } },
    level1: { shape: 'roundedRect', fill: '#FDEBD0', stroke: '#F5CBA7', fontSize: 15, fontWeight: 600, color: '#6E3B00', borderRadius: 14, padding: { x: 20, y: 12 } },
    level2: { shape: 'roundedRect', fill: '#FEF5E7', stroke: '#FAE5CD', fontSize: 13, fontWeight: 400, color: '#7B4F1E', borderRadius: 10, padding: { x: 16, y: 10 } },
    leaf: { shape: 'roundedRect', fill: '#FFFAF4', stroke: '#F5E6D3', fontSize: 13, fontWeight: 400, color: '#8B6F50', borderRadius: 10, padding: { x: 14, y: 8 } },
  },
  edges: {
    type: 'bezier',
    root: { color: '#D35400', width: 4 },
    level1: { color: '#E59866', width: 3 },
    level2: { color: '#F0B27A', width: 2 },
    leaf: { color: '#F5CBA7', width: 1.5 },
  },
  relation: { color: '#8E44AD', width: 2, dasharray: '8 5', labelFont: '12px serif' },
  nodeTypeStyles: {
    note: { icon: '📝', accentColor: '#27AE60' },
    document: { icon: '📄', accentColor: '#2E86C1' },
    annotation: { icon: '💬', accentColor: '#D4AC0D' },
    image: { borderRadius: 14, maxWidth: 200 },
    link: { icon: '🔗', accentColor: '#7D3C98' },
    tag: { shape: 'capsule', accentColor: '#1E8449' },
  },
}

export const THEMES: Record<string, MindmapTheme> = {
  classic,
  business,
  colorful,
  dark,
  minimal,
  organic,
}

export function getTheme(name: string): MindmapTheme {
  return THEMES[name] ?? classic
}
