/**
 * Escape a literal for `LIKE ? ESCAPE '\'`. Without it `_` and `%` in a folder
 * name are wildcards: "my_notes/%" also matches "my-notes/…", so deleting or
 * renaming one folder hits its look-alike sibling.
 */
export function escapeLike(s: string): string {
  return s.replace(/[\\%_]/g, c => '\\' + c)
}

/** The ESCAPE clause matching escapeLike: `path LIKE ? ${LIKE_ESCAPE}`. */
export const LIKE_ESCAPE = "ESCAPE '\\'"
