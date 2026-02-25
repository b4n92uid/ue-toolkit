import {Args, Command, Flags} from '@oclif/core'
import {ConfigIniParser} from 'config-ini-parser'
import {readFile, writeFile} from 'node:fs/promises'
import process from 'node:process'
import {type ReleaseType, inc as incSemver} from 'semver'
import * as WinAttr from 'winattr'

import {findSingleFile} from '../../utils/find-single-file.js'

interface VersionChange {
  field: string
  oldValue: string
  newValue: string
  filePath: string
}

interface VersionChanges {
  projectVersion?: VersionChange
  androidVersionDisplayName?: VersionChange
  androidStoreVersion?: VersionChange
  iosVersionInfo?: VersionChange
  // iosBundleVersion?: VersionChange
}

export default class VersionUp extends Command {
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
    ios: Flags.boolean(),
    json: Flags.boolean({description: 'Output results in JSON format'}),
  }

  async run(): Promise<void> {
    const {args, flags} = await this.parse(VersionUp)

    if (!flags.json) {
      this.log(`Current working directory: ${process.cwd()}`)
    }

    const releaseType = args.type as ReleaseType

    const projectName = await findSingleFile('./*.uproject')

    if (!projectName) {
      this.error('Unable to find a unreal project in the current directory')
    }

    if (!flags.json) {
      this.log(`Detected unreal project: ${projectName}`)
    }

    const changes: VersionChanges = {}

    changes.projectVersion = await this.updateProjectVersion(releaseType)

    if (flags.android) {
      const androidChanges = await this.updateAndroidBuild(releaseType)
      changes.androidVersionDisplayName = androidChanges.androidVersionDisplayName
      changes.androidStoreVersion = androidChanges.androidStoreVersion
    }

    if (flags.ios) {
      const iosChanges = await this.updateIosBuild(releaseType)
      changes.iosVersionInfo = iosChanges.iosVersionInfo
      // changes.iosBundleVersion = iosChanges.iosBundleVersion
    }

    this.outputResults(changes, flags.json)
  }

  async updateAndroidBuild(
    releaseType: ReleaseType,
  ): Promise<{androidVersionDisplayName: VersionChange; androidStoreVersion: VersionChange}> {
    const defaultEnginePath = await findSingleFile('./Config/DefaultEngine.ini')

    if (!defaultEnginePath) {
      this.error('DefaultEngine.ini not found!')
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

    const storeVersion = Number.parseInt(
      parser.get('/Script/AndroidRuntimeSettings.AndroidRuntimeSettings', 'StoreVersion'),
      10,
    )

    const newStoreVersion = storeVersion + 1

    parser.set('/Script/AndroidRuntimeSettings.AndroidRuntimeSettings', 'StoreVersion', newStoreVersion.toString())

    await writeFile(defaultEnginePath, parser.stringify())

    return {
      androidVersionDisplayName: {
        field: 'Android VersionDisplayName',
        oldValue: projectVersion,
        newValue: newVersion,
        filePath: defaultEnginePath,
      },
      androidStoreVersion: {
        field: 'Android StoreVersion',
        oldValue: storeVersion.toString(),
        newValue: newStoreVersion.toString(),
        filePath: defaultEnginePath,
      },
    }
  }

  async updateProjectVersion(releaseType: ReleaseType): Promise<VersionChange> {
    const defaultGamePath = await findSingleFile('./Config/DefaultGame.ini')

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

    return {
      field: 'ProjectVersion',
      oldValue: projectVersion,
      newValue: newVersion,
      filePath: defaultGamePath,
    }
  }

  async updateIosBuild(releaseType: ReleaseType): Promise<{iosVersionInfo: VersionChange}> {
    const defaultEnginePath = await findSingleFile('./Config/DefaultEngine.ini')

    if (!defaultEnginePath) {
      this.error('DefaultEngine.ini not found!')
    }

    WinAttr.setSync(defaultEnginePath, {readonly: false})

    const parser = new ConfigIniParser()

    parser.parse(await readFile(defaultEnginePath, {encoding: 'utf8'}))

    const projectVersion = parser.get('/Script/IOSRuntimeSettings.IOSRuntimeSettings', 'VersionInfo')

    const newVersion = incSemver(projectVersion, releaseType)

    if (!newVersion) {
      this.error('Cannot increment version!')
    }

    parser.set('/Script/IOSRuntimeSettings.IOSRuntimeSettings', 'VersionInfo', newVersion)

    // NOTE: BundleVersion is not used in modern xcode development
    // const bundleVersion = Number.parseInt(
    //   parser.get('/Script/IOSRuntimeSettings.IOSRuntimeSettings', 'BundleVersion'),
    //   10,
    // )

    // const newBundleVersion = bundleVersion + 1

    // parser.set('/Script/IOSRuntimeSettings.IOSRuntimeSettings', 'BundleVersion', newBundleVersion.toString())

    await writeFile(defaultEnginePath, parser.stringify())

    return {
      iosVersionInfo: {
        field: 'iOS VersionInfo',
        oldValue: projectVersion,
        newValue: newVersion,
        filePath: defaultEnginePath,
      },
      // iosBundleVersion: {
      //   field: 'iOS BundleVersion',
      //   oldValue: bundleVersion.toString(),
      //   newValue: newBundleVersion.toString(),
      //   filePath: defaultEnginePath,
      // },
    }
  }

  outputResults(changes: VersionChanges, jsonOutput: boolean): void {
    if (jsonOutput) {
      this.log(JSON.stringify(changes, null, 2))
    } else {
      this.log('\nVersion Changes:')
      this.log('==================')

      if (changes.projectVersion) {
        this.log(
          `${changes.projectVersion.field}: ${changes.projectVersion.oldValue} -> ${changes.projectVersion.newValue}`,
        )
      }

      if (changes.androidVersionDisplayName) {
        this.log(
          `${changes.androidVersionDisplayName.field}: ${changes.androidVersionDisplayName.oldValue} -> ${changes.androidVersionDisplayName.newValue}`,
        )
      }

      if (changes.androidStoreVersion) {
        this.log(
          `${changes.androidStoreVersion.field}: ${changes.androidStoreVersion.oldValue} -> ${changes.androidStoreVersion.newValue}`,
        )
      }

      if (changes.iosVersionInfo) {
        this.log(
          `${changes.iosVersionInfo.field}: ${changes.iosVersionInfo.oldValue} -> ${changes.iosVersionInfo.newValue}`,
        )
      }

      // if (changes.iosBundleVersion) {
      //   this.log(`${changes.iosBundleVersion.field}: ${changes.iosBundleVersion.oldValue} -> ${changes.iosBundleVersion.newValue}`)
      // }
    }
  }
}
