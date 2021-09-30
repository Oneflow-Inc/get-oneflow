import * as process from 'process'
import {test} from '@jest/globals'
import os from 'os'
import * as actionMeta from '../src/utils/actionMeta'
import {setTestMatrix} from '../src/utils/matrix'

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
    await actionMeta.checkAction()
  },
  MINUTES15
)
