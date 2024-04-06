import {Args, Command, Flags} from '@oclif/core'
import {ConfigIniParser} from 'config-ini-parser'
import {glob} from 'glob'
import {readFile, writeFile} from 'node:fs/promises'
import process from 'node:process'
import {type ReleaseType, inc as incSemver} from 'semver'
import * as WinAttr from 'winattr'

export default class Hello extends Command {
  static args = {
    type: Args.string({
      description: 'Type of version bumping',
      options: ['major', 'premajor', 'minor', 'preminor', 'patch', 'prepatch', 'prerelease'],
      required: true,
    }),
  }

  static description = 'Bump project version'

  static flags = {
    android: Flags.boolean(),
  }

  async findSingleFile(pattern: string): Promise<null | string> {
    const entries = await glob(pattern)
    return entries.at(0) ?? null
  }

  async run(): Promise<void> {
    const {args, flags} = await this.parse(Hello)

    this.log(`Current working directory: ${process.cwd()}`)

    const releaseType = args.type as ReleaseType

    const projectName = await this.findSingleFile('./*.uproject')

    if (!projectName) {
      this.error('Unable to find a unreal project in the current directory')
    }

    this.log(`Detected unreal project: ${projectName}`)

    await this.updateProjectVersion(releaseType)

    if (flags.android) {
      await this.updateAndroidBuild(releaseType)
    }
  }

  async updateAndroidBuild(releaseType: ReleaseType) {
    const defaultEnginePath = await this.findSingleFile('./Config/DefaultEngine.ini')

    if (!defaultEnginePath) {
      this.error('DefaultGame.ini not found!')
    }

    WinAttr.setSync(defaultEnginePath, {readonly: false})

    const parser = new ConfigIniParser()

    parser.parse(await readFile(defaultEnginePath, {encoding: 'utf8'}))

    const projectVersion = parser.get('/Script/AndroidRuntimeSettings.AndroidRuntimeSettings', 'VersionDisplayName')

    const newVersion = incSemver(projectVersion, releaseType)

    if (!newVersion) {
      this.error('Cannot increment version!')
    }

    parser.set('/Script/AndroidRuntimeSettings.AndroidRuntimeSettings', 'VersionDisplayName', newVersion)

    this.log(`Android VersionDisplayName: ${projectVersion} -> ${newVersion}`)

    const storeVersion = Number.parseInt(
      parser.get('/Script/AndroidRuntimeSettings.AndroidRuntimeSettings', 'StoreVersion'),
      10,
    )

    const newStoreVersion = storeVersion + 1

    parser.set('/Script/AndroidRuntimeSettings.AndroidRuntimeSettings', 'StoreVersion', newStoreVersion.toString())

    this.log(`Android StoreVersion: ${storeVersion} -> ${newStoreVersion}`)

    await writeFile(defaultEnginePath, parser.stringify())
  }

  async updateProjectVersion(releaseType: ReleaseType) {
    const defaultGamePath = await this.findSingleFile('./Config/DefaultGame.ini')

    if (!defaultGamePath) {
      this.error('DefaultGame.ini not found!')
    }

    WinAttr.setSync(defaultGamePath, {readonly: false})

    const parser = new ConfigIniParser()
    parser.parse(await readFile(defaultGamePath, {encoding: 'utf8'}))
    const projectVersion = parser.get('/Script/EngineSettings.GeneralProjectSettings', 'ProjectVersion')

    const newVersion = incSemver(projectVersion, releaseType)

    if (!newVersion) {
      this.error('Cannot increment version!')
    }

    parser.set('/Script/EngineSettings.GeneralProjectSettings', 'ProjectVersion', newVersion)

    await writeFile(defaultGamePath, parser.stringify())

    this.log(`ProjectVersion: ${projectVersion} -> ${newVersion}`)
  }
}
