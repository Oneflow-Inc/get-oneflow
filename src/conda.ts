import * as core from '@actions/core'
import * as exec from '@actions/exec'
import * as io from '@actions/io'
import * as tc from '@actions/tool-cache'
import os from 'os'
import path from 'path'

export async function ensureConda(): Promise<string> {
  let condaPrefix: string = core.getInput('conda-prefix', {required: false})
  if (condaPrefix) {
    condaPrefix = condaPrefix.replace('~', os.homedir)
    const condaInstallerUrl: string = core.getInput('conda-installer-url')
    let cmdFromPrefix: string = path.join(condaPrefix, 'condabin', 'conda')
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
      exec.exec('bash', [installerPath, '-b', '-u', '-s', '-p', condaPrefix])
    }
    cmdFromPrefix = await io.which(cmdFromPrefix, true)
    return cmdFromPrefix
  } else {
    return 'conda'
  }
}
