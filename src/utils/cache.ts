import OSS from 'ali-oss'
import * as core from '@actions/core'
import path from 'path'
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

function getCompleteKey(key: string): string {
  return path.join(key, 'complete')
}
export async function cacheComplete(keys: string[]): Promise<void> {
  const store = ciCacheBucketStore()
  for await (const key of keys) {
    const objectKey = getCompleteKey(key)
    const buf = Buffer.from('', 'utf8')
    await store.put(objectKey, buf, {timeout: 60 * 1000 * 60})
  }
}

export async function checkComplete(keys: string[]): Promise<Boolean> {
  const store = ciCacheBucketStore()
  for await (const key of keys) {
    const objectKey = getCompleteKey(key)
    try {
      await store.head(objectKey, {timeout: 60 * 1000 * 60})
      core.info(`[found] ${objectKey}`)
      return true
    } catch (error) {
      core.info(`[absent] ${objectKey}`)
    }
  }
  return false
}

export async function removeComplete(keys: string[]): Promise<void> {
  const store = ciCacheBucketStore()
  for await (const key of keys) {
    const objectKey = getCompleteKey(key)
    try {
      await store.delete(objectKey, {timeout: 60 * 1000 * 60})
      core.info(`[delete] ${objectKey}`)
    } catch (error) {
      core.info(`[delete fail] ${objectKey}`)
    }
  }
}
