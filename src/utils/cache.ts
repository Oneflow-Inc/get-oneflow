import OSS from 'ali-oss'
import * as core from '@actions/core'
import path from 'path'
import {getPathInput} from './util'
import * as glob from '@actions/glob'
import * as gh from '@actions/github'
import {ok} from 'assert'
import * as tc from '@actions/tool-cache'

interface AltOSSOptions extends OSS.Options {
  retryMax?: Number | undefined
}
export function addRetryMax(opts: AltOSSOptions): OSS.Options {
  opts['retryMax'] = 20
  ok(opts['retryMax'], `opts['retryMax']: ${opts['retryMax']}`)
  return opts
}

export function getOSSCredentials(): {
  accessKeyId: string
  accessKeySecret: string
} {
  return {
    accessKeyId: process.env['OSS_ACCESS_KEY_ID'] || 'anonymous',
    accessKeySecret: process.env['OSS_ACCESS_KEY_SECRET'] || 'anonymous'
  }
}

function ciCacheBucketStore(): OSS {
  const store = new OSS(
    addRetryMax({
      region: 'oss-cn-beijing',
      accessKeyId: getOSSCredentials().accessKeyId,
      accessKeySecret: getOSSCredentials().accessKeySecret,
      bucket: 'oneflow-ci-cache',
      endpoint: 'https://oss-cn-beijing.aliyuncs.com'
    })
  )
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
    await store.put(objectKey, buf)
  }
}

// NOTE: This is no a typo, exception name in oss lib is UnknowError
interface UnknowError {
  name: 'UnknowError'
  status: Number
}

interface DownloadError {
  httpStatusCode: Number
}

export async function pullWithoutSecret(
  oss: OSS,
  bucket: string,
  src: string,
  dst?: string
): Promise<boolean> {
  try {
    await oss.get(src, dst)
    core.info(`[found] ${src}`)
    return true
  } catch (error) {
    if ((error as Error).name === 'NoSuchKeyError') {
      core.info(`[absent] ${src}`)
    } else if (
      (error as UnknowError).name === 'UnknowError' &&
      (error as UnknowError).status === 403
    ) {
      const url = `https://${bucket}.oss-cn-beijing.aliyuncs.com/${src}`
      try {
        await tc.downloadTool(url, dst)
        core.info(`[download] ${src}`)
        return true
      } catch (downloadError) {
        core.info(JSON.stringify(downloadError, null, 2))
        core.info(
          `${
            (downloadError as DownloadError).httpStatusCode === 404
              ? '[absent]'
              : '[download error]'
          } ${url}`
        )
        return false
      }
    } else {
      core.info(`[unknown error] ${src}`)
      return false
    }
    return false
  }
}

// export async function checkComplete(keys: string[]): Promise<string | null> {
//   const store = ciCacheBucketStore()
//   for await (const key of keys) {
//     const objectKey = getCompleteKey(key)
//     const res = await pullWithoutSecret(store, 'oneflow-ci-cache', objectKey)
//     if (res) return objectKey
//     else throw Error
//   }
//   return null
// }

export async function checkComplete(keys: string[]): Promise<string | null> {
  const store = ciCacheBucketStore()
  for await (const key of keys) {
    const objectKey = getCompleteKey(key)
    try {
      await store.head(objectKey)
      core.info(`[found] ${objectKey}`)
      return objectKey
    } catch (error) {
      if ((error as Error).name === 'NoSuchKeyError') {
        core.info(`[absent] ${objectKey}`)
      } else if (
        (error as UnknowError).name === 'UnknowError' &&
        (error as UnknowError).status === 403
      ) {
        const url = `https://oneflow-ci-cache.oss-cn-beijing.aliyuncs.com/${objectKey}`
        try {
          await tc.downloadTool(url)
          return objectKey
        } catch (downloadError) {
          core.info(JSON.stringify(downloadError, null, 2))
          if ((downloadError as DownloadError).httpStatusCode === 404) {
            core.info(`[absent] ${objectKey}`)
          } else {
            throw downloadError
          }
        }
      } else {
        throw error
      }
    }
  }
  return null
}

