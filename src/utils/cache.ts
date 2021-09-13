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

export async function saveKey(key: string, obj: unknown): Promise<void> {
  const store = ciCacheBucketStore()
  const buf = Buffer.from(JSON.stringify(obj, null, 2), 'utf8')
  await store.put(key, buf, {timeout: 60 * 1000 * 60})
}
