import * as process from 'process'
import {test} from '@jest/globals'
import os from 'os'
import * as env from '../src/utils/env'
import {setTestMatrix} from '../src/utils/matrix'

process.env['RUNNER_TOOL_CACHE'] = '~/runner_tool_cache'.replace(
  '~',
  os.homedir
)
process.env['RUNNER_TEMP'] = '~/runner_temp'.replace('~', os.homedir)
const MINUTES15 = 1000 * 60 * 15
// shows how the runner will run a javascript action with env / stdout protocol

test(
  'cache test matrix',
  async () => {
    const np = process.execPath
    const sourceDir = process.env.ONEFLOW_SRC || '~/oneflow'
    env.setInput('oneflow-src', sourceDir)
    env.setMultilineInput('runner-labels', [
      'self-hosted',
      'linux',
      'provision'
    ])
    await setTestMatrix()
  },
  MINUTES15
)
