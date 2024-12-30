import {execSync} from 'node:child_process'

export type P4StatusOutput =
  | {
      success: true
      data: {
        path: string
      }[]
    }
  | {
      success: false
      error: Error
    }

export type P4CommitOutput =
  | {
      success: true
      data:
        | {
            change: string
          }
        | undefined
    }
  | {
      success: false
      error: Error
    }

export type P4EditOutput =
  | {
      success: true
      data: {
        path: string
      }[]
    }
  | {
      success: false
      error: Error
    }

export abstract class P4 {
  static status(): P4StatusOutput {
    try {
      const output = execSync('p4 status', {encoding: 'utf8'})
      const result = P4._outputToJSON(output)

      return {
        success: true,
        data: result.map((line) => {
          const parts = line.split(' - ')

          return {
            path: parts[0],
          }
        }),
      }
    } catch (error) {
      return {
        success: false,
        error: error as Error,
      }
    }
  }

  static commit(message: string): P4CommitOutput {
    try {
      const output = execSync(`p4 commit -m "${message}"`, {encoding: 'utf8'})
      const result = P4._outputToJSON(output)

      return {
        success: true,
        data: result
          .map((line) => {
            const parts = line.split('#')

            return {
              change: parts[1].trim(),
            }
          })
          .at(0),
      }
    } catch (error) {
      return {
        success: false,
        error: error as Error,
      }
    }
  }

  static edit(files: string[], changelist: string): P4EditOutput {
    try {
      const output = execSync(`p4 edit -c ${changelist} ${files.join(' ')}`, {encoding: 'utf8'})
      const result = P4._outputToJSON(output)

      return {
        success: true,
        data: result.map((line) => {
          const parts = line.split(' - ')

          return {
            path: parts[0],
          }
        }),
      }
    } catch (error) {
      return {
        success: false,
        error: error as Error,
      }
    }
  }

  private static _outputToJSON(output: string): string[] {
    return output.split('\n').filter((line) => line.trim() !== '')
  }
}
