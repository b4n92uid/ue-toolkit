import {Args, Command, Flags} from '@oclif/core'
import {compact, lowerCase, map} from 'lodash-es'
import {spawn} from 'node:child_process'
import fs from 'node:fs'
import fsp from 'node:fs/promises'
import path from 'node:path'

import {escapeToUnicode} from '../../utils/escape-to-unicode.js'
import {findSingleFile} from '../../utils/find-single-file.js'
import {formatConfigOverride} from '../../utils/format-config-override.js'
import {getEngineLocation} from '../../utils/get-engine-location.js'
import {getPackageName} from '../../utils/get-package-name.js'
import {getProjectName} from '../../utils/get-project-name.js'
import {getProjectVersion} from '../../utils/get-project-version.js'

type DefineDict = Record<string, string>

// const PLATFORM_OPTIONS = ['Android', 'Windows', 'Linux'] as const

// const TYPE_OPTIONS = ['Client', 'Server'] as const

// const CONFIG_OPTIONS = ['Test', 'Debug', 'Development', 'Shipping'] as const

interface BuildCookRunOptions {
  config: string
  flavor?: string
  platform: string
  verbose: boolean
  defines: DefineDict
}

interface CopyArtifactOptions {
  config: string
  flavor?: string
  expose?: string
}
export default class Build extends Command {
  static override args = {
    platform: Args.string({
      description: 'Target platform',
      options: ['Android', 'Windows', 'Linux'],
      required: true,
    }),
    type: Args.string({
      description: 'Running type',
      options: ['Client', 'Server'],
      required: true,
    }),
    config: Args.string({
      description: 'Running config',
      options: ['Test', 'Debug', 'Development', 'Shipping'],
      required: true,
    }),
  }

  static override description = 'Build cook run'

  static override flags = {
    cwd: Flags.string(),
    output: Flags.string({default: '.'}),
    expose: Flags.string(),
    verbose: Flags.boolean(),
    copy: Flags.boolean({default: true, allowNo: true}),
    define: Flags.string({
      multiple: true,
      char: 'd',
    }),
    flavor: Flags.string({
      required: false,
    }),
  }

  private _projectLocation: string | undefined
  private _projectFile: string | undefined
  private _projectFileBase: string | undefined
  private _projectName: string | undefined
  private _packageName: string | undefined
  private _projectVersion: string | undefined
  private _outputLocation: string | undefined

  async buildCookRun(options: BuildCookRunOptions) {
    this.log(
      `🔧 Starting build process for ${options.platform} ${options.config}${
        options.flavor ? ` (${options.flavor})` : ''
      }`,
    )

    let params = [`-Project=${this._projectFile}`]

    if (options.flavor && options.flavor !== 'Prod') {
      this.log(`🏷️  Applying flavor config: ${options.flavor}`)
      params = [
        ...params,
        formatConfigOverride({
          file: 'Engine',
          section: '/Script/AndroidRuntimeSettings.AndroidRuntimeSettings',
          key: 'PackageName',
          value: `${this._packageName}.${lowerCase(options.flavor)}`,
        }),
        formatConfigOverride({
          file: 'Engine',
          section: '/Script/AndroidRuntimeSettings.AndroidRuntimeSettings',
          key: 'ApplicationDisplayName',
          value: escapeToUnicode(`${this._projectName} [${options.flavor}]`),
        }),
      ]
    }

    params = [
      ...params,
      '-SaveConfigOverrides',
      '-NoP4',
      `-ClientConfig=${options.config}`,
      `-ServerConfig=${options.config}`,
      '-NoCompilEditor ',
      '-UTF8Output',
      `-Platform=${options.platform}`,
      '-CookFlavor=ETC2',
      options.config === 'Shipping' ? '-Distribution' : '',
      '-Build',
      '-Cook',
      '-CookCultures=en',
      '-UnVersionedCookedContent',
      '-Stage',
      '-Package',
      '-Archive',
      `-ArchiveDirectory=${this._outputLocation}`,
    ]

    this.log(`🚀 Executing UAT BuildCookRun...`)
    await this.runUAT(options.verbose, options.defines, compact(params))
  }

  async runUAT(verbose: boolean, defines: DefineDict, params: string[]) {
    if (Object.keys(defines).length > 0) {
      this.log(`🔑 Applying custom defines: ${Object.keys(defines).join(', ')}`)
    }

    const engineLocation = await getEngineLocation()

    if (!engineLocation) {
      this.error('Unable to find the engine location')
    }

    const uatPath = path.join(engineLocation, 'Engine', 'Build', 'BatchFiles', 'RunUAT.bat')

    return new Promise((resolve, reject) => {
      const uatProc = spawn(uatPath, ['BuildCookRun', ...params], {
        stdio: verbose ? 'inherit' : 'pipe',
        shell: true,
        env: {...process.env, ...defines},
      })

      uatProc.stdout?.on('data', (data: Buffer) => {
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

      uatProc.stderr?.on('data', (data: Buffer) => {
        this.error(data.toString())
      })

      uatProc.on('close', (code) => {
        if (code && code !== 0) {
          reject(new Error('UAT failed'))
        } else {
          this.log('✨ UAT process completed successfully')
          resolve(true)
        }
      })
    })
  }

  async copyArtifact(options: CopyArtifactOptions) {
    this.log(`⚙️ Exposing artifacts...`)

    const copyByExt = async (pattern: string) => {
      const exeLocation = await findSingleFile(pattern, this._outputLocation)

      if (!exeLocation) {
        throw new Error(`Unable to find ${pattern} in the packaged folder`)
      }

      const ext = path.extname(exeLocation)

      const newFileName = [
        //
        this._projectFileBase,
        options.config,
        options.flavor,
        '-',
        this._projectVersion,
        ext,
      ].join('')

      const newLocationDir = options.expose ?? this._outputLocation ?? ''
      const newLocation = path.join(newLocationDir, newFileName)

      if (fs.existsSync(newLocation)) {
        await fsp.unlink(newLocation)
      }

      await fsp.copyFile(exeLocation, newLocation)

      this.log(`🎉 ${newLocation}`)
    }

    await copyByExt(`${this._projectFileBase}*.apk`).catch((error) => this.error(error))
    await copyByExt(`${this._projectFileBase}*.aab`).catch((error) => this.error(error))
  }

  public async parseDefines(defines: string[]): Promise<DefineDict> {
    return Object.fromEntries(
      map(defines, (define) => {
        const [key, value] = define.split('=')
        return [key, value]
      }),
    )
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

    this.log(`📄 Project file: ${this._projectFile}`)

    this._projectLocation = path.dirname(this._projectFile)

    this._projectFileBase = path.basename(this._projectFile, '.uproject')

    this._outputLocation = path.resolve(
      process.cwd(),
      path.join(flags.output, [args.platform, args.type, args.config, flags.flavor].join('')),
    )

    this.log(`📂 Output directory: ${this._outputLocation}`)

    this._projectVersion = await getProjectVersion()

    this._projectName = await getProjectName()

    this._packageName = await getPackageName()

    this.log(`🎮 ${this._projectName} v${this._projectVersion}`)

    const defines = await this.parseDefines(flags.define ?? [])

    try {
      await this.buildCookRun({
        config: args.config,
        platform: args.platform,
        flavor: flags.flavor,
        verbose: flags.verbose,
        defines,
      })

      if (flags.copy) {
        await this.copyArtifact({
          config: args.config,
          expose: flags.expose,
          flavor: flags.flavor,
        })
      }
    } catch (error) {
      if (error instanceof Error) {
        this.error(error.message)
      } else {
        this.error('Unknown error')
      }
    }
  }
}
