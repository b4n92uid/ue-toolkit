export function escapeToUnicode(str: string): string {
  let result = ''

  for (const c of str) {
    result += '\\u' + ('000' + c.codePointAt(0)!.toString(16)).slice(-4)
  }

  return result
}
