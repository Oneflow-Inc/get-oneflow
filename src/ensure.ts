import {isSelfHosted, extractTarX} from './util'
import OSS from 'ali-oss'
import path from 'path'
import * as tc from '@actions/tool-cache'
import os from 'os'

type Tool = {
  name: string
  url: string
  version: string
  dest: string
  dirName: string | null
}

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

export async function ensureTool(
  tool: Tool,
  setup: Function | null
): Promise<string> {
  const cachedPath = tc.find(tool.name, tool.version)
  const parsedURL = new URL(tool.url)
  const client = staticBucketClient()
  const fileName = path.basename(parsedURL.pathname)
  if (!cachedPath) {
    let downloadURL = tool.url
    if (isSelfHosted()) {
      const objectKey = path.join('downloads', fileName)
      downloadURL = await client.getObjectUrl(objectKey)
      downloadAndExtract(downloadURL, tool.name, tool.version)
      return await downloadAndExtract(downloadURL, tool.name, tool.version)
    }
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
