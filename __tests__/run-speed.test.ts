import * as process from 'process'
import {test} from '@jest/globals'
import os from 'os'
import * as env from '../src/utils/env'
import {getTests, runTestInDocker} from '../src/utils/speed'

process.env['RUNNER_TOOL_CACHE'] = '~/runner_tool_cache'.replace(
  '~',
  os.homedir
)
process.env['RUNNER_TEMP'] = '~/runner_temp'.replace('~', os.homedir)
process.env['GITHUB_REPOSITORY'] = 'jest-test/jest-test'
const MINUTES15 = 1000 * 60 * 15
// shows how the runner will run a javascript action with env / stdout protocol

test(
  'test speed',
  async () => {
    const sourceDir = process.env.ONEFLOW_SRC || '~/oneflow'
    env.setInput('oneflow-src', sourceDir)
    env.setInput('oneflow-models', '~/models')
    env.setMultilineInput('runner-labels', [
      'self-hosted',
      'linux',
      'provision'
    ])
    const entryIncludes = await getTests()
    env.setInput('test-cache-dir', '~/speed-test-cache-dir')
    const TEST_WITH_TORCH_IMG_TAG =
      'registry.cn-beijing.aliyuncs.com/oneflow/test-with-pytorch-1.9.0:e7a497b41d8b7f1bce055b1f23d027f93b1557ae'
    for (const entry of entryIncludes) {
      await runTestInDocker('ls', TEST_WITH_TORCH_IMG_TAG)
    }
  },
  MINUTES15
)
