import type { TextSelectInfo } from './PdfPage.js'

export async function createHighlightFromSelection(
  docId: string,
  info: TextSelectInfo,
  color: string,
): Promise<void> {
  await window.electronAPI.annotations.create({
    docId,
    type: 'highlight',
    page: info.page,
    position: { type: 'pdf', page: info.page, rects: info.rects, text: info.text },
    selectedText: info.text,
    color,
  })
  window.getSelection()?.removeAllRanges()
}
