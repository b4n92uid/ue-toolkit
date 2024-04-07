import {glob} from 'glob'

export async function findSingleFile(pattern: string, location?: string) {
  const entries = await glob(pattern, {cwd: location, absolute: true})
  return entries.at(0) ?? null
}
