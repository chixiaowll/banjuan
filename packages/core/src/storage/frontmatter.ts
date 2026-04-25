import { parse as parseYaml, stringify as stringifyYaml } from 'yaml'

export interface FrontmatterResult<T = Record<string, unknown>> {
  data: T
  content: string
}

export function parseFrontmatter<T = Record<string, unknown>>(raw: string): FrontmatterResult<T> {
  if (!raw.startsWith('---')) {
    return { data: {} as T, content: raw }
  }
  const lines = raw.split('\n')
  let endLine = -1
  for (let i = 1; i < lines.length; i++) {
    if (lines[i].trim() === '---') {
      endLine = i
      break
    }
  }
  if (endLine === -1) return { data: {} as T, content: raw }

  const yamlStr = lines.slice(1, endLine).join('\n')
  const data = parseYaml(yamlStr) ?? {}
  const content = lines.slice(endLine + 1).join('\n').replace(/^\n+/, '')
  return { data: data as T, content }
}

export function serializeFrontmatter(data: Record<string, unknown>, content: string): string {
  const yaml = stringifyYaml(data).trim()
  if (content) {
    return `---\n${yaml}\n---\n\n${content}`
  }
  return `---\n${yaml}\n---\n`
}
