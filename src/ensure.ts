import {isSelfHosted, extractTarX} from './util'
import OSS from 'ali-oss'
import path from 'path'
import * as tc from '@actions/tool-cache'
import os from 'os'
import * as core from '@actions/core'

type Tool = {
  name: string
  url: string
  version: string
  dirName: string | null | undefined
}

export const LLVM12 = {
  name: 'llvm',
  url:
    'https://github.com/llvm/llvm-project/releases/download/llvmorg-12.0.1/clang+llvm-12.0.1-x86_64-linux-gnu-ubuntu-16.04.tar.xz',
  version: '12.0.1',
  dirName: null
}

export const TOOLS: Tool[] = [
  LLVM12,
  {
    name: 'llvm',
    url:
      'https://github.com/llvm/llvm-project/releases/download/llvmorg-10.0.1/clang+llvm-10.0.1-x86_64-linux-sles12.4.tar.xz',
    version: '10.0.1',
    dirName: null
  },
  {
    name: 'llvm',
    url:
      'https://github.com/llvm/llvm-project/releases/download/llvmorg-9.0.1/clang+llvm-9.0.1-x86_64-linux-gnu-ubuntu-16.04.tar.xz',
    version: '9.0.1',
    dirName: null
  }
]

function ossClient(): OSS {
  const client = new OSS({
    region: 'oss-cn-beijing',
    accessKeyId: process.env['OSS_ACCESS_KEY_ID'] as string,
    accessKeySecret: process.env['OSS_ACCESS_KEY_SECRET'] as string
  })
  return client
}

function staticBucketClient(): OSS {
  const client = ossClient()
  client.useBucket('oneflow-static')
  return client
}

async function downloadAndExtract(
  url: string,
  tool: string,
  version: string
): Promise<string> {
  const downloaded = await tc.downloadTool(url)
  const dest = path.join(os.homedir(), 'ci-tools', tool, version)
  if (url.endsWith('tar.gz')) {
    return await tc.extractTar(downloaded, dest)
  } else if (url.endsWith('tar.xz')) {
    return await extractTarX(downloaded, dest, ['xf'])
  } else {
    throw new Error(`don't know how to handle ${url}`)
  }
}

function GetDownloadsKey(fileName: string): string {
  return path.join('downloads', fileName)
}

export async function mirrorToDownloads(url: string): Promise<void> {
  const parsedURL = new URL(url)
  const fileName = path.basename(parsedURL.pathname)
  const client = staticBucketClient()
  const objectKey = GetDownloadsKey(fileName)
  try {
    await client.head(objectKey)
    core.info(`[found]: ${url}`)
  } catch (error) {
    core.info(`[absent-url]: ${url}`)
    core.info(`[absent-key]: ${objectKey}`)
    const downloaded = await tc.downloadTool(url)
    await client.put(objectKey, downloaded)
    core.info(`[mirrored]: ${url}`)
  }
}

export function GetOSSDownloadURL(url: string): string {
  const parsedURL = new URL(url)
  const client = staticBucketClient()
  const fileName = path.basename(parsedURL.pathname)
  const objectKey = GetDownloadsKey(fileName)
  return client.getObjectUrl(objectKey)
}

export async function ensureTool(
  tool: Tool,
  setup?: Function | null
): Promise<string> {
  const cachedPath = tc.find(tool.name, tool.version)
  const parsedURL = new URL(tool.url)
  const fileName = path.basename(parsedURL.pathname)
  const client = staticBucketClient()
  if (!cachedPath) {
    let downloadURL = tool.url
    if (isSelfHosted()) {
      const objectKey = GetDownloadsKey(fileName)
      downloadURL = client.getObjectUrl(objectKey)
    }
    downloadAndExtract(downloadURL, tool.name, tool.version)
    await downloadAndExtract(downloadURL, tool.name, tool.version)
    if (setup) {
      setup()
    }
  }
  if (tool.dirName) {
    return path.join(cachedPath, tool.dirName)
  } else {
    return path.join(cachedPath, fileName)
  }
}
