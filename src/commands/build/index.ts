import spawn from '@npmcli/promise-spawn'
import {Args, Command, Flags} from '@oclif/core'
import boxen from 'boxen'
import {pascalCase} from 'change-case'
import fs from 'node:fs'
import path from 'node:path'
import ora from 'ora'

import {escapeToUnicode} from '../../utils/escape-to-unicode.js'
import {findSingleFile} from '../../utils/find-single-file.js'
import {formatConfigOverride} from '../../utils/format-config-override.js'
import {getEngineLocation} from '../../utils/get-engine-location.js'
import {getPackageName} from '../../utils/get-package-name.js'
import {getProjectName} from '../../utils/get-project-name.js'
import {getProjectVersion} from '../../utils/get-project-version.js'

interface BuildCookRunOptions {
  config: string
  flavor?: string
  platform: string
  verbose: boolean
}

interface CopyArtifactOptions {
  config: string
  flavor?: string
  platform: string
  verbose: boolean
}
export default class Build extends Command {
  static override args = {
    platform: Args.string({
      description: 'Target platform',
      options: ['android', 'windows', 'linux'],
      parse: async (v) => pascalCase(v),
      required: true,
    }),
    type: Args.string({
      description: 'Running type',
      options: ['client', 'server'],
      parse: async (v) => pascalCase(v),
      required: true,
    }),
    config: Args.string({
      description: 'Running config',
      options: ['test', 'debug', 'development', 'shipping'],
      parse: async (v) => pascalCase(v),
      required: true,
    }),
    flavor: Args.string({
      description: 'Flavor',
      required: false,
    }),
  }

  static override description = 'Build cook run'

  static override flags = {
    cwd: Flags.string(),
    verbose: Flags.boolean(),
  }

  private _projectLocation: string | undefined
  private _projectFile: string | undefined
  private _projectName: string | undefined
  private _outputLocation: string | undefined

  async buildCookRun(options: BuildCookRunOptions) {
    const params = [`-Project=${this._projectFile}`]

    const projectName = await getProjectName()
    const packageName = await getPackageName()

    if (options.flavor) {
      params.push(
        formatConfigOverride({
          file: 'Engine',
          section: '/Script/AndroidRuntimeSettings.AndroidRuntimeSettings',
          key: 'PackageName',
          value: `${packageName}.${options.flavor}`,
        }),
        formatConfigOverride({
          file: 'Engine',
          section: '/Script/AndroidRuntimeSettings.AndroidRuntimeSettings',
          key: 'ApplicationDisplayName',
          value: escapeToUnicode(`${projectName} [${options.flavor}]`),
        }),
      )
    }

    params.push(
      '-SaveConfigOverrides',
      '-NoP4',
      `-ClientConfig=${options.config}`,
      `-ServerConfig=${options.config}`,
      '-NoCompilEditor ',
      '-UTF8Output',
      `-Platform=${options.platform}`,
      '-CookFlavor=ETC2',
      '-Build',
      '-Cook',
      '-CookCultures=en',
      '-UnVersionedCookedContent',
      '-Stage',
      '-Package',
      '-Archive',
      `-ArchiveDirectory=${this._outputLocation}`,
    )

    const engineLocation = await getEngineLocation()

    if (!engineLocation) {
      this.error('Unable to find the engine location')
    }

    const uat = path.join(engineLocation, 'Engine', 'Build', 'BatchFiles', 'RunUAT.bat')

    try {
      const uatResult = await spawn(uat, ['BuildCookRun', ...params], {
        stdio: options.verbose ? 'inherit' : 'ignore',
        shell: true,
      })

      return uatResult
    } catch (error) {
      if (error instanceof Error) {
        this.error(error.message)
      } else {
        this.error('Unknown error')
      }
    }
  }

  async copyArtifact(options: CopyArtifactOptions) {
    const exeLocation = await findSingleFile('*.apk', this._outputLocation)

    if (!exeLocation) {
      this.error('Unable to find an apk in the packaged folder')
    }

    const version = await getProjectVersion()

    const basename = [this._projectName, options.flavor, version]
    const newLocation = path.join(this._outputLocation ?? '', basename.join('-') + '.apk')
    fs.renameSync(exeLocation, newLocation)

    return newLocation
  }

  public async run(): Promise<void> {
    const {args, flags} = await this.parse(Build)

    if (flags.cwd) {
      process.chdir(flags.cwd)
    }

    this._projectFile = await findSingleFile('*.uproject', flags.cwd)

    if (!this._projectFile) {
      this.error('Unable to find a unreal project in the current directory')
    }

    this._projectLocation = path.dirname(this._projectFile)

    this._outputLocation = path.join(
      this._projectLocation,
      'Packaged',
      [args.platform, args.type, args.config].join(''),
    )

    this._projectName = path.basename(this._projectFile, '.uproject')

    this.log(
      boxen(`🎮 Project Name: ${this._projectName}`, {
        padding: 1,
        borderStyle: 'round',
        borderColor: 'greenBright',
      }),
    )

    const buildingTask = ora(`🏗️ Building...`).start()

    await this.buildCookRun({
      config: args.config,
      platform: args.platform,
      flavor: args.flavor,
      verbose: flags.verbose,
    })

    buildingTask.stopAndPersist({
      text: `✅ Building complete`,
    })

    const copyingTask = ora(`📦 Copying...`).start()

    const executableLocation = await this.copyArtifact({
      config: args.config,
      platform: args.platform,
      flavor: args.flavor,
      verbose: flags.verbose,
    })

    copyingTask.stopAndPersist({text: `✅ Copying complete: ${executableLocation}`})
  }
}
