import type { TextSelectInfo } from './PdfPage.js'
import type { BanjuanAPI } from '../../api.js'

export async function createHighlightFromSelection(
  api: BanjuanAPI,
  docId: string,
  info: TextSelectInfo,
  color: string,
): Promise<void> {
  await api.annotations.create({
    docId,
    type: 'highlight',
    page: info.page,
    position: { type: 'pdf', page: info.page, rects: info.rects, text: info.text },
    selectedText: info.text,
    color,
  })
  window.getSelection()?.removeAllRanges()
}
