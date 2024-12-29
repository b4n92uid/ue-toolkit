import {glob} from 'glob'
import {dropRight} from 'lodash-es'
import {execSync} from 'node:child_process'
import path from 'node:path'

function getBaseDirectoryFromRunUATPath(runUATPath: string): string {
  return dropRight(runUATPath.split(path.sep), 4).join(path.sep)
}

export async function getEngineLocation(): Promise<string | undefined> {
  const popularLocations = ['C:\\Program Files\\Epic Games', '/Users/Shared/UnrealEngine', '/opt/unreal-engine']

  for (const location of popularLocations) {
    // eslint-disable-next-line no-await-in-loop
    const uatPath = await glob('**/Engine/Build/BatchFiles/RunUAT.*', {
      cwd: location,
      absolute: true,
    }).then((result) => result.at(0))

    if (uatPath) {
      return getBaseDirectoryFromRunUATPath(uatPath)
    }
  }

  try {
    const result = execSync('where.exe RunUAT.*', {encoding: 'utf8'})
    const lines = result.trim().split('\n')
    const uatPath = lines[0].trim()

    if (uatPath) {
      return getBaseDirectoryFromRunUATPath(uatPath)
    }
  } catch {}

  return undefined
}
