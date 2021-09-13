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

const OBJECT_KEY = 'object.json'
export async function saveKey(key: string, obj: unknown): Promise<void> {
  const store = ciCacheBucketStore()
  const buf = Buffer.from(JSON.stringify(obj, null, 2), 'utf8')
  await store.put(key.concat(OBJECT_KEY), buf, {timeout: 60 * 1000 * 60})
}

export async function lookupInKeys(keys: string[]): Promise<unknown> {
  const store = ciCacheBucketStore()
  // TODO: support check keys have same values
  for await (const key of keys) {
    const res = await store.get(key.concat(OBJECT_KEY))
    return JSON.parse(res.content)
  }
  return null
}
