import * as process from 'process'
import {test} from '@jest/globals'
import os from 'os'
import * as env from '../src/utils/env'
import {benchmarkRefreshLog} from '../src/utils/benchmark'
process.env['RUNNER_TOOL_CACHE'] = '~/runner_tool_cache'.replace(
  '~',
  os.homedir
)
process.env['RUNNER_TEMP'] = '~/runner_temp'.replace('~', os.homedir)
process.env['GITHUB_REPOSITORY'] = 'jest-test/jest-test'
const MINUTES15 = 1000 * 60 * 15
// shows how the runner will run a javascript action with env / stdout protocol

test(
  'cache test matrix',
  async () => {
    if (!process.env['BENCHMARK']) {
      return
    }
    env.setInput('pytest-script', '~/vision/benchmark/test_alexnet.py')
    env.setInput('benchmark-id', 'test-benchmark-id')
    env.setMultilineInput('pytest-args', [])
    env.setMultilineInput('pytest-compare-args', [])
    env.setInput('container-name', `test-${os.userInfo().username}`)
    await benchmarkRefreshLog()
  },
  MINUTES15
)
