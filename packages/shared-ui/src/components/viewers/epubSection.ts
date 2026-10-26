/**
 * Ink and area marks in an EPUB belong to one chapter: the reader shows one
 * chapter at a time and their y is measured from that chapter's top. They
 * record the chapter's `href`; marks made before they did have none and still
 * show in every chapter, as they always have.
 */
export function inSection(position: { href?: unknown } | null | undefined, currentHref: string): boolean {
  return !position?.href || !currentHref || position.href === currentHref
}

/** Only this chapter's ink/area marks; other annotation types are untouched. */
export function chapterMarks<T extends { type?: string; position?: any }>(annotations: T[], currentHref: string): T[] {
  return annotations.filter(a => (a.type !== 'ink' && a.type !== 'area') || inSection(a.position, currentHref))
}
