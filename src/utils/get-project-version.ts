import {ConfigIniParser} from 'config-ini-parser'
import {readFile} from 'node:fs/promises'

import {findSingleFile} from './find-single-file.js'

export async function getProjectVersion() {
  const defaultGamePath = await findSingleFile('./Config/DefaultGame.ini')

  if (!defaultGamePath) {
    return null
  }

  const parser = new ConfigIniParser()

  parser.parse(await readFile(defaultGamePath, {encoding: 'utf8'}))

  const projectVersion = parser.get('/Script/EngineSettings.GeneralProjectSettings', 'ProjectVersion')

  return projectVersion
}
