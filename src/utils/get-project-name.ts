import {ConfigIniParser} from 'config-ini-parser'
import {readFile} from 'node:fs/promises'

import {findSingleFile} from './find-single-file.js'

export async function getProjectName() {
  const defaultGamePath = await findSingleFile('./Config/DefaultGame.ini')

  if (!defaultGamePath) {
    return null
  }

  const parser = new ConfigIniParser()
  parser.parse(await readFile(defaultGamePath, {encoding: 'utf8'}))

  return parser.get('/Script/EngineSettings.GeneralProjectSettings', 'ProjectName')
}
