/**
 * Fills `{0}`, `{1}`… in a message. A count can also pick a plural form,
 * ICU style: `{0, plural, one {# Dokument} other {# Dokumente}}` — the branch
 * is chosen by `Intl.PluralRules` for the UI language and `#` becomes the
 * number. Languages without plurals (zh / ja / ko) just use `{0}`.
 */
export function formatMessage(msg: string, args: ReadonlyArray<string | number>, localeTag: string): string {
  let out = msg.replace(/\{(\d+), plural,((?:\s*[=\w]+\s*\{[^{}]*\})+)\s*\}/g, (whole, index: string, body: string) => {
    const arg = args[Number(index)]
    if (arg === undefined) return whole
    const n = Number(arg)
    const branches = new Map<string, string>()
    for (const m of body.matchAll(/([=\w]+)\s*\{([^{}]*)\}/g)) branches.set(m[1], m[2])
    const picked = branches.get(`=${n}`) ?? branches.get(pluralRules(localeTag).select(n)) ?? branches.get('other') ?? ''
    return picked.replace(/#/g, String(arg))
  })
  for (let i = 0; i < args.length; i++) out = out.split(`{${i}}`).join(String(args[i]))
  return out
}

const rulesCache = new Map<string, Intl.PluralRules>()
function pluralRules(tag: string): Intl.PluralRules {
  let r = rulesCache.get(tag)
  if (!r) { r = new Intl.PluralRules(tag); rulesCache.set(tag, r) }
  return r
}
