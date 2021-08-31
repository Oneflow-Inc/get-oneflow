import * as core from '@actions/core'
import * as github from '@actions/github'
import * as exec from '@actions/exec'
import * as io from '@actions/io'
import * as tc from '@actions/tool-cache'
import fs from 'fs'
import os from 'os'
import {ExecOptions} from '@actions/exec'
import path from 'path'

async function load_img(tag: string, url: string): Promise<void> {
  await exec.exec('docker', ['ps'])
  const inspect = await exec.exec('docker', ['inspect', tag], {
    ignoreReturnCode: true
  })
  if (inspect !== 0) {
    const imgPath = await tc.downloadTool(url)
    await exec.exec('docker', ['load', '-i', imgPath])
  }
}

async function ensureDocker(): Promise<void> {
  try {
    await exec.exec('docker', ['ps'])
    await load_img(
      'quay.io/pypa/manylinux1_x86_64',
      'https://oneflow-static.oss-cn-beijing.aliyuncs.com/img/quay.iopypamanylinux1_x86_64.tar.gz'
    )
    await load_img(
      'quay.io/pypa/manylinux2010_x86_64',
      'https://oneflow-static.oss-cn-beijing.aliyuncs.com/img/quay.iopypamanylinux2010_x86_64.tar.gz'
    )
    await load_img(
      'quay.io/pypa/manylinux2014_x86_64:latest',
      'https://oneflow-static.oss-cn-beijing.aliyuncs.com/img/quay.iopypamanylinux2014_x86_64.tar.gz'
    )
    await load_img(
      'quay.io/pypa/manylinux_2_24_x86_64',
      'https://oneflow-static.oss-cn-beijing.aliyuncs.com/img/quay.iopypamanylinux_2_24_x86_64.tar.gz'
    )
  } catch (error) {
    core.warning(error.message)
  }
}

async function ensureConda(): Promise<string> {
  let condaPrefix: string = core.getInput('conda-prefix', {required: false})
  if (condaPrefix) {
    condaPrefix = condaPrefix.replace('~', os.homedir)
    const condaInstallerUrl: string = core.getInput('conda-installer-url')
    const cmdFromPrefix: string = path.join(condaPrefix, 'condabin', 'conda')
    try {
      await io.which('conda', true)
      return 'conda'
    } catch (error) {
      core.warning(`conda not found, start looking for: ${cmdFromPrefix}`)
    }
    try {
      await exec.exec(cmdFromPrefix, ['--version'])
    } catch (error) {
      core.warning(`start installing with installer: ${condaInstallerUrl}`)
      const installerPath = await tc.downloadTool(condaInstallerUrl)
      await exec.exec('bash', [
        installerPath,
        '-b',
        '-u',
        '-s',
        '-p',
        condaPrefix
      ])
    }
    await exec.exec(cmdFromPrefix, ['--version'])
    return cmdFromPrefix
  } else {
    return 'conda'
  }
}

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
  const isSelfHosted: boolean = core.getBooleanInput('self-hosted')
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
    const condaEnvName = 'oneflow-dev-clang10-v2'
    await condaRun(condaEnvName, 'cmake', [
      '-S',
      oneflowSrc,
      '-C',
      cmakeInitCache,
      '-B',
      buildDir
    ])
    if (isSelfHosted) {
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
}

async function run(): Promise<void> {
  try {
    core.debug(`github.context: ${JSON.stringify(github.context, null, 2)}`)
    const buildEnv: string = core.getInput('oneflow-build-env')
    const isDryRun: boolean = core.getBooleanInput('dry-run')
    const isSelfHosted: boolean = core.getBooleanInput('self-hosted')

    if (['conda', 'manylinux'].includes(buildEnv) === false) {
      core.setFailed('oneflow-build-env must be conda or manylinux')
    }
    if (isDryRun) {
      core.debug(`isDryRun: ${isDryRun}`)
      core.debug(await io.which('python3', true))
    } else {
      if (isSelfHosted) {
        await ensureDocker()
      }
    }
    if (buildEnv === 'conda') {
      await buildWithConda()
    }
  } catch (error) {
    core.setFailed(error.message)
  }
}

run()
