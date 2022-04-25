import {test} from '@jest/globals'
import {parseLine} from '../src/utils/collectStatus'
import * as env from '../src/utils/env'
import os from 'os'
import * as fs from 'fs'
import * as readline from 'readline'
import {coerce} from 'semver'
import * as core from '@actions/core'

const MINUTES15 = 1000 * 60 * 15
// shows how the runner will run a javascript action with env / stdout protocol
process.env['RUNNER_TEMP'] = '~/runner_temp'.replace('~', os.homedir)
process.env['GITHUB_REPOSITORY'] = 'Oneflow-Inc/get-oneflow'
test(
  'cache test matrix',
  async () => {
    if (!process.env['PARSE']) {
      return
    }
    const file = '/Users/tsai/Downloads/logs_5533/1_Collect PR Status (1).txt'
    const fileStream = fs.createReadStream(file)
    const rl = readline.createInterface({
      input: fileStream,
      crlfDelay: Infinity
    })
    const caseNames: string[] = []
    for await (const line of rl) {
      const isInOneFlowTest = line.includes('python/oneflow/test')
      if (isInOneFlowTest) {
        const parsed = await parseLine(line)
        caseNames.push(parsed)
      }
    }
    const summary = Object.assign(
      {},
      ...Array.from(new Set(caseNames), key => ({
        [key]: caseNames.filter((value: string) => value === key).length
      }))
    )
    core.info(`summary: ${JSON.stringify(summary, null, 2)}`)
  },
  MINUTES15
)
