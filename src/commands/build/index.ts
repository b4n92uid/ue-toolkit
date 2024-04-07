import {Args, Command, Flags} from '@oclif/core'
import boxen from 'boxen'
import {pascalCase} from 'change-case'
import {spawn} from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'

import {findSingleFile} from '../../utils/find-single-file.js'
import {getProjectVersion} from '../../utils/get-project-version.js'

interface BuildCookRunOptions {
  androidDisplayName: string | undefined
  androidPackageName: string | undefined
  config: string
  platform: string
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
        `-ini:Engine:[/Script/AndroidRuntimeSettings.AndroidRuntimeSettings]:PackageName=${options.androidPackageName}`,
      )
    }

    if (options.androidDisplayName) {
      params.push(
        // Echo\\u0020Is\\u0020Falling\\u0020[Staging]
        `-ini:Engine:[/Script/AndroidRuntimeSettings.AndroidRuntimeSettings]:ApplicationDisplayName=${options.androidDisplayName}`,
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

    const uatResult = await new Promise<number>((resolve) => {
      const uatProcess = spawn('RunUAT.bat', ['BuildCookRun', ...params], {stdio: 'inherit'})

      uatProcess.on('exit', async (code) => {
        resolve(code ?? 0)
      })
    })

    return uatResult
  }

  logHeader(message: string) {
    this.log(
      boxen(message, {
        padding: 1,
        borderStyle: 'round',
        borderColor: 'greenBright',
      }),
    )
  }

  async prepareExecutable(archiveLocation: string, projectName: string) {
    const exeLocation = await findSingleFile('*.apk', archiveLocation)

    if (!exeLocation) {
      this.error('Unable to find an apk in the packaged folder')
    }

    const version = await getProjectVersion()

    const newLocation = path.join(archiveLocation, `${projectName}-${version}.apk`)

    fs.renameSync(exeLocation, newLocation)

    console.log(newLocation)
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

    this.logHeader(`🎮 Project Name ${projectName}`)

    this.buildCookRun(projectPath, archiveLocation, {
      androidDisplayName: flags.androidDisplayName,
      androidPackageName: flags.androidPackageName,
      config: args.config,
      platform: args.platform,
    })

    this.prepareExecutable(archiveLocation, projectName)
  }
}
