import {Args, Command, Flags} from '@oclif/core'
import {pascalCase} from 'change-case'
import {spawn} from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'

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

    try {
      await this.runUAT(options.verbose, params)
    } catch (error) {
      if (error instanceof Error) {
        this.error(error.message)
      } else {
        this.error('Unknown error')
      }
    }
  }

  async runUAT(verbose: boolean, params: string[]) {
    const engineLocation = await getEngineLocation()

    if (!engineLocation) {
      this.error('Unable to find the engine location')
    }

    const uat = path.join(engineLocation, 'Engine', 'Build', 'BatchFiles', 'RunUAT.bat')

    return new Promise((resolve, reject) => {
      const process = spawn(uat, ['BuildCookRun', ...params], {
        stdio: verbose ? 'inherit' : 'pipe',
        shell: true,
      })

      process.stdout?.on('data', (data: Buffer) => {
        const line = data.toString()

        if (verbose) {
          this.log(line)
          return
        }

        if (/BUILD COMMAND STARTED/.test(line)) {
          this.log('⚒️ Build command started')
        }

        if (/COOK COMMAND STARTED/.test(line)) {
          this.log('🍳 Cook command started')
        }

        if (/STAGE COMMAND STARTED/.test(line)) {
          this.log('📚 Stage command started')
        }

        if (/PACKAGE COMMAND STARTED/.test(line)) {
          this.log('📦 Package command started')
        }

        if (/Making .apk with Gradle.../.test(line)) {
          this.log('📱 Making APK')
        }

        if (/ARCHIVE COMMAND STARTED/.test(line)) {
          this.log('💾 Archive command started')
        }

        if (/AutomationTool exiting with ExitCode=0/.test(line)) {
          this.log('✅ Building complete')
        }
      })

      process.stderr?.on('data', (data: Buffer) => {
        this.error(data.toString())
      })

      process.on('close', (code) => {
        if (code && code !== 0) {
          reject(new Error('UAT failed'))
        } else {
          resolve(true)
        }
      })
    })
  }

  async copyArtifact(options: CopyArtifactOptions) {
    this.log(`⚙️ Exposing artifacts...`)

    const projectBasename = path.basename(this._projectFile!, '.uproject')
    const projectVersion = await getProjectVersion()
    const artifactBasename = [projectBasename, options.flavor, projectVersion]

    const newLocation = path.join(this._outputLocation ?? '', artifactBasename.join('-') + '.apk')

    if (fs.existsSync(newLocation)) {
      fs.existsSync(newLocation)
    }

    const exeLocation = await findSingleFile('*.apk', this._outputLocation)

    if (!exeLocation) {
      this.error('Unable to find an apk in the packaged folder')
    }

    fs.renameSync(exeLocation, newLocation)

    this.log(`🎉 ${newLocation}`)
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

    this.log(`🚀 Unreal ToolKit`)
    this.log(`🎮 ${this._projectFile}`)

    await this.buildCookRun({
      config: args.config,
      platform: args.platform,
      flavor: args.flavor,
      verbose: flags.verbose,
    })

    await this.copyArtifact({
      config: args.config,
      platform: args.platform,
      flavor: args.flavor,
      verbose: flags.verbose,
    })
  }
}
