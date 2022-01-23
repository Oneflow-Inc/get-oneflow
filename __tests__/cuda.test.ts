import * as process from 'process'
import * as path from 'path'
import {test} from '@jest/globals'
import os from 'os'
import {buildWithCondaOrManyLinux} from '../src/buildOneFlow'
import * as env from '../src/utils/env'
import {ok} from 'assert'

process.env['RUNNER_TOOL_CACHE'] = '~/runner_tool_cache'.replace(
  '~',
  os.homedir
)
process.env['RUNNER_TEMP'] = '~/runner_temp'.replace('~', os.homedir)
const MINUTES30 = 1000 * 60 * 30
type TestCudaVersion = '11.4' | '11.0' | '10.2' | '10.1' | 'none' | '11.2'
async function testOneCUDA(
  cudaVersion: TestCudaVersion,
  withXLA: Boolean,
  useLLVM: Boolean
): Promise<void> {
  env.setBooleanInput('docker-run-use-system-http-proxy', true) // xla needs it to download nested pkgs
  process.env['INPUT_CMAKE-INIT-CACHE'] = '~/oneflow/cmake/caches/ci/cuda.cmake'
  const sourceDir = '~/oneflow'
  process.env['INPUT_WHEELHOUSE-DIR'] = '~/manylinux-wheelhouse'
  env.setBooleanInput('wheel-audit', true)
  if (withXLA) {
    ok(cudaVersion !== 'none')
    env.setInput(
      'cmake-init-cache',
      path.join(sourceDir, 'cmake/caches/ci/cuda-xla.cmake')
    )
  }
  env.setInput(
    'build-script',
    path.join(sourceDir, 'ci/manylinux/build-gcc7.sh')
  )
  if (cudaVersion === '11.4') {
    env.setBooleanInput('docker-run-use-system-http-proxy', false)
    env.setInput('build-script', path.join(sourceDir, 'ci/manylinux/build.sh'))
    env.setInput('cmake-init-cache', '~/oneflow/cmake/caches/cn/cuda.cmake')
  } else if (cudaVersion === 'none') {
    env.setBooleanInput('docker-run-use-system-http-proxy', false)
    env.setInput('build-script', path.join(sourceDir, 'ci/manylinux/build.sh'))
    env.setInput('cmake-init-cache', '~/oneflow/cmake/caches/ci/cpu.cmake')
    env.setBooleanInput('docker-run-use-lld', true)
    env.setInput('build-script', path.join(sourceDir, 'ci/manylinux/build.sh'))
  }
  env.setInput('oneflow-build-env', 'manylinux')
  if (useLLVM) {
    env.setBooleanInput('docker-run-use-system-http-proxy', false)
    env.setInput(
      'cmake-init-cache',
      path.join(sourceDir, 'cmake/caches/ci/llvm/cuda-75-clang.cmake')
    )
    env.setBooleanInput('docker-run-use-lld', true)
    env.setInput('oneflow-build-env', 'llvm')
    env.setInput('build-script', path.join(sourceDir, 'ci/clang/build-llvm.sh'))
    env.setBooleanInput('wheel-audit', false)
  }
  env.setInput('oneflow-src', sourceDir)
  process.env[
    'INPUT_MANYLINUX-CACHE-DIR'
  ] = '~/manylinux-cache-dirs/unittest-'.concat(cudaVersion)
  env.setMultilineInput('python-versions', ['3.7'])
  env.setInput('self-hosted', 'true')
  env.setInput('cuda-version', cudaVersion)
  env.setBooleanInput('docker-run-use-lld', false)
  env.setBooleanInput('clear-wheelhouse-dir', true)
  env.setBooleanInput('retry-failed-build', false)
  env.setBooleanInput('clean-ccache', true)
  await buildWithCondaOrManyLinux()
}

test(
  'build manylinux pip',
  async () => {
    // await testOneCUDA('none', false)
    // await testOneCUDA('10.2', false)
    await testOneCUDA('10.1', false, false)
    // await testOneCUDA('10.1', true)
    // await testOneCUDA('11.4', false)
  },
  MINUTES30
)
