import * as process from 'process'
import {test} from '@jest/globals'
import os from 'os'
import * as env from '../src/utils/env'
import {setBuildMatrix, setTestMatrix} from '../src/utils/matrix'

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
    const sourceDir = process.env.ONEFLOW_SRC || '~/oneflow'
    env.setInput('oneflow-src', sourceDir)
    env.setBooleanInput('include-distributed', false)
    env.setInput('world-size', '1')
    env.setInput('oneflow-src', sourceDir)
    env.setMultilineInput('runner-labels', ['self-hosted', 'linux'])
    await setTestMatrix()
  },
  MINUTES15
)

test(
  'cache test matrix',
  async () => {
    const sourceDir = process.env.ONEFLOW_SRC || '~/oneflow'
    env.setInput('oneflow-src', sourceDir)
    env.setBooleanInput('include-distributed', false)
    env.setInput('world-size', '1')
    env.setMultilineInput('runner-labels', [
      'self-hosted',
      'linux',
      'provision'
    ])
    await setTestMatrix()
  },
  MINUTES15
)

test(
  'cache test matrix',
  async () => {
    const sourceDir = process.env.ONEFLOW_SRC || '~/oneflow'
    env.setInput('oneflow-src', sourceDir)
    env.setBooleanInput('include-distributed', true)
    env.setInput('world-size', '2')
    env.setMultilineInput('runner-labels', [
      'self-hosted',
      'linux',
      'provision'
    ])
    await setTestMatrix()
  },
  MINUTES15
)

test(
  'cache build matrix',
  async () => {
    const sourceDir = process.env.ONEFLOW_SRC || '~/oneflow'
    env.setInput('oneflow-src', sourceDir)
    env.setMultilineInput('entries', ['cpu', 'cuda', 'cuda-xla'])
    env.setBooleanInput('delete-cache', true)
    env.setMultilineInput('runner-labels', [
      'self-hosted',
      'linux',
      'provision'
    ])
    await setBuildMatrix()
  },
  MINUTES15
)
