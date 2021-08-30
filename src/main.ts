import * as core from '@actions/core'
import * as github from '@actions/github'
import * as exec from '@actions/exec'
import * as io from '@actions/io'
import * as tc from '@actions/tool-cache'
import fs from 'fs'

async function installConda(): Promise<number> {
  try {
    const condaPath = await io.which('conda', true)
    core.info(`condaPath: ${condaPath}`)
  } catch (error) {
    core.setFailed('conda not found')
  }
  return exec.exec('conda', ['--version'], {ignoreReturnCode: true})
}

async function buildWithConda(): Promise<void> {
  let envFile: string = core.getInput('conda-env-file', {required: true})
  const oneflowSrc: string = core.getInput('oneflow-src', {required: true})
  const cmakeInitCache: string = core.getInput('cmake-init-cache', {
    required: true
  })
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
    await exec.exec('conda', ['env', 'update', '-f', envFile, '--prune'])
    const buildDir = 'build'
    await io.mkdirP(buildDir)
    await exec.exec('conda', ['init'])
    await exec.exec('source', ['~/.bashrc'])
    await exec.exec('conda', ['activate', 'oneflow-dev-clang10-v2'])
    await exec.exec('cmake', [
      '-S',
      oneflowSrc,
      '-C',
      cmakeInitCache,
      '-B',
      buildDir
    ])
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
    } else {
      await installConda()
    }
    if (buildEnv === 'conda') {
      await buildWithConda()
    }
  } catch (error) {
    core.setFailed(error.message)
  }
}

run()
