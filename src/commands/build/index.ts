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
import {getProjectVersion} from '../../utils/get-project-version.js'

interface BuildCookRunOptions {
  androidDisplayName: string | undefined
  androidPackageName: string | undefined
  config: string
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
  }

  static override description = 'Build cook run'

  static override flags = {
    cwd: Flags.string(),
    androidDisplayName: Flags.string({char: 'n'}),
    androidPackageName: Flags.string({char: 'p'}),
  }

  async buildCookRun(projectPath: string, archiveLocation: string, options: BuildCookRunOptions) {
    const params = [`-Project=${projectPath}`]

    if (options.androidPackageName) {
      params.push(
        formatConfigOverride({
          file: 'Engine',
          section: '/Script/AndroidRuntimeSettings.AndroidRuntimeSettings',
          key: 'PackageName',
          value: options.androidPackageName,
        }),
      )
    }

    if (options.androidDisplayName) {
      params.push(
        formatConfigOverride({
          file: 'Engine',
          section: '/Script/AndroidRuntimeSettings.AndroidRuntimeSettings',
          key: 'ApplicationDisplayName',
          value: escapeToUnicode(options.androidDisplayName),
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
      `-ArchiveDirectory=${archiveLocation}`,
    )

    const engineLocation = 'E:\\games\\UE_5.3'
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

  async prepareExecutable(archiveLocation: string, projectName: string) {
    const exeLocation = await findSingleFile('*.apk', archiveLocation)

    if (!exeLocation) {
      this.error('Unable to find an apk in the packaged folder')
    }

    const version = await getProjectVersion()

    const newLocation = path.join(archiveLocation, `${projectName}-${version}.apk`)
    fs.renameSync(exeLocation, newLocation)

    return newLocation
  }

  public async run(): Promise<void> {
    const {args, flags} = await this.parse(Build)

    if (flags.cwd) {
      process.chdir(flags.cwd)
    }

    const projectPath = await findSingleFile('*.uproject', flags.cwd)

    if (!projectPath) {
      this.error('Unable to find a unreal project in the current directory')
    }

    const projectLocation = path.dirname(projectPath)

    const archiveLocation = path.join(projectLocation, 'Packaged', [args.platform, args.type, args.config].join(''))

    const projectName = path.basename(projectPath, '.uproject')

    this.log(
      boxen(`🎮 Project Name: ${projectName}`, {
        padding: 1,
        borderStyle: 'round',
        borderColor: 'greenBright',
      }),
    )

    const buildingTask = ora(`🏗️ Building...`).start()

    await this.buildCookRun(projectPath, archiveLocation, {
      androidDisplayName: flags.androidDisplayName,
      androidPackageName: flags.androidPackageName,
      config: args.config,
      platform: args.platform,
      verbose: false,
    })

    buildingTask.stopAndPersist({
      text: `✅ Building complete`,
    })

    const copyingTask = ora(`📦 Copying...`).start()

    const executableLocation = await this.prepareExecutable(archiveLocation, projectName)

    copyingTask.stopAndPersist({text: `✅ Copying complete: ${executableLocation}`})
  }
}
