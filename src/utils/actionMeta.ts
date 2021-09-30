import yaml from 'js-yaml'
import fs from 'fs'

import * as glob from '@actions/glob'
import * as core from '@actions/core'
import * as path from 'path'
import {ok} from 'assert'

type Meta = {
  inputs?: {
    'action-type'?: {
      default?: string
    }
  }
}
export async function checkAction(): Promise<void> {
  process.env.GITHUB_WORKSPACE = process.cwd()
  const pattern = ['**/action.yml', '**/action.yaml', '!**/.github'].join('\n')
  const globber = await glob.create(pattern)
  const files = await globber.glob()
  ok(files.length > 0, `no files found: ${pattern}`)
  const results = await Promise.all(files.map(checkFile))
  ok(results.every(Boolean), 'illegal action meta found')
  core.info(results.map(x => `'${x}'`).join(' | '))
}
async function checkFile(f: string): Promise<string | null> {
  const content = await fs.promises.readFile(f, 'utf8')
  const doc = yaml.load(content) as Meta
  let result = null
  if (doc.inputs) {
    if (doc.inputs['action-type'] && doc.inputs['action-type'].default) {
      const actionType = path.relative(process.cwd(), path.dirname(f))
      const default_ = doc.inputs['action-type'].default
      const isAllowedName =
        default_ === actionType || default_ === 'build-oneflow'
      if (isAllowedName) {
        result = default_
      } else {
        core.info(`action-type should be ${actionType}, not ${default_}`)
      }
    } else {
      core.info(`[no default] ${f}`)
    }
  } else {
    core.info(`[no inputs] ${f}`)
  }
  return result
}
