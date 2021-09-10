import {NodeSSH} from 'node-ssh'
import * as util from './util'
import os from 'os'
import path from 'path'
import * as core from '@actions/core'
import OSS from 'ali-oss'

function ciCacheBucketStore(): OSS {
  const store = new OSS({
    region: 'oss-cn-beijing',
    accessKeyId: process.env['OSS_ACCESS_KEY_ID'] as string,
    accessKeySecret: process.env['OSS_ACCESS_KEY_SECRET'] as string,
    bucket: 'oneflow-ci-cache',
    endpoint: 'https://oss-cn-beijing.aliyuncs.com'
  })
  return store
}

async function saveKey(key: string, obj: unknown): Promise<void> {
  const store = ciCacheBucketStore()
  const buf = Buffer.from(JSON.stringify(obj, null, 2), 'utf8')
  const res = await store.put(key, buf, {timeout: 60 * 1000 * 60})
  core.info(JSON.stringify(res, null, 2))
}

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
  // const isSuccessful = await ssh.putDirectory(wheelhouseDir, tankDir, {
  //   recursive: true,
  //   concurrency: 10,
  //   tick(localPath, remotePath, error) {
  //     if (error) {
  //       failed.push(localPath)
  //     } else {
  //       successful.push(localPath)
  //     }
  //   }
  // })
  const isSuccessful = true
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
