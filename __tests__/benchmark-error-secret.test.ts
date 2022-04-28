import * as process from 'process'
import {test} from '@jest/globals'
import os from 'os'
import * as env from '../src/utils/env'
import {
  benchmarkWithPytest,
  updateBenchmarkHistory
} from '../src/utils/benchmark'
process.env['RUNNER_TOOL_CACHE'] = '~/runner_tool_cache'.replace(
  '~',
  os.homedir
)
process.env['RUNNER_TEMP'] = '~/runner_temp'.replace('~', os.homedir)
process.env['GITHUB_REPOSITORY'] = 'jest-test/jest-test'

process.env['OSS_ACCESS_KEY_SECRET='] = 'hahaha'
const MINUTES15 = 1000 * 60 * 15
// shows how the runner will run a javascript action with env / stdout protocol

test(
  'cache test matrix',
  async () => {
    if (!process.env['BENCHMARK']) {
      return
    }
    env.setInput('collect-path', '/home/yuhao/vision/benchmark')
    env.setInput('container-name', `test-${os.userInfo().username}`)
    env.setInput('unknown-threshold', '100')
    env.setInput('error-threshold', '100')
    await benchmarkWithPytest()
  },
  MINUTES15
)
