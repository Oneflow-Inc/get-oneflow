import {test} from '@jest/globals'
import {waitForGPURunner} from '../src/utils/wait'
import * as env from '../src/utils/env'
import os from 'os'

const MINUTES15 = 1000 * 60 * 15
process.env['RUNNER_TEMP'] = '~/runner_temp'.replace('~', os.homedir)
process.env['GITHUB_REPOSITORY'] = 'Oneflow-Inc/get-oneflow'
test(
  'wait gpu',
  async () => {
    if (!process.env['WAIT']) {
      return
    }
    env.setInput('max-try-times', '3')
    env.setInput('timeout-minutes', '1')
    await waitForGPURunner()
  },
  MINUTES15
)
