import * as core from '@actions/core'
import {InputOptions} from '@actions/core'
import os from 'os'

export function getPathInput(name: string, options?: InputOptions): string {
  return core.getInput(name, options).replace('~', os.homedir)
}
