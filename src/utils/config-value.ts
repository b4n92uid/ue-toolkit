import {ConfigIniParser} from 'config-ini-parser'
import {readFileSync, writeFileSync} from 'node:fs'

export type ConfigFile = 'Engine' | 'Game'

export class ConfigValue {
  private _parser: ConfigIniParser
  private _filePath: string

  constructor(private file: ConfigFile, private section: string, private key: string) {
    this._filePath = `./Config/Default${this.file}.ini`

    this._parser = new ConfigIniParser()
    this._parser.parse(readFileSync(this._filePath, {encoding: 'utf8'}))
  }

  public getValue(): string {
    return this._parser.get(this.section, this.key)
  }

  public getValueAsNumber(): number {
    return this._parser.getNumber(this.section, this.key)
  }

  public getValueAsBoolean(): boolean {
    return this._parser.getBoolean(this.section, this.key)
  }

  public setValue(value: string | number | boolean) {
    if (typeof value !== 'string') value = value.toString()
    this._parser.set(this.section, this.key, value)

    writeFileSync(this._filePath, this._parser.stringify())
  }

  public static modify(file: ConfigFile, section: string, key: string, cb: (v: string) => string) {
    const cv = new ConfigValue(file, section, key)
    cv.setValue(cb(cv.getValue()))
  }

  public static modifyNumber(file: ConfigFile, section: string, key: string, cb: (v: number) => number) {
    const cv = new ConfigValue(file, section, key)
    cv.setValue(cb(cv.getValueAsNumber()))
  }
}
