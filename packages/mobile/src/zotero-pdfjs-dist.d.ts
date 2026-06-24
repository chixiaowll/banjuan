// shared-ui's PDF viewers (compiled as part of the mobile program via imports)
// rely on this ambient module declaration. Reuse shared-ui's single source of
// truth — its `export * from 'pdfjs-dist'` resolves against shared-ui's own
// node_modules, so mobile needs no direct pdfjs-dist dependency.
/// <reference path="../../shared-ui/src/zotero-pdfjs-dist.d.ts" />
