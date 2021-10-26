import * as process from 'process'
import {test} from '@jest/globals'
import os from 'os'
import * as env from '../src/utils/env'
import * as findWheel from '../src/utils/findWheel'

process.env['RUNNER_TOOL_CACHE'] = '~/runner_tool_cache'.replace(
  '~',
  os.homedir
)
process.env['RUNNER_TEMP'] = '~/runner_temp'.replace('~', os.homedir)
const MINUTES15 = 1000 * 60 * 15

test(
  'find wheel',
  async () => {
    // TODO: generate credential to run the test on gh hosted
    env.setInput('ref', '38a3746d52b698178ac89830ecb0eb53e19f60f4')
    env.setInput('entry', 'cu102')
    await findWheel.findWheel()
  },
  MINUTES15
)
