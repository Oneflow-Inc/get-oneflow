import {NodeSSH} from 'node-ssh'
import * as util from './util'
import os from 'os'
import path from 'path'
import * as core from '@actions/core'
import * as fs from 'fs'
import Client from 'ssh2-sftp-client'

function getEntryDir(tankDir: string, digest: string, entry: string): string {
  return path.join(tankDir, 'digest', digest, entry)
}
export async function uploadByDigest(): Promise<void> {
  const digest = core.getInput('digest', {required: true})
  const entry = core.getInput('entry', {required: true})
  const srcDir = util.getPathInput('src-dir')
  const dstDir = core.getInput('dst-dir', {required: true})
  const sshTankHost = core.getInput('ssh-tank-host', {required: true})
  const sshTankPath = core.getInput('ssh-tank-path', {required: true})
  const ssh = new NodeSSH()
  try {
    await ssh.connect({
      host: sshTankHost,
      username: os.userInfo().username,
      privateKey: path.join(os.userInfo().homedir, '.ssh/id_rsa')
    })
    // TODO: check the directory doesn't exist
    const failed: string[] = []
    const successful: string[] = []
    const isSuccessful = await ssh.putDirectory(
      srcDir,
      path.join(getEntryDir(sshTankPath, digest, entry), dstDir),
      {
        recursive: true,
        concurrency: 10,
        tick(localPath, remotePath, error) {
          if (error) {
            failed.push(localPath)
          } else {
            successful.push(localPath)
          }
        }
      }
    )
    failed.map(core.setFailed)
    successful.map(core.info)
    if (!isSuccessful) {
      throw new Error(`failed to upload to: ${sshTankPath}`)
      // TODO: remove the directory
    }
  } catch (error) {
    ssh.dispose()
  }
}

export async function downloadByDigest(): Promise<void> {
  const digest = core.getInput('digest', {required: true})
  const entry = core.getInput('entry', {required: true})
  const cacheDir = util.getPathInput('digest-cache-dir', {required: true})
  const digestDir = path.join(cacheDir, digest)
  const entryDir = path.join(digestDir, entry)
  const sshTankHost = core.getInput('ssh-tank-host', {required: true})
  const sshTankPath = core.getInput('ssh-tank-path', {required: true})
  if (!fs.existsSync(digestDir)) {
    // remove all if it is a different digestDir
    if (fs.existsSync(cacheDir)) {
      fs.rmSync(cacheDir, {recursive: true, force: true})
    }
    fs.mkdirSync(digestDir, {recursive: true})
  }
  if (fs.existsSync(entryDir)) {
    core.info(`[exist] ${entryDir}`)
    return
  } else {
    fs.mkdirSync(entryDir, {recursive: true})
  }
  const sftp = new Client()
  try {
    await sftp.connect({
      host: sshTankHost,
      username: os.userInfo().username,
      privateKey: fs.readFileSync(
        path.join(os.userInfo().homedir, '.ssh/id_rsa')
      )
    })
    const remoteDir = getEntryDir(sshTankPath, digest, entry)
    await sftp.downloadDir(remoteDir, entryDir)
  } catch (error) {
    await sftp.end()
    throw error
  }
  core.setOutput('entry-dir', entryDir)
}
