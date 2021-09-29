import {NodeSSH} from 'node-ssh'
import * as util from './util'
import os from 'os'
import path from 'path'
import * as core from '@actions/core'
import * as fs from 'fs'
import Client from 'ssh2-sftp-client'
import * as exec from './exec'

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
    const tankDst = path.join(getEntryDir(sshTankPath, digest, entry), dstDir)
    const rmCommand = `rm -rf ${tankDst}`
    core.info(`[cmd] ${rmCommand}`)
    await ssh.execCommand(rmCommand)
    const isSuccessful = await ssh.putDirectory(srcDir, tankDst, {
      recursive: true,
      concurrency: 10,
      tick(localPath, remotePath, error) {
        if (error) {
          core.setFailed(error)
          failed.push(localPath)
        } else {
          successful.push(localPath)
        }
      }
    })
    failed.map(core.setFailed)
    core.info(`[to] ${tankDst}`)
    successful.map(core.info)
    if (!isSuccessful) {
      throw new Error(`failed to upload to: ${tankDst}`)
      // TODO: remove the directory
    }
  } finally {
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
  fs.mkdirSync(digestDir, {recursive: true})
  core.setOutput('entry-dir', entryDir) // setOutput before return
  if (fs.existsSync(entryDir)) {
    core.info(`[exist] ${entryDir}`)
    return
  }
  const remoteDir = getEntryDir(sshTankPath, digest, entry)
  if (os.hostname() === 'oneflow-13' && sshTankHost === '192.168.1.13') {
    core.info(`[symlink] ${os.hostname()}`)
    await exec.exec('mkdir', ['-p', entryDir])
    await exec.exec('rm', ['-rf', entryDir])
    await exec.exec('ln', ['-sf', remoteDir, entryDir])
    return
  }
  const sftp = new Client()
  try {
    core.info(`[connect] ${sshTankHost}`)
    await sftp.connect({
      host: sshTankHost,
      username: os.userInfo().username,
      privateKey: fs.readFileSync(
        path.join(os.userInfo().homedir, '.ssh/id_rsa')
      )
    })
    core.info(`[from] ${remoteDir}`)
    core.info(`[to] ${entryDir}`)
    await sftp.downloadDir(remoteDir, entryDir)
  } finally {
    await sftp.end()
  }
}
