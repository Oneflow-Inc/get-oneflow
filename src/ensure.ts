import {isSelfHosted, extractTarX, createExtractFolder} from './util'
import OSS from 'ali-oss'
import path from 'path'
import * as tc from '@actions/tool-cache'
import * as core from '@actions/core'
import * as io from '@actions/io'
import {ok} from 'assert'
import * as exec from '@actions/exec'
import * as fs from 'fs'
import * as semver from 'semver'

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
  name: 'cuda-toolkit',
  url:
    'https://developer.download.nvidia.com/compute/cuda/10.2/Prod/local_installers/cuda_10.2.89_440.33.01_linux.run',
  version: '10.2.89',
  dirName: 'cuda_10.2.89_440.33.01_linux'
}

export const CUDNN102 = {
  name: 'cudnn',
  url:
    'https://oneflow-static.oss-cn-beijing.aliyuncs.com/downloads/cudnn-10.2-linux-x64-v8.2.4.15.tgz',
  version: '8.2.4-15-10.2',
  dirName: ''
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
    name: 'cuda-toolkit',
    url:
      'https://developer.download.nvidia.com/compute/cuda/11.4.1/local_installers/cuda_11.4.1_470.57.02_linux.run',
    version: '11.4.1',
    dirName: 'cuda_11.4.1_470.57.02_linux'
  },
  CUDA102,
  {
    name: 'cuda-toolkit',
    url:
      'https://developer.download.nvidia.com/compute/cuda/10.1/Prod/local_installers/cuda_10.1.243_418.87.00_linux.run',
    version: '10.1.243',
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

async function extractArchive(downloaded: string): Promise<string> {
  if (downloaded.endsWith('tar.gz') || downloaded.endsWith('tgz')) {
    return await tc.extractTar(downloaded)
  } else if (downloaded.endsWith('tar.xz')) {
    return await extractTarX(downloaded)
  } else {
    throw new Error(`don't know how to handle ${downloaded}`)
  }
}

function getDownloadsKey(fileName: string): string {
  return path.join('downloads', fileName)
}

export async function mirrorToDownloads(url: string): Promise<void> {
  const parsedURL = new URL(url)
  const fileName = path.basename(parsedURL.pathname)
  const store = staticBucketStore()
  const objectKey = getDownloadsKey(fileName)
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

export async function ensureTool(tool: Tool): Promise<string> {
  let cachedPath = tc.find(tool.name, tool.version)
  const parsedURL = new URL(tool.url)
  const fileName = path.basename(parsedURL.pathname)
  let archiveName = tool.name.concat('-archive')
  const store = staticBucketStore()
  const isCUDAToolkit: Boolean =
    tool.name === 'cuda-toolkit' && tool.url.endsWith('.run')
  const isCuDNN: Boolean = tool.name === 'cudnn'
  if (isCUDAToolkit) {
    archiveName = 'cuda-run'
  }
  ok(semver.clean(tool.version), `not a proper semver: ${tool.version}`)
  if (!cachedPath) {
    let downloadURL = tool.url
    if (isSelfHosted()) {
      const objectKey = getDownloadsKey(fileName)
      downloadURL = store.getObjectUrl(
        objectKey,
        'https://oneflow-static.oss-cn-beijing.aliyuncs.com'
      )
    }
    let archivePath = tc.find(archiveName, tool.version)
    // Download
    if (!archivePath) {
      core.info(`[not-found] ${archiveName}`)
      const allArchiveVersions = tc.findAllVersions(archiveName)
      core.info(`[all-versions] ${JSON.stringify(allArchiveVersions, null, 2)}`)
      const downloaded = await tc.downloadTool(downloadURL)
      const archivePathCached = await tc.cacheFile(
        downloaded,
        fileName,
        archiveName,
        tool.version
      )
      const archivePathFound = tc.find(archiveName, tool.version, 'x64')
      ok(
        archivePathCached === archivePathFound,
        new Error(`${archivePathCached} vs ${archivePathFound}`)
      )
      archivePath = archivePathFound
    }
    // Extract and cache
    if (isCUDAToolkit) {
      const cudaExtractDir = await createExtractFolder()
      const cudaExtractTmpDir = await createExtractFolder()
      await exec.exec('bash', [
        path.join(archivePath, fileName),
        `--extract=${cudaExtractDir}`,
        '--override',
        `--tmpdir=${cudaExtractTmpDir}`,
        '--silent',
        '--samples'
      ])
      const cudaToolkitPathCached = await tc.cacheDir(
        path.join(cudaExtractDir, 'cuda-toolkit'),
        tool.name,
        tool.version
      )
      const cudaToolkitPathFound = tc.find(tool.name, tool.version)
      ok(cudaToolkitPathCached === cudaToolkitPathFound)
      cachedPath = cudaToolkitPathCached
    } else {
      const extractedDir = await extractArchive(
        path.join(archivePath, fileName)
      )
      cachedPath = await tc.cacheDir(
        path.join(extractedDir, tool.dirName),
        tool.name,
        tool.version
      )
      ok(cachedPath === tc.find(tool.name, tool.version))
    }
  }
  // Check
  if (isCUDAToolkit) {
    ok(fs.existsSync(path.join(cachedPath, 'bin', 'nvcc')))
  }
  if (isCuDNN) {
    ok(fs.existsSync(path.join(cachedPath, 'cuda/lib64/libcudnn.so')))
    ok(fs.existsSync(path.join(cachedPath, 'cuda/lib64/libcudnn_static.a')))
  }
  return cachedPath
}

export async function ensureCUDA102(): Promise<void> {
  await ensureTool(CUDA102)
  await ensureTool(CUDNN102)
}

interface CUDATools {
  cudaToolkit: string
  cudaVersion: string
  cudnn: string
  cudaSemver: string
}

export async function ensureCUDA(): Promise<CUDATools> {
  const cudaVersion: string = core.getInput('cuda-version', {required: true})
  if (cudaVersion === '10.2') {
    return {
      cudaToolkit: await ensureTool(CUDA102),
      cudnn: await ensureTool(CUDNN102),
      cudaVersion,
      cudaSemver: CUDA102.version
    }
  } else {
    throw new Error(`unsupported cudaVersion: ${cudaVersion}`)
  }
}
