import {NodeSSH} from 'node-ssh'
import * as util from './util'
import os from 'os'
import path from 'path'
import * as core from '@actions/core'
import {saveKey} from './cache'

export async function uploadWheelhouse(): Promise<void> {
  const wheelhouseDir = util.getPathInput('wheelhouse-dir')
  const tankDir = path.join(
    os.userInfo().homedir,
    'tank',
    'pr',
    'test-pr-no',
    'test-pr-commit'
  )
  const ssh = new NodeSSH()
  const host = '192.168.1.23'
  await ssh.connect({
    host,
    username: os.userInfo().username,
    privateKey: path.join(os.userInfo().homedir, '.ssh/id_rsa')
  })
  // TODO: check the directory doesn't exist
  const failed: string[] = []
  const successful: string[] = []
  const isSuccessful = await ssh.putDirectory(wheelhouseDir, tankDir, {
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
    throw Error(`failed to upload to: ${tankDir}`)
    // TODO: remove the directory
  }
  ssh.dispose()
  await saveKey(
    path.join('pr', 'test-pr-no', 'test-pr-commit', 'wheelhouse.json'),
    {
      python36WheelURL: tankDir
    }
  )
}
