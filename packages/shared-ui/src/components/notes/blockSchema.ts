// The one BlockNote schema for notes: the editor, read-only previews (mind-map
// nodes) and exports must all know every block type a note can contain — a
// preview missing one (mermaid, document links) threw and blanked the canvas.
import { BlockNoteSchema, defaultBlockSpecs, defaultInlineContentSpecs, createCodeBlockSpec } from '@blocknote/core'
import { AnnotationEmbed } from './blocks/AnnotationEmbed.js'
import { DocumentEmbed } from './blocks/DocumentEmbed.js'
import { NoteEmbed } from './blocks/NoteEmbed.js'
import { NoteLink } from './blocks/NoteLink.js'
import { DocumentLink } from './blocks/DocumentLink.js'
import { FileEmbed } from './blocks/FileEmbed.js'
import { MermaidBlock } from './blocks/MermaidBlock.js'

const supportedLanguages = {
  text: { name: 'Plain Text', aliases: ['plaintext', 'txt'] },
  javascript: { name: 'JavaScript', aliases: ['js'] },
  typescript: { name: 'TypeScript', aliases: ['ts'] },
  python: { name: 'Python', aliases: ['py'] },
  java: { name: 'Java', aliases: [] },
  c: { name: 'C', aliases: [] },
  cpp: { name: 'C++', aliases: ['c++'] },
  csharp: { name: 'C#', aliases: ['c#', 'cs'] },
  go: { name: 'Go', aliases: ['golang'] },
  rust: { name: 'Rust', aliases: ['rs'] },
  swift: { name: 'Swift', aliases: [] },
  kotlin: { name: 'Kotlin', aliases: ['kt'] },
  ruby: { name: 'Ruby', aliases: ['rb'] },
  php: { name: 'PHP', aliases: [] },
  html: { name: 'HTML', aliases: [] },
  css: { name: 'CSS', aliases: [] },
  json: { name: 'JSON', aliases: [] },
  yaml: { name: 'YAML', aliases: ['yml'] },
  xml: { name: 'XML', aliases: [] },
  sql: { name: 'SQL', aliases: [] },
  bash: { name: 'Bash', aliases: ['sh', 'shell', 'zsh'] },
  markdown: { name: 'Markdown', aliases: ['md'] },
  latex: { name: 'LaTeX', aliases: ['tex'] },
  r: { name: 'R', aliases: [] },
  matlab: { name: 'MATLAB', aliases: [] },
  lua: { name: 'Lua', aliases: [] },
  dart: { name: 'Dart', aliases: [] },
  scala: { name: 'Scala', aliases: [] },
  jsx: { name: 'JSX', aliases: [] },
  tsx: { name: 'TSX', aliases: [] },
}

const codeBlock = createCodeBlockSpec({
  supportedLanguages,
  // No grammars up front: BlockNote loads each language the first time a code
  // block uses it (loadLanguage), instead of fetching all of them on the first block.
  createHighlighter: () => import('shiki').then(m => m.createHighlighter({ themes: ['github-light', 'github-dark'], langs: [] })),
})

export const schema = BlockNoteSchema.create({
  blockSpecs: {
    ...defaultBlockSpecs,
    codeBlock,
    annotationEmbed: AnnotationEmbed,
    documentEmbed: DocumentEmbed,
    noteEmbed: NoteEmbed,
    fileEmbed: FileEmbed,
    mermaidBlock: MermaidBlock,
  },
  inlineContentSpecs: {
    ...defaultInlineContentSpecs,
    noteLink: NoteLink,
    documentLink: DocumentLink,
  },
})
