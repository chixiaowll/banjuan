import Table from 'cli-table3'
import chalk from 'chalk'

export function outputJson(data: unknown): void {
  console.log(JSON.stringify(data, null, 2))
}

export function outputTable(headers: string[], rows: string[][]): void {
  const table = new Table({
    head: headers.map(h => chalk.cyan(h)),
    style: { head: [], border: [] },
  })
  for (const row of rows) table.push(row)
  console.log(table.toString())
}

export function outputItem(pairs: Array<[string, string]>): void {
  const maxKey = Math.max(...pairs.map(([k]) => k.length))
  for (const [key, value] of pairs) {
    console.log(`${chalk.cyan(key.padEnd(maxKey))}  ${value}`)
  }
}
