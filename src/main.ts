import * as core from '@actions/core'
import * as github from '@actions/github'
import * as exec from '@actions/exec'
import * as io from '@actions/io'

async function installConda(): Promise<number> {
  try {
    const condaPath = await io.which('conda', true)
    core.info(`condaPath: ${condaPath}`)
  } catch (error) {
    core.setFailed('conda not found')
  }
  return exec.exec('conda', ['--version'], {ignoreReturnCode: true})
}

async function run(): Promise<void> {
  try {
    core.debug(`github.context: ${JSON.stringify(github.context, null, 2)}`)
    const buildEnv: string = core.getInput('oneflow-build-env')
    const isDryRun: boolean = core.getBooleanInput('dry-run')
    if (isDryRun) {
      core.debug(`isDryRun: ${isDryRun}`)
      core.debug(await io.which('python3', true))
    } else {
      await installConda()
    }
    if (['conda', 'manylinux'].includes(buildEnv) === false) {
      core.setFailed('oneflow-build-env must be conda or manylinux')
    }
  } catch (error) {
    core.setFailed(error.message)
  }
}

run()
