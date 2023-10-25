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

const LLVM15DevContainerTag =
  'registry.cn-beijing.aliyuncs.com/oneflow/llvm15_cuda11.2:deab2a2cfcad44955e50b1e2ec2d1e3e1b71c4b9'
const openVINOContainerTag =
  'registry.cn-beijing.aliyuncs.com/oneflow/openvino_ubuntu20_dev_no_samples_2021.4.2:9997f67975c7f8780f09ef2222da8f2546c12f46'
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

const ProductionCommit = '60785746d8a0c1c3b16e094ad653d1a18c519c7f'
const CUDA12ProductionCommit = 'bba403da5da597c3f7905dfc52b24989ee21ffb1'

const CUDA_120_IMG_TAG = `registry.cn-beijing.aliyuncs.com/oneflow/manylinux2014_x86_64_cuda12.0:${CUDA12ProductionCommit}`
const CUDA_121_IMG_TAG = `registry.cn-beijing.aliyuncs.com/oneflow/manylinux2014_x86_64_cuda12.1:${CUDA12ProductionCommit}`
const CUDA_122_IMG_TAG = `registry.cn-beijing.aliyuncs.com/oneflow/manylinux2014_x86_64_cuda12.2:${CUDA12ProductionCommit}`

const CUDA_118_IMG_TAG = `registry.cn-beijing.aliyuncs.com/oneflow/manylinux2014_x86_64_cuda11.8:${ProductionCommit}`
const CUDA_116_IMG_TAG = `registry.cn-beijing.aliyuncs.com/oneflow/manylinux2014_x86_64_cuda11.6:${ProductionCommit}`
const CUDA_117_IMG_TAG = `registry.cn-beijing.aliyuncs.com/oneflow/manylinux2014_x86_64_cuda11.7:${ProductionCommit}`
const CUDA_115_IMG_TAG = `registry.cn-beijing.aliyuncs.com/oneflow/manylinux2014_x86_64_cuda11.5:${ProductionCommit}`
const CUDA_114_IMG_TAG = `registry.cn-beijing.aliyuncs.com/oneflow/manylinux2014_x86_64_cuda11.4:${ProductionCommit}`
const CUDA_113_IMG_TAG = `registry.cn-beijing.aliyuncs.com/oneflow/manylinux2014_x86_64_cuda11.3:${ProductionCommit}`
const CUDA_112_IMG_TAG = `registry.cn-beijing.aliyuncs.com/oneflow/manylinux2014_x86_64_cuda11.2:${ProductionCommit}`
const CUDA_110_IMG_TAG = `registry.cn-beijing.aliyuncs.com/oneflow/manylinux2014_x86_64_cuda11.0:${ProductionCommit}`
const CUDA_102_IMG_TAG = `registry.cn-beijing.aliyuncs.com/oneflow/manylinux2014_x86_64_cuda10.2:${ProductionCommit}`

const CUDA_CPU_IMG_TAG = `registry.cn-beijing.aliyuncs.com/oneflow/manylinux2014_x86_64_cpu:${ProductionCommit}`

type CudaVersion =
  | '10.2'
  | '11.0'
  | '11.2'
  | '11.3'
  | '11.4'
  | '11.5'
  | '11.6'
  | '11.7'
  | '11.8'
  | '12.0'
  | '12.1'
  | '12.2'
  | 'none'
  | ''

function getCUDAImageByVersion(cudaVersion: CudaVersion): string {
  switch (cudaVersion) {
    case '':
      return CUDA_CPU_IMG_TAG
    case 'none':
      return CUDA_CPU_IMG_TAG
    case '10.2':
      return CUDA_102_IMG_TAG
    case '11.0':
      return CUDA_110_IMG_TAG
    case '11.2':
      return CUDA_112_IMG_TAG
    case '11.3':
      return CUDA_113_IMG_TAG
    case '11.4':
      return CUDA_114_IMG_TAG
    case '11.5':
      return CUDA_115_IMG_TAG
    case '11.6':
      return CUDA_116_IMG_TAG
    case '11.7':
      return CUDA_117_IMG_TAG
    case '11.8':
      return CUDA_118_IMG_TAG
    case '12.0':
      return CUDA_120_IMG_TAG
    case '12.1':
      return CUDA_121_IMG_TAG
    case '12.2':
      return CUDA_122_IMG_TAG
    default:
      throw new Error(`cudaVersion not supported: ${cudaVersion}`)
  }
}
type ComputePlatform =
  | 'cpu'
  | 'cu101'
  | 'cu102'
  | 'cu110'
  | 'cu112'
  | 'cu113'
  | 'cu114'
  | 'cu115'
  | 'cu116'
  | 'cu117'
  | 'cu118'
  | 'cu120'
  | 'cu121'
  | 'cu122'
  | ''

function getCUDAVersionByComputePlatform(
  computePlatform: ComputePlatform
): CudaVersion {
  switch (computePlatform) {
    case 'cpu':
      return 'none'
    case 'cu102':
      return '10.2'
    case 'cu110':
      return '11.0'
    case 'cu112':
      return '11.2'
    case 'cu113':
      return '11.3'
    case 'cu114':
      return '11.4'
    case 'cu115':
      return '11.5'
    case 'cu116':
      return '11.6'
    case 'cu117':
      return '11.7'
    case 'cu118':
      return '11.8'
    case 'cu120':
      return '12.0'
    case 'cu121':
      return '12.1'
    case 'cu122':
      return '12.2'
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
  if (cudaVersion && computePlatform) {
    throw new Error(
      `computePlatform (${cudaVersion}) and cudaVersion (${computePlatform}) can't be both set`
    )
  }
  if (cudaVersion === '' && computePlatform) {
    cudaVersion = getCUDAVersionByComputePlatform(computePlatform)
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
        const tag = LLVM15DevContainerTag
        await exec.exec('docker', ['pull', tag])
        await buildOneFlow(tag)
      } else {
        throw new Error('must build with llvm on self-hosted')
      }
      break
    case 'openvino':
      if (isSelfHosted()) {
        const tag = openVINOContainerTag
        await exec.exec('docker', ['pull', tag])
        await buildOneFlow(tag)
      } else {
        throw new Error('must build with openvino on self-hosted')
      }
      break
    default:
      throw new Error(`oneflow-build-env: "${buildEnv}" not supported`)
  }
}
