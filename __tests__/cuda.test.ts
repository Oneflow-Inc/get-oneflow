import * as process from 'process'
import * as cp from 'child_process'
import * as path from 'path'
import {test} from '@jest/globals'
import os from 'os'
import {
  buildManylinuxAndTag,
  ensureDocker,
  buildOneFlow
} from '../src/utils/docker'
import {TOOLS, mirrorToDownloads, ensureCUDA102} from '../src/utils/ensure'
import * as env from '../src/utils/env'
import {ok} from 'assert'
import {isOnPremise} from '../src/utils/util'

process.env['RUNNER_TOOL_CACHE'] = '~/runner_tool_cache'.replace(
  '~',
  os.homedir
)
process.env['RUNNER_TEMP'] = '~/runner_temp'.replace('~', os.homedir)
const MINUTES15 = 1000 * 60 * 15

async function testOneCUDA(cudaVersion: string): Promise<void> {
  env.setBooleanInput('docker-run-use-system-http-proxy', true) // xla needs it to download nested pkgs
  process.env['INPUT_CMAKE-INIT-CACHE'] = '~/oneflow/cmake/caches/ci/cuda.cmake'
  const sourceDir = '~/oneflow'
  process.env['INPUT_ONEFLOW-SRC'] = sourceDir
  process.env[
    'INPUT_MANYLINUX-CACHE-DIR'
  ] = '~/manylinux-cache-dirs/unittest-'.concat(cudaVersion)
  process.env['INPUT_WHEELHOUSE-DIR'] = '~/manylinux-wheelhouse'
  process.env['INPUT_PYTHON-VERSIONS'] = '3.6\n3.7'
  env.setInput('self-hosted', 'true')
  env.setInput('cuda-version', cudaVersion)
  env.setBooleanInput('docker-run-use-lld', true)
  env.setBooleanInput('clear-wheelhouse-dir', true)
  env.setInput(
    'build-script',
    path.join(sourceDir, 'ci/manylinux/build-gcc7.sh')
  )
  env.setBooleanInput('retry-failed-build', true)
  if (cudaVersion === '11.4') {
    env.setBooleanInput('docker-run-use-system-http-proxy', false)
    env.setInput('build-script', path.join(sourceDir, 'ci/manylinux/build.sh'))
    env.setInput('cmake-init-cache', '~/oneflow/cmake/caches/ci/cuda.cmake')
  }
  const manylinuxVersion = '2014'
  let tag = ''
  const TEST_MANYLINUX = process.env['TEST_MANYLINUX'] || ''
  if (TEST_MANYLINUX.includes('img')) {
    tag = await buildManylinuxAndTag(manylinuxVersion)
  }
  if (TEST_MANYLINUX.includes('build')) {
    ok(tag)
    await buildOneFlow(tag)
  }
}
test(
  'build manylinux pip',
  async () => {
    await testOneCUDA('10.2')
  },
  MINUTES15
)
