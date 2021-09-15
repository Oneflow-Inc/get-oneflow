import {NodeSSH} from 'node-ssh'
import * as util from './util'
import os from 'os'
import path from 'path'
import * as core from '@actions/core'

export async function uploadWheelhouse(): Promise<void> {
  const wheelhouseDir = util.getPathInput('wheelhouse-dir')
  const ssh = new NodeSSH()
  const sshTankHost = core.getInput('ssh-tank-host', {required: true})
  const sshTankPath = core.getInput('ssh-tank-path', {required: true})
  await ssh.connect({
    host: sshTankHost,
    username: os.userInfo().username,
    privateKey: path.join(os.userInfo().homedir, '.ssh/id_rsa')
  })
  // TODO: check the directory doesn't exist
  const failed: string[] = []
  const successful: string[] = []
  const isSuccessful = await ssh.putDirectory(wheelhouseDir, sshTankPath, {
    recursive: true,
    concurrency: 10,
    tick(localPath, remotePath, error) {
      if (error) {
        failed.push(localPath)
      } else {
        successful.push(localPath)
      }
    }
  })
  failed.map(core.setFailed)
  successful.map(core.info)
  if (!isSuccessful) {
    throw Error(`failed to upload to: ${sshTankPath}`)
    // TODO: remove the directory
  }
  ssh.dispose()
}
