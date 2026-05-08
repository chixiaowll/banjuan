import React from 'react'
import type { HandwritingTemplate } from '@banjuan/core'

interface Props {
  template: HandwritingTemplate
  pageWidth: number
  pageHeight: number
}

const LINE_COLOR = '#d0d0d0'
const SPACING = 32

function LinedTemplate({ pageWidth, pageHeight }: { pageWidth: number; pageHeight: number }) {
  const lines: React.ReactElement[] = []
  for (let y = SPACING; y < pageHeight; y += SPACING) {
    lines.push(<line key={y} x1={0} y1={y} x2={pageWidth} y2={y} stroke={LINE_COLOR} strokeWidth={0.5} />)
  }
  return <>{lines}</>
}

function GridTemplate({ pageWidth, pageHeight }: { pageWidth: number; pageHeight: number }) {
  const lines: React.ReactElement[] = []
  for (let y = SPACING; y < pageHeight; y += SPACING) {
    lines.push(<line key={`h${y}`} x1={0} y1={y} x2={pageWidth} y2={y} stroke={LINE_COLOR} strokeWidth={0.5} />)
  }
  for (let x = SPACING; x < pageWidth; x += SPACING) {
    lines.push(<line key={`v${x}`} x1={x} y1={0} x2={x} y2={pageHeight} stroke={LINE_COLOR} strokeWidth={0.5} />)
  }
  return <>{lines}</>
}

function DottedTemplate({ pageWidth, pageHeight }: { pageWidth: number; pageHeight: number }) {
  const dots: React.ReactElement[] = []
  for (let y = SPACING; y < pageHeight; y += SPACING) {
    for (let x = SPACING; x < pageWidth; x += SPACING) {
      dots.push(<circle key={`${x}-${y}`} cx={x} cy={y} r={1} fill={LINE_COLOR} />)
    }
  }
  return <>{dots}</>
}

function CornellTemplate({ pageWidth, pageHeight }: { pageWidth: number; pageHeight: number }) {
  const cueWidth = Math.round(pageWidth / 3)
  const summaryY = Math.round(pageHeight * 0.75)
  const lines: React.ReactElement[] = []
  lines.push(<line key="cue" x1={cueWidth} y1={0} x2={cueWidth} y2={summaryY} stroke={LINE_COLOR} strokeWidth={1} />)
  lines.push(<line key="summary" x1={0} y1={summaryY} x2={pageWidth} y2={summaryY} stroke={LINE_COLOR} strokeWidth={1} />)
  for (let y = SPACING; y < pageHeight; y += SPACING) {
    lines.push(<line key={`h${y}`} x1={0} y1={y} x2={pageWidth} y2={y} stroke={LINE_COLOR} strokeWidth={0.3} />)
  }
  return <>{lines}</>
}

export default function TemplateRenderer({ template, pageWidth, pageHeight }: Props) {
  if (template === 'blank') return null

  return (
    <svg
      style={{ position: 'absolute', inset: 0, pointerEvents: 'none', zIndex: 0 }}
      width={pageWidth}
      height={pageHeight}
      viewBox={`0 0 ${pageWidth} ${pageHeight}`}
    >
      {template === 'lined' && <LinedTemplate pageWidth={pageWidth} pageHeight={pageHeight} />}
      {template === 'grid' && <GridTemplate pageWidth={pageWidth} pageHeight={pageHeight} />}
      {template === 'dotted' && <DottedTemplate pageWidth={pageWidth} pageHeight={pageHeight} />}
      {template === 'cornell' && <CornellTemplate pageWidth={pageWidth} pageHeight={pageHeight} />}
    </svg>
  )
}
