import OSS from 'ali-oss'
import * as core from '@actions/core'
import path from 'path'
import * as github from '@actions/github'
import {getPathInput} from './util'
import * as glob from '@actions/glob'
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

export async function getOneFlowBuildCacheKeys(
  entry: string
): Promise<string[]> {
  const oneflowSrc: string = getPathInput('oneflow-src', {required: true})
  const patterns = [
    'oneflow/core/**/*.h',
    'oneflow/core/**/*.cpp',
    'oneflow/core/**/*.cuh',
    'oneflow/core/**/*.cu',
    'oneflow/core/**/*.proto',
    'oneflow/core/**/*.yaml',
    'tools/cfg/**/*',
    'tools/functional**/*',
    'cmake/**/*',
    'python/oneflow/**/*.py'
  ].map(x => path.join(oneflowSrc, x))
  // add proto files
  // exclude python test dir or move it from oneflow dir
  // exclude core and include dir
  const ghWorkspace = process.env.GITHUB_WORKSPACE
  process.env.GITHUB_WORKSPACE = oneflowSrc
  for (const pattern of patterns) {
    const globber = await glob.create(pattern)
    const files = await globber.glob()
    ok(files.length > 0, pattern)
  }
  const srcHash = await glob.hashFiles(patterns.join('\n'))
  process.env.GITHUB_WORKSPACE = ghWorkspace
  return [`digest/${srcHash}`]
    .concat(
      process.env.GITHUB_REPOSITORY
        ? [
            `${github.context.repo.owner}/${github.context.repo.repo}/${github.context.eventName}/${github.context.issue.number}/${github.context.sha}`
          ]
        : []
    )
    .map(x => (entry ? path.join(x, entry) : x))
}
