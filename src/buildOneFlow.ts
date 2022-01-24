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
import {isSelfHosted} from './utils/util'

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

type CudaVersion = '10.1' | '10.2' | '11.2' | 'none' | '' | 'none'
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
      (await exec.getExecOutput('nproc')).stdout.trim()
    ])
    await condaRun(condaEnvName, 'python3', ['setup.py', 'bdist_wheel'], {
      cwd: path.join(oneflowSrc, 'python')
    })
  }
}

const CUDA_112_IMG_TAG =
  'registry.cn-beijing.aliyuncs.com/oneflow/manylinux2014_x86_64_cuda11.2:latest'
const CUDA_102_IMG_TAG =
  'registry.cn-beijing.aliyuncs.com/oneflow/manylinux2014_x86_64_cuda10.2:latest'
const CUDA_101_IMG_TAG =
  'registry.cn-beijing.aliyuncs.com/oneflow/manylinux2014_x86_64_cuda10.1:latest'
const CUDA_CPU_IMG_TAG =
  'registry.cn-beijing.aliyuncs.com/oneflow/manylinux2014_x86_64_cpu:latest'

function getCUDAImageByVersion(cudaVersion: CudaVersion): string {
  switch (cudaVersion) {
    case '10.1':
      return CUDA_101_IMG_TAG
    case '10.2':
      return CUDA_102_IMG_TAG
    case '11.2':
      return CUDA_112_IMG_TAG
    case '':
      return CUDA_CPU_IMG_TAG
    case 'none':
      return CUDA_CPU_IMG_TAG
    case '11.2':
      return CUDA_112_IMG_TAG
    default:
      throw new Error(`cudaVersion not supported: ${cudaVersion}`)
  }
}
export async function buildWithCondaOrManyLinux(): Promise<void> {
  const buildEnv: BuildEnv = core.getInput('oneflow-build-env') as BuildEnv
  let cudaVersion: CudaVersion = core.getInput('cuda-version', {
    required: false
  }) as CudaVersion
  switch (buildEnv) {
    case 'conda':
      await buildWithConda()
      break
    case 'manylinux':
      if (isSelfHosted()) {
        switch (cudaVersion) {
          case '10.2':
            break

          default:
            break
        }
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
