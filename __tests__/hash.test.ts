import * as process from 'process'
import {test} from '@jest/globals'
import os from 'os'
import * as env from '../src/utils/env'
import * as cache from '../src/utils/cache'
import * as glob from '@actions/glob'
import {ok} from 'assert'

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
    const oneflowSrc = process.env.ONEFLOW_SRC || '~/oneflow'
    env.setInput('oneflow-src', oneflowSrc)
    const ENTRY = 'jest-test'
    process.env.GITHUB_WORKSPACE = oneflowSrc
    env.setInput('entry', ENTRY)
    // TODO: test multiple types of digest
    env.setInput('digest-type', 'single-client-test')
    env.setBooleanInput('mark-as-completed', true)
    env.setBooleanInput('check-not-completed', true)
    env.setMultilineInput('runner-labels', [
      'self-hosted',
      'linux',
      'provision'
    ])
    const {patterns, excludePatterns} = cache.getPatterns(oneflowSrc, {
      includeTests: false,
      includeSingleClient: false
    })
    const finalPatterns = patterns.concat(excludePatterns).join('\n')
    const globber = await glob.create(finalPatterns)
    const files = await globber.glob()
    for (const f of files) {
      ok(!f.includes('python/oneflow/test/'))
    }
    for (const includeTests of [true, false]) {
      for (const includeSingleClient of [true, false]) {
        await cache.getOneFlowSrcDigest({
          includeTests,
          includeSingleClient
        })
      }
    }
  },
  MINUTES15
)
