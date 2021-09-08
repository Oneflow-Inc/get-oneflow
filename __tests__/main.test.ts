import * as process from 'process'
import * as cp from 'child_process'
import * as path from 'path'
import {test} from '@jest/globals'
import os from 'os'
import {buildManylinuxAndTag, ensureDocker, buildOneFlow} from '../src/docker'
import {TOOLS, mirrorToDownloads, ensureCUDA102} from '../src/ensure'
import * as env from '../src/env'
import {ok} from 'assert'

process.env['RUNNER_TOOL_CACHE'] = '~/runner_tool_cache'.replace(
  '~',
  os.homedir
)
process.env['RUNNER_TEMP'] = '~/runner_temp'.replace('~', os.homedir)
const MINUTES15 = 1000 * 60 * 15
// shows how the runner will run a javascript action with env / stdout protocol
test('test runs', () => {
  process.env['INPUT_ONEFLOW-BUILD-ENV'] = 'conda'
  process.env['INPUT_CONDA-ENV-FILE'] = 'environment.yml'
  process.env['INPUT_ONEFLOW-SRC'] = 'dummy'
  process.env['INPUT_CMAKE-INIT-CACHE'] = 'dummy'
  process.env['INPUT_DRY-RUN'] = 'true'
  process.env['INPUT_SELF-HOSTED'] = 'true'
  env.setInput('action', 'do-nothing')
  const np = process.execPath
  const ip = path.join(__dirname, '..', 'lib', 'main.js')
  const options: cp.ExecFileSyncOptions = {
    env: process.env
  }
  try {
    cp.execFileSync(np, [ip], options).toString()
  } catch (error) {
    console.log(error.output.toString())
    throw error
  }
})

function isOnPremise(): boolean {
  return process.platform === 'linux' && os.hostname().includes('oneflow')
}
test(
  'test real cmake',
  () => {
    if (!process.env['TEST_CONDA']) {
      return
    }
    if (isOnPremise() == false) {
      return
    }
    process.env['INPUT_ONEFLOW-BUILD-ENV'] = 'conda'
    process.env['INPUT_CMAKE-INIT-CACHE'] =
      '~/oneflow/cmake/caches/cn/fast/cpu-clang.cmake'
    process.env['INPUT_ONEFLOW-SRC'] = '~/oneflow-conda'
    process.env['INPUT_ONEFLOW-BUILD-ENV'] = 'conda'
    process.env['INPUT_CONDA-ENV-FILE'] =
      '~/conda-env/dev/clang10/environment-v2.yml'
    process.env['INPUT_CONDA-INSTALLER-URL'] =
      'https://oneflow-static.oss-cn-beijing.aliyuncs.com/downloads/conda-installers/Miniconda3-py39_4.10.3-Linux-x86_64.sh'
    process.env['INPUT_CONDA-PREFIX'] = '~/miniconda3-prefixes/py39_4.10.3'
    process.env['INPUT_SELF-HOSTED'] = 'true'
    process.env['INPUT_DRY-RUN'] = 'true'
    const np = process.execPath
    const ip = path.join(__dirname, '..', 'lib', 'main.js')
    const options: cp.ExecFileSyncOptions = {
      env: process.env
    }
    try {
      cp.execFileSync(np, [ip], options).toString()
    } catch (error) {
      console.log(error.output.toString())
      throw error
    }
  },
  MINUTES15
)

test(
  'test docker',
  async () => {
    if (!process.env['TEST_DOCKER']) {
      return
    }
    process.env['INPUT_DRY-RUN'] = 'true'
    if (isOnPremise() == false) {
      return
    }
    await ensureDocker()
  },
  MINUTES15
)

async function testOneCUDA(cudaVersion: string): Promise<void> {
  env.setBooleanInput('docker-build-use-system-http-proxy', false)
  process.env['INPUT_CMAKE-INIT-CACHE'] =
    '~/oneflow/cmake/caches/ci/cuda-75.cmake'
  const sourceDir = '~/oneflow'
  process.env['INPUT_ONEFLOW-SRC'] = sourceDir
  process.env[
    'INPUT_MANYLINUX-CACHE-DIR'
  ] = '~/manylinux-cache-dirs/unittest-'.concat(cudaVersion)
  process.env['INPUT_WHEELHOUSE-DIR'] = '~/manylinux-wheelhouse'
  process.env['INPUT_PYTHON-VERSIONS'] = '3.6\n3.7'
  env.setInput('self-hosted', 'true')
  env.setInput('cuda-version', cudaVersion)
  env.setInput(
    'build-script',
    path.join(sourceDir, 'ci/manylinux/build-gcc7.sh')
  )
  if (cudaVersion === '11.4') {
    env.setInput('build-script', path.join(sourceDir, 'ci/manylinux/build.sh'))
    env.setInput(
      'cmake-init-cache',
      '~/oneflow/cmake/caches/ci/cuda-75-lld.cmake'
    )
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

test(
  'build mirror',
  async () => {
    await Promise.all(TOOLS.map(t => mirrorToDownloads(t.url)))
  },
  MINUTES15
)

test(
  'ensure cuda',
  async () => {
    if (isOnPremise() == false) {
      return
    }
    await ensureCUDA102()
  },
  MINUTES15
)
