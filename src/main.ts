import * as core from '@actions/core'
import * as github from '@actions/github'
import * as exec from '@actions/exec'
import * as io from '@actions/io'
import * as tc from '@actions/tool-cache'
import fs from 'fs'
import {ExecOptions} from '@actions/exec'
import path from 'path'

async function ensureConda(): Promise<string> {
  let condaPrefix: string = core.getInput('conda-prefix', {required: false})
  condaPrefix = (await exec.getExecOutput('realpath', [condaPrefix])).stdout
  const condaInstallerUrl: string = core.getInput('conda-installer-url')
  let cmdFromPrefix: string = path.join(condaPrefix, 'condabin', 'conda')
  core.warning(`conda not found, start looking for: ${cmdFromPrefix}`)
  try {
    cmdFromPrefix = await io.which(cmdFromPrefix, true)
  } catch (error) {
    core.warning(`start installing with installer: ${condaInstallerUrl}`)
    const installerPath = await tc.downloadTool(condaInstallerUrl)
    exec.exec('bash', [installerPath, '-b', '-u', '-s', '-p', condaPrefix])
  }
  cmdFromPrefix = await io.which(cmdFromPrefix, true)
  return cmdFromPrefix
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
  let envFile: string = core.getInput('conda-env-file', {required: true})
  const oneflowSrc: string = core.getInput('oneflow-src', {required: true})
  const cmakeInitCache: string = core.getInput('cmake-init-cache', {
    required: true
  })
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
    await exec.exec('conda', ['env', 'update', '-f', envFile, '--prune'])
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
        (await exec.getExecOutput('nproc')).stdout
      ])
    }
  }
}

async function run(): Promise<void> {
  try {
    core.debug(`github.context: ${JSON.stringify(github.context, null, 2)}`)
    const buildEnv: string = core.getInput('oneflow-build-env')
    const isDryRun: boolean = core.getBooleanInput('dry-run')

    if (['conda', 'manylinux'].includes(buildEnv) === false) {
      core.setFailed('oneflow-build-env must be conda or manylinux')
    }
    if (isDryRun) {
      core.debug(`isDryRun: ${isDryRun}`)
      core.debug(await io.which('python3', true))
    }
    if (buildEnv === 'conda') {
      await buildWithConda()
    }
  } catch (error) {
    core.setFailed(error.message)
  }
}

run()
