import {test} from '@jest/globals'
import {updateBenchmarkHistory} from '../src/utils/benchmark'
import * as env from '../src/utils/env'
import os from 'os'

const MINUTES15 = 1000 * 60 * 15
// shows how the runner will run a javascript action with env / stdout protocol
process.env['RUNNER_TEMP'] = '~/runner_temp'.replace('~', os.homedir)
process.env['GITHUB_REPOSITORY'] = 'Oneflow-Inc/get-oneflow'
test(
  'cache test matrix',
  async () => {
    await updateBenchmarkHistory(82)
  },
  MINUTES15
)