export async function isComplete(key: string): Promise<Boolean> {
  return !!(await checkComplete([key]))
}

export async function removeComplete(keys: string[]): Promise<void> {
  const store = ciCacheBucketStore()
  for await (const key of keys) {
    const objectKey = getCompleteKey(key)
    try {
      await store.delete(objectKey)
      core.info(`[delete] ${objectKey}`)
    } catch (error) {
      core.info(`[delete fail] ${objectKey}`)
    }
  }
}

interface OneFlowSrcDigestOpts {
  includeTests: Boolean
  includeSingleClient: Boolean
}
export async function getOneFlowSrcDigest(
  opts: OneFlowSrcDigestOpts
): Promise<string> {
  const oneflowSrc: string = getPathInput('oneflow-src', {required: true})
  const ghWorkspace = process.env.GITHUB_WORKSPACE
  process.env.GITHUB_WORKSPACE = oneflowSrc
  // TODO: alternative function for test jobs
  const {patterns, excludePatterns} = getPatterns(oneflowSrc, opts)
  await Promise.all(
    patterns.map(async (pattern: string) => {
      const globber = await glob.create(pattern)
      const files = await globber.glob()
      ok(files.length > 0, `no files found: ${pattern}`)
    })
  )
  core.info(`[hash] ${JSON.stringify(opts, null, 2)}`)
  const finalPatterns = patterns.concat(excludePatterns).join('\n')
  const srcHash = await glob.hashFiles(finalPatterns)
  process.env.GITHUB_WORKSPACE = ghWorkspace
  core.info(finalPatterns)
  return srcHash
}

const DIGEST_CACHE: {[name: string]: string} = {}

export function getPatterns(
  oneflowSrc: string,
  opts: OneFlowSrcDigestOpts
): {patterns: string[]; excludePatterns: string[]} {
  let patterns = [
    'oneflow/api/**/*.h',
    'oneflow/api/**/*.cpp',
    'oneflow/user/**/*.h',
    'oneflow/user/**/*.cpp',
    'oneflow/user/**/*.cuh',
    'oneflow/user/**/*.cu',
    'oneflow/ir/**/*.h',
    'oneflow/ir/**/*.cpp',
    'oneflow/core/**/*.h',
    'oneflow/core/**/*.hpp',
    'oneflow/core/**/*.cpp',
    'oneflow/core/**/*.cuh',
    'oneflow/core/**/*.cu',
    'oneflow/core/**/*.proto',
    'oneflow/core/**/*.yaml',
    'oneflow/maybe/**/*.h',
    'oneflow/maybe/**/*.cpp',
    'tools/cfg/**/*.py',
    'tools/cfg/**/*.cpp',
    'tools/cfg/**/*.h',
    'tools/functional/**/*.py',
    'cmake/**/*.cmake',
    'python/oneflow/**/*.py',
    'python/setup.py',
    'external/**/*.txt',
    'ci/**/*.sh',
    'ci/**/*.txt',
    'ci/**/*.py',
    'CMakeLists.txt'
  ]

  let excludePatterns = [
    'python/oneflow/include/**',
    'python/oneflow/core/**',
    'python/oneflow/version.py'
  ]
  if (opts.includeTests) {
    patterns = patterns.concat([
      'docs/**/*.rst',
      'docs/**/*.py',
      'docs/**/*.txt',
      'docs/Makefile',
      'ci/test/parallel_run.py',
      'ci/test/distributed_run.py',
      'ci/test/**/*.sh',
      '.github/**/*.yml'
    ])
  } else {
    excludePatterns = excludePatterns.concat([
      'python/oneflow/test/**',
      'python/oneflow/compatible/single_client/test/**',
      'ci/test/**/*.sh',
      'ci/test/**/*.py'
    ])
  }
  if (!opts.includeSingleClient) {
    excludePatterns = excludePatterns.concat([
      'python/oneflow/compatible/single_client/**'
    ])
  }
  excludePatterns = excludePatterns.map(x =>
    '!'.concat(path.join(oneflowSrc, x))
  )
  patterns = patterns.map(x => path.join(oneflowSrc, x))
  return {patterns, excludePatterns}
}

