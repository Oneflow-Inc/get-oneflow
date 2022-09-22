import * as process from 'process'
import {test} from '@jest/globals'
import os from 'os'
import * as env from '../src/utils/env'
import * as ssh from '../src/utils/ssh'
import {isOnPremise} from '../src/utils/util'
import {fstat, mkdir, mkdirSync} from 'fs'
import path from 'path'

process.env['RUNNER_TOOL_CACHE'] = '~/runner_tool_cache'.replace(
  '~',
  os.homedir
)
process.env['RUNNER_TEMP'] = '~/runner_temp'.replace('~', os.homedir)
const MINUTES15 = 1000 * 60 * 15

// to test this script, you need:
//  - run `ssh localhost` successfully
//  - run `python3 -mhttp.server 8000` in ~/tank before test
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
    const tankPath = '~/tank'.replace('~', os.homedir)
    const prNumber = '666'
    const entry = 'cu101_xla'
    const dstDir = 'bin'

    // TODO: generate credential to run the test on gh hosted
    env.setInput('src-dir', 'src')
    env.setInput('digest', 'test-digest')
    env.setInput('entry', 'test-entry')
    env.setInput('dst-dir', dstDir)
    // TODO: create file if test dir is empty
    env.setInput('ssh-tank-host', '127.0.0.1')
    env.setInput('ssh-tank-path', tankPath)
    env.setInput('digest-cache-dir', '~/digest-cache'.replace('~', os.homedir))
    // TODO: start a python simple http server for testing and shut it down later
    env.setInput('ssh-tank-base-url', 'http://127.0.0.1:8000')
    env.setInput('pr-sym-link', prNumber)
    env.setMultilineInput('cache-key-prefixes', [
      'pr/test-commit/test-build-type',
      'Digest/test-hash/test-build-type'
    ])
    env.setInput('entry', entry)

    // test with occupied directory
    const prDir = path.join(tankPath, 'oneflow', 'pr', prNumber, entry, dstDir)
    mkdirSync(prDir, {recursive: true})
    await ssh.uploadByDigest()
    // test with dirty directory
    await ssh.uploadByDigest()
    await ssh.downloadByDigest()
  },
  MINUTES15
)
