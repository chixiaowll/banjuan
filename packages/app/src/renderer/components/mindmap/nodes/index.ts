import TextNode from './TextNode.js'
import NoteNode from './NoteNode.js'
import DocumentNode from './DocumentNode.js'
import AnnotationNode from './AnnotationNode.js'
import ImageNode from './ImageNode.js'
import LinkNode from './LinkNode.js'
import TagNode from './TagNode.js'

export const nodeTypes = {
  text: TextNode,
  note: NoteNode,
  document: DocumentNode,
  annotation: AnnotationNode,
  image: ImageNode,
  link: LinkNode,
  tag: TagNode,
}