export type DigestType = 'test' | 'build' | 'single-client-test'
export async function getDigestByType(digestType: DigestType): Promise<string> {
  if (DIGEST_CACHE[digestType]) return DIGEST_CACHE[digestType]
  switch (digestType) {
    case 'build':
      DIGEST_CACHE[digestType] = await getOneFlowSrcDigest({
        includeSingleClient: true,
        includeTests: false
      })
      break
    case 'test':
      DIGEST_CACHE[digestType] = await getOneFlowSrcDigest({
        includeSingleClient: false,
        includeTests: true
      })
      break

    case 'single-client-test':
      DIGEST_CACHE[digestType] = await getOneFlowSrcDigest({
        includeSingleClient: true,
        includeTests: true
      })
      break

    default:
      break
  }
  ok(DIGEST_CACHE[digestType], `digestType: ${digestType} not found`)
  return DIGEST_CACHE[digestType]
}

export async function getOneFlowBuildCacheKeys(
  entry: string
): Promise<string[]> {
  return [keyFrom({digest: await getDigestByType('build'), entry})]
}

interface KeyOpts {
  digest: string
  entry: string
}

export function keyFrom(keyOptions: KeyOpts): string {
  gh.context.repo.repo
  return [
    'digest',
    gh.context.repo.owner,
    gh.context.repo.repo,
    keyOptions.digest,
    keyOptions.entry
  ].join('/')
}

interface CacheResult {
  buildDigest: string
  testDigest: string
  cacheHit: Boolean
  keys: string[]
}

interface QueryOpts {
  entry: string
  digestType: string
}

// TODO: code is ugly
export async function queryCache(opts: QueryOpts): Promise<CacheResult> {
  let keys: string[] = []
  const buildDigest = await getDigestByType('build')
  let testDigest = ''
  switch (opts.digestType) {
    case 'build':
      keys = keys.concat([keyFrom({digest: buildDigest, entry: opts.entry})])
      break
    case 'test':
      testDigest = await getDigestByType('test')
      keys = keys.concat([keyFrom({digest: testDigest, entry: opts.entry})])
      break
    case 'single-client-test':
      testDigest = await getDigestByType('single-client-test')
      keys = keys.concat([keyFrom({digest: testDigest, entry: opts.entry})])
      break
    default:
      throw new Error(`digestType: ${opts.digestType} not supported`)
  }
  ok(keys.length > 0, `keys.length: ${keys.length}`)
  const found = await checkComplete(keys)
  return {
    keys,
    cacheHit: !!found,
    buildDigest,
    testDigest
  }
}

export async function cacheRun(): Promise<void> {
  const entry: string = core.getInput('entry', {required: true})
  const digestType: string = core.getInput('digest-type', {required: true})
  const cacheResult = await queryCache({entry, digestType})
  const buildDigest = cacheResult.buildDigest
  const testDigest = cacheResult.testDigest
  const keys: string[] = cacheResult.keys
  core.saveState('keys', keys)
  let runnerLabels: string[] = core.getMultilineInput('runner-labels', {
    required: false
  })
  if (cacheResult.cacheHit) {
    runnerLabels = ['ubuntu-latest']
  }
  core.setOutput('runs-on', runnerLabels)
  // TODO: only outputs found keys
  core.setOutput('build-digest', buildDigest)
  core.setOutput('test-digest', testDigest)
  core.setOutput('cache-hit', cacheResult.cacheHit)
}

export async function postCacheRun(): Promise<void> {
  const markAsCompleted: Boolean = core.getBooleanInput('mark-as-completed', {
    required: true
  })
  const keys: string[] = JSON.parse(core.getState('keys'))
  // TODO: clear cache if failed
  if (markAsCompleted) {
    ok(keys, 'no key found')
    await cacheComplete(keys)
    for (const key of keys) {
      core.info(`[complete] ${key}`)
    }
  }
}
