import OSS from 'ali-oss'
import * as core from '@actions/core'
import path from 'path'
import {getPathInput} from './util'
import * as glob from '@actions/glob'
import * as gh from '@actions/github'
import {ok} from 'assert'

function ciCacheBucketStore(): OSS {
  const store = new OSS({
    region: 'oss-cn-beijing',
    accessKeyId: process.env['OSS_ACCESS_KEY_ID'] as string,
    accessKeySecret: process.env['OSS_ACCESS_KEY_SECRET'] as string,
    bucket: 'oneflow-ci-cache',
    endpoint: 'https://oss-cn-beijing.aliyuncs.com',
    timeout: 60 * 1000 * 60
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

export async function checkComplete(keys: string[]): Promise<string | null> {
  const store = ciCacheBucketStore()
  for await (const key of keys) {
    const objectKey = getCompleteKey(key)
    try {
      await store.head(objectKey, {timeout: 60 * 1000 * 60})
      core.info(`[found] ${objectKey}`)
      return objectKey
    } catch (error) {
      core.info(`[absent] ${objectKey}`)
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
      await store.delete(objectKey, {timeout: 60 * 1000 * 60})
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
  // TODO: alternative function for test jobs
  const patterns = [
    'oneflow/core/**/*.h',
    'oneflow/core/**/*.hpp',
    'oneflow/core/**/*.cpp',
    'oneflow/core/**/*.cuh',
    'oneflow/core/**/*.cu',
    'oneflow/core/**/*.proto',
    'oneflow/core/**/*.yaml',
    'tools/cfg/**/*.py',
    'tools/cfg/**/*.cpp',
    'tools/cfg/**/*.h',
    'tools/functional/**/*.py',
    'cmake/**/*.cmake',
    'python/oneflow/**/*.py'
  ].map(x => path.join(oneflowSrc, x))
  const ghWorkspace = process.env.GITHUB_WORKSPACE
  process.env.GITHUB_WORKSPACE = oneflowSrc
  for (const pattern of patterns) {
    const globber = await glob.create(pattern)
    const files = await globber.glob()
    ok(files.length > 0, pattern)
  }
  let excludePatterns = [
    'python/oneflow/include/**',
    'python/oneflow/core/**',
    'python/oneflow/version.py'
  ].map(x => '!'.concat(path.join(oneflowSrc, x)))
  if (!opts.includeTests) {
    excludePatterns = excludePatterns.concat(['python/oneflow/test/**'])
  }
  if (!opts.includeSingleClient) {
    excludePatterns = excludePatterns.concat([
      'python/oneflow/compatible/single_client/**'
    ])
  }
  const srcHash = await glob.hashFiles(
    patterns.concat(excludePatterns).join('\n')
  )
  process.env.GITHUB_WORKSPACE = ghWorkspace
  return srcHash
}

const DIGEST_CACHE: {[name: string]: string} = {}

export async function getDigestByType(
  digestType: 'test' | 'build' | 'single-client-test'
): Promise<string> {
  if (DIGEST_CACHE[digestType]) return DIGEST_CACHE[digestType]
  switch (digestType) {
    case 'build':
      DIGEST_CACHE[digestType] = await getOneFlowSrcDigest({
        includeSingleClient: false,
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
  ok(DIGEST_CACHE[digestType])
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

export async function queryCache(opts: QueryOpts): Promise<CacheResult> {
  let keys: string[] = []
  const buildDigest = await getDigestByType('build')
  const testDigest = await getDigestByType('test')
  switch (opts.digestType) {
    case 'build':
      keys = keys.concat([keyFrom({digest: buildDigest, entry: opts.entry})])
      break
    case 'test':
      keys = keys.concat([keyFrom({digest: testDigest, entry: opts.entry})])
      break
    default:
      throw new Error(`digestType: ${opts.digestType} not supported`)
  }
  ok(keys.length > 0)
  const found = await checkComplete(keys)
  return {
    keys,
    cacheHit: !!found,
    buildDigest,
    testDigest
  }
}
