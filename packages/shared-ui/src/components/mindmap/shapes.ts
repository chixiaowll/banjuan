export interface ShapeProps {
  width: number
  height: number
  fill: string
  stroke: string
  borderRadius?: number
  shadow?: string
  selected?: boolean
}

export type ShapeName = 'rectangle' | 'roundedRect' | 'capsule' | 'diamond' | 'ellipse' | 'underline'

export function getShapePath(shape: ShapeName, props: ShapeProps): { d: string; style: Record<string, unknown> } {
  const { width: w, height: h } = props
  const style: Record<string, unknown> = {
    fill: props.fill,
    stroke: props.selected ? '#4A90D9' : props.stroke,
    strokeWidth: props.selected ? 2 : 1,
    filter: props.shadow ? `drop-shadow(${props.shadow})` : undefined,
  }

  switch (shape) {
    case 'rectangle':
      return {
        d: `M0,0 H${w} V${h} H0 Z`,
        style,
      }
    case 'roundedRect': {
      const r = Math.min(props.borderRadius ?? 8, h / 2, w / 2)
      return {
        d: `M${r},0 H${w - r} Q${w},0 ${w},${r} V${h - r} Q${w},${h} ${w - r},${h} H${r} Q0,${h} 0,${h - r} V${r} Q0,0 ${r},0 Z`,
        style,
      }
    }
    case 'capsule': {
      const r = h / 2
      return {
        d: `M${r},0 H${w - r} A${r},${r} 0 0 1 ${w - r},${h} H${r} A${r},${r} 0 0 1 ${r},0 Z`,
        style,
      }
    }
    case 'diamond': {
      const mx = w / 2, my = h / 2
      return {
        d: `M${mx},0 L${w},${my} L${mx},${h} L0,${my} Z`,
        style,
      }
    }
    case 'ellipse': {
      const rx = w / 2, ry = h / 2
      return {
        d: `M${rx},0 A${rx},${ry} 0 1 1 ${rx},${h} A${rx},${ry} 0 1 1 ${rx},0 Z`,
        style,
      }
    }
    case 'underline':
      return {
        d: `M0,${h} H${w}`,
        style: { ...style, fill: 'none', strokeWidth: 2 },
      }
  }
}
