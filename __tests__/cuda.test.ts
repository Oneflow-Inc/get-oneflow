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

export const XLAInitCache = 'cmake/caches/ci/cuda-xla.cmake'
export const CPUInitCache = 'cmake/caches/ci/cpu.cmake'
export const CUDAInitCache = 'cmake/caches/ci/cuda.cmake'
export const openvinoCache = 'cmake/caches/ci/serving/openvino.cmake'
export const LLVMInitCache = 'cmake/caches/ci/llvm/cuda-75-clang.cmake'
export const GCC10BuildSh = 'ci/manylinux/build.sh'
export const GCC7BuildSh = 'ci/manylinux/build-gcc7.sh'
export const LLVMBuildSh = 'ci/clang/build-llvm.sh'
test(
  'build manylinux pip',
  async () => {
    if (!process.env['MANYLINUX']) {
      return
    }
    // await testOneCUDA('none', false)
    // await testOneCUDA('10.2', false)
    env.setBooleanInput('docker-run-use-system-http-proxy', true) // xla needs it to download nested pkgs
    const sourceDir = '/home/caishenghang/oneflow-llvm-in-tree'
    process.env['INPUT_WHEELHOUSE-DIR'] = '~/manylinux-wheelhouse'
    env.setBooleanInput('wheel-audit', true)
    // env.setInput('cmake-init-cache', path.join(sourceDir, XLAInitCache))
    // env.setInput('build-script', path.join(sourceDir, GCC7BuildSh))
    env.setInput('build-script', path.join(sourceDir, GCC7BuildSh))
    env.setBooleanInput('docker-run-use-system-http-proxy', false)
    env.setInput('cmake-init-cache', path.join(sourceDir, openvinoCache))
    env.setInput('oneflow-build-env', 'manylinux')
    env.setInput('oneflow-build-env', 'openvino')
    const cudaVersion = 'none'
    env.setInput(
      'manylinux-cache-dir',
      '~/manylinux-cache-dirs/unittest-'.concat(cudaVersion)
    )

    // CPU
    // env.setInput('cmake-init-cache', path.join(sourceDir, CPUInitCache))
    env.setInput('build-script', path.join(sourceDir, GCC7BuildSh))

    // LLVM
    // env.setInput('cmake-init-cache', path.join(sourceDir, LLVMInitCache))
    // env.setInput('oneflow-build-env', 'llvm')
    // env.setInput('build-script', path.join(sourceDir, LLVMBuildSh))
    // env.setInput('manylinux-cache-dir', '~/manylinux-cache-dirs/llvm')

    env.setInput('oneflow-src', sourceDir)
    env.setInput('cuda-version', cudaVersion)
    env.setMultilineInput('python-versions', ['3.7'])
    env.setBooleanInput('wheel-audit', true)
    env.setInput('self-hosted', 'true')
    env.setBooleanInput('docker-run-use-lld', false)
    env.setBooleanInput('clear-wheelhouse-dir', true)
    env.setBooleanInput('retry-failed-build', false)
    env.setBooleanInput('clean-ccache', true)
    env.setBooleanInput('nightly', false)
    await buildWithCondaOrManyLinux()
    // await testOneCUDA('10.1', true)
    // await testOneCUDA('11.4', false)
  },
  MINUTES30
)
