import * as core from '@actions/core'
import * as exec from './utils/exec'
import * as io from '@actions/io'
import * as tc from '@actions/tool-cache'
import fs from 'fs'
import os from 'os'
import {ExecOptions} from '@actions/exec'
import path from 'path'
import {ensureConda} from './utils/conda'
import {buildOneFlow} from './utils/docker'
import {isSelfHosted} from './utils/util'

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
      (await exec.getExecOutput('nproc')).stdout.trim()
    ])
    await condaRun(condaEnvName, 'python3', ['setup.py', 'bdist_wheel'], {
      cwd: path.join(oneflowSrc, 'python')
    })
  }
}

export async function buildWithCondaOrManyLinux(): Promise<void> {
  try {
    const buildEnv: string = core.getInput('oneflow-build-env')
    if (['conda', 'manylinux'].includes(buildEnv) === false) {
      core.setFailed('oneflow-build-env must be conda or manylinux')
    }
    if (buildEnv === 'conda') {
      await buildWithConda()
    }
    if (buildEnv === 'manylinux') {
      if (isSelfHosted()) {
        const tag =
          'registry.cn-beijing.aliyuncs.com/oneflow/manylinux2014_x86_64:0.1'
        await exec.exec('docker', ['pull', tag])
        await buildOneFlow(tag)
      }
    }
  } catch (error) {
    core.setFailed(error as Error)
  }
}
