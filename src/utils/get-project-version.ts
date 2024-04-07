import {ConfigIniParser} from 'config-ini-parser'
import {readFile} from 'node:fs/promises'

import {findSingleFile} from './find-single-file.js'

export async function getProjectVersion() {
  const defaultEnginePath = await findSingleFile('./Config/DefaultEngine.ini')

  if (!defaultEnginePath) {
    return null
  }

  const parser = new ConfigIniParser()

  parser.parse(await readFile(defaultEnginePath, {encoding: 'utf8'}))

  const projectVersion = parser.get('/Script/AndroidRuntimeSettings.AndroidRuntimeSettings', 'VersionDisplayName')

  return projectVersion
}
