import {isSelfHosted, extractTarX, getTempDirectory} from './util'
import OSS from 'ali-oss'
import path from 'path'
import * as tc from '@actions/tool-cache'
import * as core from '@actions/core'
import * as io from '@actions/io'

type Tool = {
  name: string
  url: string
  version: string
  dirName: string
}

export const LLVM12 = {
  name: 'llvm',
  url:
    'https://github.com/llvm/llvm-project/releases/download/llvmorg-12.0.1/clang+llvm-12.0.1-x86_64-linux-gnu-ubuntu-16.04.tar.xz',
  version: '12.0.1',
  dirName: 'clang+llvm-12.0.1-x86_64-linux-gnu-ubuntu-16.04'
}

export const CUDA102 = {
  name: 'cuda',
  url:
    'https://developer.download.nvidia.com/compute/cuda/10.2/Prod/local_installers/cuda_10.2.89_440.33.01_linux.run',
  version: '10.2',
  dirName: 'cuda_10.2.89_440.33.01_linux'
}

export const CUDNN102 = {
  name: 'cudnn',
  url:
    'https://oneflow-static.oss-cn-beijing.aliyuncs.com/downloads/cudnn-10.2-linux-x64-v8.2.4.15.tgz',
  version: 'cudnn-10.2-v8.2.4.15',
  dirName: 'cudnn-10.2-linux-x64-v8.2.4.15'
}

export const TOOLS: Tool[] = [
  LLVM12,
  {
    name: 'llvm',
    url:
      'https://github.com/llvm/llvm-project/releases/download/llvmorg-10.0.1/clang+llvm-10.0.1-x86_64-linux-sles12.4.tar.xz',
    version: '10.0.1',
    dirName: 'clang+llvm-10.0.1-x86_64-linux-sles12.4'
  },
  {
    name: 'llvm',
    url:
      'https://github.com/llvm/llvm-project/releases/download/llvmorg-9.0.1/clang+llvm-9.0.1-x86_64-linux-gnu-ubuntu-16.04.tar.xz',
    version: '9.0.1',
    dirName: 'clang+llvm-9.0.1-x86_64-linux-gnu-ubuntu-16.04'
  },
  {
    name: 'cuda',
    url:
      'https://developer.download.nvidia.com/compute/cuda/11.4.1/local_installers/cuda_11.4.1_470.57.02_linux.run',
    version: '11.4.1',
    dirName: 'cuda_11.4.1_470.57.02_linux'
  },
  CUDA102,
  {
    name: 'cuda',
    url:
      'https://developer.download.nvidia.com/compute/cuda/10.1/Prod/local_installers/cuda_10.1.243_418.87.00_linux.run',
    version: '10.1',
    dirName: 'cuda_10.1.243_418.87.00_linux'
  },
  CUDNN102
]

function ossStore(): OSS {
  const store = new OSS({
    region: 'oss-cn-beijing',
    accessKeyId: process.env['OSS_ACCESS_KEY_ID'] as string,
    accessKeySecret: process.env['OSS_ACCESS_KEY_SECRET'] as string
  })
  return store
}

function staticBucketStore(): OSS {
  const store = ossStore()
  store.useBucket('oneflow-static')
  return store
}

async function downloadAndExtract(url: string): Promise<string> {
  const downloaded = await tc.downloadTool(url)
  if (url.endsWith('tar.gz')) {
    return await tc.extractTar(downloaded)
  } else if (url.endsWith('tar.xz')) {
    return await extractTarX(downloaded)
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
  const store = staticBucketStore()
  const objectKey = GetDownloadsKey(fileName)
  try {
    await store.head(objectKey)
    core.info(`[found] ${url}`)
  } catch (error) {
    core.info(`[absent-url] ${url}`)
    core.info(`[absent-key] ${objectKey}`)
    if (isSelfHosted()) {
      return
    }
    const downloaded = await tc.downloadTool(url)
    await store.put(objectKey, downloaded, {
      timeout: 60 * 1000 * 60
    })
    await io.rmRF(downloaded)
    core.info(`[mirrored] ${url}`)
  }
}

export function GetOSSDownloadURL(url: string): string {
  const parsedURL = new URL(url)
  const store = staticBucketStore()
  const fileName = path.basename(parsedURL.pathname)
  const objectKey = GetDownloadsKey(fileName)
  return store.getObjectUrl(objectKey)
}

export async function ensureTool(tool: Tool): Promise<string> {
  const cachedPath = tc.find(tool.name, tool.version)
  const parsedURL = new URL(tool.url)
  const fileName = path.basename(parsedURL.pathname)
  const store = staticBucketStore()
  const isCudaRun: Boolean = tool.name === 'cuda' && tool.url.endsWith('.run')
  if (cachedPath) {
    return cachedPath
  } else {
    let downloadURL = tool.url
    if (isSelfHosted()) {
      const objectKey = GetDownloadsKey(fileName)
      downloadURL = store.getObjectUrl(objectKey)
    }
    if (isCudaRun) {
      let cudaRunFile = tc.find('cuda-run', tool.version)
      if (!cudaRunFile) {
        const downloaded = await tc.downloadTool(downloadURL)
        cudaRunFile = await tc.cacheFile(
          downloaded,
          'cuda-run',
          'cuda-run',
          tool.version
        )
      }
      const installedPath = path.join(getTempDirectory(), tool.dirName)
      const installedPathCached = tc.cacheDir(
        installedPath,
        tool.name,
        tool.version
      )
      return installedPathCached
    } else {
      const extractedDir = await downloadAndExtract(downloadURL)
      return await tc.cacheDir(
        path.join(extractedDir, tool.dirName),
        tool.name,
        tool.version
      )
    }
  }
}

export async function ensureCUDA102(): Promise<void> {
  await ensureTool(CUDA102)
  await ensureTool(CUDNN102)
}
