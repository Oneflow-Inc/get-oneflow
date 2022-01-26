import * as core from '@actions/core'
import * as exec from './utils/exec'
import * as io from '@actions/io'
import * as tc from '@actions/tool-cache'
import fs from 'fs'
import os from 'os'
import {ExecOptions} from '@actions/exec'
import path from 'path'
import {ensureConda} from './utils/conda'
import {BuildEnv, buildOneFlow} from './utils/docker'
import {getParallel, isSelfHosted} from './utils/util'

const LLVM12DevContainerTag =
  'registry.cn-beijing.aliyuncs.com/oneflow/devcontainer:llvm13'

async function condaRun(
  condaEnvName: string,
  commandLine: string,
  args?: string[],
  options?: ExecOptions
): Promise<number> {
  let condaCmd = 'conda'
  try {
    condaCmd = await io.which(condaCmd, true)
  } catch (error) {
    condaCmd = await ensureConda()
  }
  return await exec.exec(
    condaCmd,
    ['run', '-n', condaEnvName, commandLine].concat(args || []),
    options
  )
}

async function buildWithConda(): Promise<void> {
  let envFile: string = core
    .getInput('conda-env-file', {required: true})
    .replace('~', os.homedir)
  const oneflowSrc: string = core
    .getInput('oneflow-src', {required: true})
    .replace('~', os.homedir)
  const cmakeInitCache: string = core
    .getInput('cmake-init-cache', {
      required: true
    })
    .replace('~', os.homedir)
  const isDryRun: boolean = core.getBooleanInput('dry-run')
  const isEnvFileExist = await fs.promises
    .access(envFile, fs.constants.F_OK)
    // eslint-disable-next-line github/no-then
    .then(() => true)
    // eslint-disable-next-line github/no-then
    .catch(() => false)
  if (isEnvFileExist === false && isDryRun === false) {
    envFile = await tc.downloadTool(envFile)
  }
  if (isDryRun === false) {
    await ensureConda()
  }
  if (isDryRun === false) {
    await exec.exec(await ensureConda(), [
      'env',
      'update',
      '-f',
      envFile,
      '--prune'
    ])
    const buildDir = 'build'
    await io.mkdirP(buildDir)
    const condaEnvName = core.getInput('conda-env-name', {required: true})
    await condaRun(condaEnvName, 'cmake', [
      '-S',
      oneflowSrc,
      '-C',
      cmakeInitCache,
      '-B',
      buildDir
    ])
    await condaRun(condaEnvName, 'cmake', [
      '--build',
      buildDir,
      '--parallel',
      getParallel()
    ])
    await condaRun(condaEnvName, 'python3', ['setup.py', 'bdist_wheel'], {
      cwd: path.join(oneflowSrc, 'python')
    })
  }
}

const ProductionCommit = '2211ee6d62f17120cc0145e60c63fca39e388b68'
const CUDA_114_IMG_TAG = `registry.cn-beijing.aliyuncs.com/oneflow/manylinux2014_x86_64_cuda11.4:617d3245410d4d35d9a0637269d0aab14c996029`
const CUDA_113_IMG_TAG = `registry.cn-beijing.aliyuncs.com/oneflow/manylinux2014_x86_64_cuda11.3:617d3245410d4d35d9a0637269d0aab14c996029`
const CUDA_112_IMG_TAG = `registry.cn-beijing.aliyuncs.com/oneflow/manylinux2014_x86_64_cuda11.2:${ProductionCommit}`
const CUDA_102_IMG_TAG = `registry.cn-beijing.aliyuncs.com/oneflow/manylinux2014_x86_64_cuda10.2:${ProductionCommit}`
const CUDA_CPU_IMG_TAG = `registry.cn-beijing.aliyuncs.com/oneflow/manylinux2014_x86_64_cpu:${ProductionCommit}`

type CudaVersion = '10.2' | '11.2' | '11.3' | '11.4' | 'none' | ''

function getCUDAImageByVersion(cudaVersion: CudaVersion): string {
  switch (cudaVersion) {
    case '':
      return CUDA_CPU_IMG_TAG
    case 'none':
      return CUDA_CPU_IMG_TAG
    case '10.2':
      return CUDA_102_IMG_TAG
    case '11.2':
      return CUDA_112_IMG_TAG
    case '11.3':
      return CUDA_113_IMG_TAG
    case '11.4':
      return CUDA_114_IMG_TAG
    default:
      throw new Error(`cudaVersion not supported: ${cudaVersion}`)
  }
}
type ComputePlatform = 'cpu' | 'cu101' | 'cu102' | 'cu112' | 'cu113' | 'cu114'

function getCUDAVersionByComputePlatform(
  computePlatform: ComputePlatform
): CudaVersion {
  switch (computePlatform) {
    case 'cpu':
      return 'none'
    case 'cu102':
      return '10.2'
    case 'cu112':
      return '11.2'
    case 'cu113':
      return '11.3'
    case 'cu114':
      return '11.4'
    default:
      throw new Error(`computePlatform not supported: ${computePlatform}`)
  }
}

export async function buildWithCondaOrManyLinux(): Promise<void> {
  const buildEnv: BuildEnv = core.getInput('oneflow-build-env') as BuildEnv
  let cudaVersion: CudaVersion = core.getInput('cuda-version', {
    required: false
  }) as CudaVersion
  const computePlatform = core.getInput('compute-platform', {
    required: false
  }) as ComputePlatform
  if (cudaVersion === '' && computePlatform) {
    cudaVersion = getCUDAVersionByComputePlatform(computePlatform)
  }
  if (cudaVersion && computePlatform) {
    throw new Error("computePlatform and cudaVersion can't be both set")
  }
  switch (buildEnv) {
    case 'conda':
      await buildWithConda()
      break
    case 'manylinux':
      if (isSelfHosted()) {
        const tag = getCUDAImageByVersion(cudaVersion)
        await exec.exec('docker', ['pull', tag])
        await buildOneFlow(tag)
      } else {
        throw new Error('must build with manylinux on self-hosted')
      }
      break
    case 'llvm':
      if (isSelfHosted()) {
        const tag = LLVM12DevContainerTag
        await exec.exec('docker', ['pull', tag])
        await buildOneFlow(tag)
      } else {
        throw new Error('must build with llvm on self-hosted')
      }
      break
    default:
      throw new Error(`oneflow-build-env: "${buildEnv}" not supported`)
  }
}
