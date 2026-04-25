import React, { useEffect, useRef, useState } from 'react'
import ePub, { Book, Rendition, NavItem } from 'epubjs'

interface Props {
  filePath: string
}

export default function EpubViewer({ filePath }: Props) {
  const containerRef = useRef<HTMLDivElement>(null)
  const bookRef = useRef<Book | null>(null)
  const renditionRef = useRef<Rendition | null>(null)
  const [toc, setToc] = useState<NavItem[]>([])
  const [showToc, setShowToc] = useState(false)
  const [fontSize, setFontSize] = useState(100)
  const [currentChapter, setCurrentChapter] = useState('')

  useEffect(() => {
    if (!containerRef.current) return

    const book = ePub(`file://${filePath}`)
    bookRef.current = book

    const rendition = book.renderTo(containerRef.current, {
      width: '100%',
      height: '100%',
      spread: 'none',
    })
    renditionRef.current = rendition

    rendition.themes.fontSize(`${fontSize}%`)
    rendition.display()

    book.loaded.navigation.then((nav) => {
      setToc(nav.toc)
    })

    rendition.on('relocated', (location: { start: { href: string } }) => {
      setCurrentChapter(location.start.href)
    })

    return () => {
      book.destroy()
      bookRef.current = null
      renditionRef.current = null
    }
  }, [filePath])

  useEffect(() => {
    if (renditionRef.current) {
      renditionRef.current.themes.fontSize(`${fontSize}%`)
    }
  }, [fontSize])

  const goPrev = () => renditionRef.current?.prev()
  const goNext = () => renditionRef.current?.next()

  const goToChapter = (href: string) => {
    renditionRef.current?.display(href)
    setShowToc(false)
  }

  const buttonStyle: React.CSSProperties = {
    background: 'var(--surface, #333)',
    color: 'var(--text, #eee)',
    border: '1px solid var(--border, #555)',
    borderRadius: 4,
    padding: '4px 10px',
    cursor: 'pointer',
    fontSize: 13,
  }

  return (
    <div style={{ display: 'flex', height: '100%' }}>
      {/* TOC sidebar */}
      {showToc && (
        <div style={{
          width: 260,
          borderRight: '1px solid var(--border)',
          overflow: 'auto',
          background: 'var(--surface)',
          flexShrink: 0,
          padding: '8px 0',
        }}>
          <div style={{ padding: '4px 12px 8px', fontWeight: 600, fontSize: 14 }}>
            Table of Contents
          </div>
          {toc.map((item) => (
            <div
              key={item.id}
              onClick={() => goToChapter(item.href)}
              style={{
                padding: '6px 12px',
                cursor: 'pointer',
                fontSize: 13,
                background: currentChapter.includes(item.href) ? 'var(--border)' : 'transparent',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
              }}
            >
              {item.label.trim()}
            </div>
          ))}
        </div>
      )}

      {/* Main content */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0 }}>
        {/* Toolbar */}
        <div style={{
          padding: '8px 16px',
          borderBottom: '1px solid var(--border)',
          display: 'flex',
          gap: '8px',
          alignItems: 'center',
          flexShrink: 0,
        }}>
          <button style={buttonStyle} onClick={() => setShowToc(s => !s)}>
            {showToc ? '✕ TOC' : '☰ TOC'}
          </button>
          <button style={buttonStyle} onClick={goPrev}>← Prev</button>
          <button style={buttonStyle} onClick={goNext}>Next →</button>
          <div style={{ marginLeft: 'auto', display: 'flex', gap: '6px', alignItems: 'center' }}>
            <button style={buttonStyle} onClick={() => setFontSize(s => Math.max(50, s - 10))}>A−</button>
            <span style={{ fontSize: 12, minWidth: 36, textAlign: 'center' }}>{fontSize}%</span>
            <button style={buttonStyle} onClick={() => setFontSize(s => Math.min(200, s + 10))}>A+</button>
          </div>
        </div>

        {/* EPUB render area */}
        <div ref={containerRef} style={{ flex: 1, overflow: 'hidden' }} />
      </div>
    </div>
  )
}
