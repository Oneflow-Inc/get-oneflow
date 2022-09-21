import * as process from 'process'
import {test} from '@jest/globals'
import os from 'os'
import * as env from '../src/utils/env'
import * as ssh from '../src/utils/ssh'
import {isOnPremise} from '../src/utils/util'

process.env['RUNNER_TOOL_CACHE'] = '~/runner_tool_cache'.replace(
  '~',
  os.homedir
)
process.env['RUNNER_TEMP'] = '~/runner_temp'.replace('~', os.homedir)
const MINUTES15 = 1000 * 60 * 15

test(
  'ssh tank',
  async () => {
    if (isOnPremise() == false) {
      return
    }
    const TEST_SSH = process.env['TEST_SSH'] || ''
    if (!TEST_SSH) {
      return
    }
    // TODO: generate credential to run the test on gh hosted
    env.setInput('src-dir', 'src')
    env.setInput('digest', 'test-digest')
    env.setInput('entry', 'test-entry')
    env.setInput('dst-dir', 'bin')
    // TODO: create file if test dir is empty
    env.setInput('ssh-tank-host', '127.0.0.1')
    env.setInput('ssh-tank-path', '~/tank'.replace('~', os.homedir))
    env.setInput('digest-cache-dir', '~/digest-cache'.replace('~', os.homedir))
    // TODO: start a python simple http server for testing and shut it down later
    env.setInput('ssh-tank-base-url', 'http://127.0.0.1:8000')
    env.setInput('pr-sym-link', '666')
    env.setMultilineInput('cache-key-prefixes', [
      'pr/test-commit/test-build-type',
      'Digest/test-hash/test-build-type'
    ])
    env.setInput('entry', 'cu101_xla')
    await ssh.uploadByDigest()
    await ssh.downloadByDigest()
  },
  MINUTES15
)
