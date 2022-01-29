import OSS from 'ali-oss'
import path from 'path'
import * as cache from './cache'

export function ossStore(): OSS {
  const store = new OSS(
    cache.addRetryMax({
      region: 'oss-cn-beijing',
      accessKeyId: cache.getOSSCredentials().accessKeyId,
      accessKeySecret: cache.getOSSCredentials().accessKeySecret
    })
  )
  return store
}

function staticBucketStore(): OSS {
  const store = ossStore()
  store.useBucket('oneflow-static')
  return store
}

function getDownloadsKey(fileName: string): string {
  return path.join('downloads', fileName)
}

export function getOSSDownloadURL(url: string): string {
  const parsedURL = new URL(url)
  const store = staticBucketStore()
  const fileName = path.basename(parsedURL.pathname)
  const objectKey = getDownloadsKey(fileName)
  return store.getObjectUrl(
    objectKey,
    'https://oneflow-static.oss-cn-beijing.aliyuncs.com'
  )
}
