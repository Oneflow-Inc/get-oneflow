import * as core from '@actions/core'
import * as exec from './exec'
import * as io from '@actions/io'
import * as tc from '@actions/tool-cache'
import fs from 'fs'
import os from 'os'
import {ExecOptions} from '@actions/exec'
import path from 'path'
import {ensureConda} from './conda'
import {buildManylinuxAndTag, buildOneFlow, DOCKER_TOOL_URLS} from './docker'
import {isSelfHosted} from './util'
import {TOOLS, mirrorToDownloads} from './ensure'

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
    const condaEnvName = 'oneflow-dev-clang10-v2'
    await condaRun(condaEnvName, 'cmake', [
      '-S',
      oneflowSrc,
      '-C',
      cmakeInitCache,
      '-B',
      buildDir
    ])
    if (isSelfHosted()) {
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
    const buildEnv: string = core.getInput('oneflow-build-env')
    const action: string = core.getInput('action')
    switch (action) {
      case 'mirror-tools':
        for (const t of TOOLS) {
          await mirrorToDownloads(t.url)
        }
        for (const e of Object.entries(DOCKER_TOOL_URLS)) {
          await mirrorToDownloads(e[1])
        }

        break

      case 'build-img':
        {
          const manylinuxVersion: string = core.getInput('manylinux-version', {
            required: true
          })
          if (manylinuxVersion === '2014') {
            const tag = await buildManylinuxAndTag(manylinuxVersion)
            core.setOutput('tag', tag)
          } else {
            core.setFailed(`unsupported manylinuxVersion: ${manylinuxVersion}`)
          }
        }
        break
      case 'build-oneflow':
        if (['conda', 'manylinux'].includes(buildEnv) === false) {
          core.setFailed('oneflow-build-env must be conda or manylinux')
        }
        if (buildEnv === 'conda') {
          await buildWithConda()
        }
        if (buildEnv === 'manylinux') {
          const manylinuxVersion = '2014'
          // TODO: remove this
          const tag = await buildManylinuxAndTag(manylinuxVersion)
          if (isSelfHosted()) {
            await buildOneFlow(tag)
          }
        }
        break
      case 'do-nothing':
        core.warning(`unsupported action: ${action}`)
        break
      default:
        core.setFailed(`unsupported action: ${action}`)
        break
    }
  } catch (error) {
    core.setFailed(error.message)
  }
}

run()
