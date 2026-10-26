import { copyFile, mkdir, readdir, realpath, stat } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { join, basename, relative } from 'node:path'
import type { Library } from '@banjuan/core'
import { isInside, libraryPath } from './path-guard.js'

export type ImportResult = { title: string; success: boolean; error?: string }

/**
 * Import dropped / picked files and folders into the library.
 *
 * Anything from outside the library is copied in (into `destDir`), folders with
 * their tree. Anything already inside it is imported where it is — copying it
 * duplicated the files, and a folder that held the copy target (the library
 * itself, or a folder of it) kept finding the copies it was making and
 * recursed without end. A folder that contains the library skips it.
 */
export async function importDocumentFiles(
  lib: Pick<Library, 'rootPath'> & { documents: Pick<Library['documents'], 'listImportedPaths' | 'importMany'> },
  filePaths: string[],
  destDir: string | null,
): Promise<ImportResult[]> {
  const results: ImportResult[] = []
  const root = await realpath(lib.rootPath)
  const targetDir = destDir ? libraryPath(lib.rootPath, destDir) : lib.rootPath
  await mkdir(targetDir, { recursive: true })
  const known = await lib.documents.listImportedPaths()

  // Files are copied (or found in place) as the trees are walked, then imported in one batch.
  const pending: Array<{ title: string; destPath: string }> = []

  const inPlace = (realPath: string) => {
    const rel = relative(root, realPath).split('\\').join('/')
    const title = basename(realPath)
    if (rel.split('/').some(seg => seg.startsWith('.'))) return   // .banjuan and other hidden data
    if (known.has(rel)) results.push({ title, success: false, error: 'ALREADY_IN_LIBRARY' })
    else pending.push({ title, destPath: join(lib.rootPath, rel) })
  }

  const walkInPlace = async (realDir: string) => {
    for (const entry of await readdir(realDir, { withFileTypes: true })) {
      if (entry.name.startsWith('.')) continue
      const full = join(realDir, entry.name)
      if (entry.isDirectory()) await walkInPlace(full)
      else if (entry.isFile()) inPlace(full)
    }
  }

  const copyFileInto = async (srcPath: string, dir: string) => {
    const fileName = basename(srcPath)
    const dot = fileName.lastIndexOf('.')
    const ext = dot > 0 ? fileName.slice(dot) : ''
    const stem = ext ? fileName.slice(0, -ext.length) : fileName
    let destName = fileName
    for (let n = 2; existsSync(join(dir, destName)); n++) destName = `${stem} (${n})${ext}`
    try {
      await copyFile(srcPath, join(dir, destName))
      pending.push({ title: destName, destPath: join(dir, destName) })
    } catch (err: any) {
      results.push({ title: destName, success: false, error: err?.message })
    }
  }

  const copyDirInto = async (srcDir: string, parentDir: string) => {
    // Listed before anything is created, so the folder made below is never walked.
    const entries = await readdir(srcDir, { withFileTypes: true })
    const subDir = join(parentDir, basename(srcDir))
    await mkdir(subDir, { recursive: true })
    for (const entry of entries) {
      if (entry.name.startsWith('.')) continue
      const full = join(srcDir, entry.name)
      if (entry.isDirectory()) {
        if ((await realpath(full)) === root) continue   // the library itself, inside the dropped folder
        await copyDirInto(full, subDir)
      } else if (entry.isFile()) {
        await copyFileInto(full, subDir)
      }
    }
  }

  for (const filePath of filePaths) {
    try {
      const real = await realpath(filePath)
      const isDir = (await stat(real)).isDirectory()
      if (isInside(root, real)) {
        if (isDir) await walkInPlace(real)
        else inPlace(real)
      } else if (isDir) {
        await copyDirInto(real, targetDir)
      } else {
        await copyFileInto(real, targetDir)
      }
    } catch (err: any) {
      results.push({ title: basename(filePath), success: false, error: err?.message })
    }
  }

  // One batch import (per-file import() re-read every document JSON: O(N²)).
  const imported = await lib.documents.importMany(pending.map(p => p.destPath))
  imported.forEach((r, i) => results.push(r.doc
    ? { title: pending[i].title, success: true }
    : { title: pending[i].title, success: false, error: r.error }))
  return results
}
