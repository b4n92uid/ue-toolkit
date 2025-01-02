import {glob} from 'glob'
import {last, sortBy} from 'lodash-es'
import {Stats} from 'node:fs'
import {stat} from 'node:fs/promises'

export async function findSingleFile(pattern: string, location?: string): Promise<string | undefined> {
  const entries = await glob(pattern, {cwd: location, absolute: true})

  if (entries.length === 1) {
    return entries.at(0)
  }

  let entriesByTime = await Promise.all(
    entries.map(async (entry): Promise<[string, Stats]> => [entry, await stat(entry)]),
  )

  entriesByTime = sortBy(entriesByTime, ([, stat]) => stat.mtimeMs)

  const lastEntry = last(entriesByTime)

  if (lastEntry) {
    const [entry] = lastEntry
    return entry
  }

  return undefined
}
