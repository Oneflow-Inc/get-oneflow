import * as process from 'process'
import * as path from 'path'
import {test} from '@jest/globals'
import os from 'os'
import * as env from '../src/utils/env'
import {ok} from 'assert'
import * as cpExec from '../src/utils/cpExec'
import {
  checkComplete,
  getOneFlowBuildCacheKeys,
  removeComplete
} from '../src/utils/cache'
import * as matrix from '../src/utils/matrix'
process.env['RUNNER_TOOL_CACHE'] = '~/runner_tool_cache'.replace(
  '~',
  os.homedir
)
process.env['RUNNER_TEMP'] = '~/runner_temp'.replace('~', os.homedir)
process.env['GITHUB_REPOSITORY'] = 'jest-test/jest-test'

const MINUTES15 = 1000 * 60 * 15
// shows how the runner will run a javascript action with env / stdout protocol

test(
  'cache complete',
  async () => {
    const np = process.execPath
    const sourceDir = process.env.ONEFLOW_SRC || '~/oneflow'
    env.setInput('oneflow-src', sourceDir)
    const ENTRY = 'jest-test'
    env.setInput('entry', ENTRY)
    // TODO: test multiple types of digest
    env.setInput('digest-type', 'single-client-test')
    const keys = await getOneFlowBuildCacheKeys(ENTRY)
    env.setBooleanInput('mark-as-completed', true)
    env.setBooleanInput('check-not-completed', true)
    env.setMultilineInput('runner-labels', [
      'self-hosted',
      'linux',
      'provision'
    ])
    await removeComplete(keys)
    ok(!(await checkComplete(keys)))
    await cpExec.cpExec(
      np,
      path.join(__dirname, '..', 'lib', 'cacheComplete.js')
    )
    env.setTestState('keys', keys)
    await cpExec.cpExec(
      np,
      path.join(__dirname, '..', 'lib', 'postCacheComplete.js')
    )
    ok(await checkComplete(keys))
    env.setBooleanInput('check-not-completed', false)
    await cpExec.cpExec(
      np,
      path.join(__dirname, '..', 'lib', 'cacheComplete.js')
    )
  },
  MINUTES15
)

test(
  'cache build matrix',
  async () => {
    const np = process.execPath
    const sourceDir = process.env.ONEFLOW_SRC || '~/oneflow'
    env.setInput('oneflow-src', sourceDir)
    env.setMultilineInput('entries', ['entryA', 'entryB', 'entryC'])
    env.setMultilineInput('runner-labels', [
      'self-hosted',
      'linux',
      'provision'
    ])
    process.env['OSS_ACCESS_KEY_ID'] = ''
    process.env['OSS_ACCESS_KEY_SECRET'] = ''
    await matrix.setBuildMatrix()
  },
  MINUTES15
)
