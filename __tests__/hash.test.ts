import * as process from 'process'
import * as path from 'path'
import {test} from '@jest/globals'
import os from 'os'
import * as env from '../src/utils/env'
import {ok} from 'assert'
import * as cpExec from '../src/utils/cpExec'
import * as cache from '../src/utils/cache'

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
    env.setInput('digest-type', 'build')
    env.setBooleanInput('mark-as-completed', true)
    env.setBooleanInput('check-not-completed', true)
    env.setMultilineInput('runner-labels', [
      'self-hosted',
      'linux',
      'provision'
    ])
    const hash = await cache.getOneFlowSrcDigest({
      includeTests: false,
      includeSingleClient: false
    })
  },
  MINUTES15
)
