import * as core from '@actions/core'
import * as exec from './exec'
import * as tc from '@actions/tool-cache'
import Docker, {Container} from 'dockerode'
import {ensureTool as ensureTool, getPathInput} from './util'
import * as io from '@actions/io'

async function load_img(tag: string, url: string): Promise<void> {
  await exec.exec('docker', ['ps'])
  const inspect = await exec.exec('docker', ['inspect', tag], {
    ignoreReturnCode: true
  })
  if (inspect !== 0) {
    const imgPath = await tc.downloadTool(url)
    await exec.exec('docker', ['load', '-i', imgPath])
  }
}

export async function ensureDocker(): Promise<void> {
  try {
    await exec.exec('docker', ['ps'])
    await load_img(
      'quay.io/pypa/manylinux1_x86_64',
      'https://oneflow-static.oss-cn-beijing.aliyuncs.com/img/quay.iopypamanylinux1_x86_64.tar.gz'
    )
    await load_img(
      'quay.io/pypa/manylinux2010_x86_64',
      'https://oneflow-static.oss-cn-beijing.aliyuncs.com/img/quay.iopypamanylinux2010_x86_64.tar.gz'
    )
    await load_img(
      'quay.io/pypa/manylinux2014_x86_64:latest',
      'https://oneflow-static.oss-cn-beijing.aliyuncs.com/img/quay.iopypamanylinux2014_x86_64.tar.gz'
    )
    await load_img(
      'quay.io/pypa/manylinux_2_24_x86_64',
      'https://oneflow-static.oss-cn-beijing.aliyuncs.com/img/quay.iopypamanylinux_2_24_x86_64.tar.gz'
    )
  } catch (error) {
    core.warning(error.message)
  }
}

type ManylinuxVersion = '1' | '2010' | '2014' | '2_24'

export function tagFromversion(version: ManylinuxVersion): string {
  const repo = 'quay.io/pypa/'
  switch (version) {
    case '1':
    case '2010':
    case '2014':
      return repo.concat('manylinux').concat(version).concat('_x86_64')
    case '2_24':
      return repo.concat('manylinux_').concat(version).concat('_x86_64')
    default:
      throw new Error(`${version} not supported`)
  }
}

type StreamErr = {
  errorDetail: {
    code: number
    message: string
  }
  error: string
}
type StreamFrameData = {stream: string}
type StreamFrame = StreamFrameData | StreamErr

export async function buildManylinuxAndTag(
  version: ManylinuxVersion
): Promise<string> {
  const fromTag = tagFromversion(version)
  const splits = fromTag.split('/')
  const toTag: string = 'oneflowinc/'.concat(splits[splits.length - 1])
  const docker = new Docker({socketPath: '/var/run/docker.sock'})
  const stream = await docker.buildImage(
    {
      context: version === '2_24' ? 'manylinux/debian' : 'manylinux/centos',
      src: ['Dockerfile']
    },
    {
      t: toTag,
      networkmode: 'host',
      buildargs: {
        from: fromTag,
        HTTP_PROXY: process.env.HTTP_PROXY as string,
        http_proxy: process.env.http_proxy as string,
        HTTPS_PROXY: process.env.HTTPS_PROXY as string,
        https_proxy: process.env.https_proxy as string,
        SCCACHE_RELEASE_URL:
          'https://oneflow-static.oss-cn-beijing.aliyuncs.com/downloads/sccache-v0.2.15-x86_64-unknown-linux-musl.tar.gz'
      }
    }
  )
  new Docker().modem.demuxStream(stream, process.stdout, process.stderr)
  await new Promise((resolve, reject) => {
    new Docker().modem.followProgress(stream, (err, res: StreamFrame[]) => {
      const lastFrame = res[res.length - 1] as StreamErr
      lastFrame.error ? reject(lastFrame) : resolve(res)
      err ? reject(err) : resolve(res)
    })
  })
  return toTag
}

export async function runExec(
  container: Container,
  cmd: string[],
  cwd?: string
): Promise<void> {
  const exec_ = await container.exec({
    Cmd: cmd,
    AttachStdout: true,
    AttachStderr: true,
    WorkingDir: cwd
  })
  const stream = await exec_.start({Tty: false, Detach: false})
  await container.modem.demuxStream(stream, process.stdout, process.stderr)
  await new Promise((resolve, reject) => {
    const cb = (): void => {
      exec_.inspect((error, info) => {
        if (info) {
          if (info.Running === false) {
            if (info.ExitCode === 0) {
              resolve(info)
            } else {
              reject(info)
            }
          }
        }
        if (error) {
          reject(error)
        }
      })
    }
    cb()
    stream.on('end', cb)
    stream.on('error', cb)
    stream.on('close', cb)
    setTimeout(cb, 1000)
  })
}

export async function buildOneFlow(tag: string): Promise<void> {
  const oneflowSrc: string = getPathInput('oneflow-src', {required: true})
  const docker = new Docker({socketPath: '/var/run/docker.sock'})
  const CUDA_TOOLKIT_ROOT_DIR = '/usr/local/cuda'
  const CUDNN_ROOT_DIR = '/usr/local/cudnn'
  const containerName = 'ci-test-build-oneflow'
  const containerInfos = await docker.listContainers()
  for (const containerInfo of containerInfos) {
    if (
      containerInfo.Names.includes(containerName) ||
      containerInfo.Names.includes('/'.concat(containerName))
    ) {
      core.info(`removing docker container: ${containerInfo.Names}`)
      await docker.getContainer(containerInfo.Id).kill()
      await docker.getContainer(containerInfo.Id).wait({
        condition: 'removed'
      })
    }
  }
  let httpProxyEnvs: string[] = []
  const manylinuxCacheDir = getPathInput('manylinux-cache-dir')
  await io.mkdirP(manylinuxCacheDir)
  if (core.getBooleanInput('use-system-http-proxy', {required: false})) {
    httpProxyEnvs = [
      `HTTP_PROXY=${process.env.HTTP_PROXY}`,
      `http_proxy=${process.env.http_proxy}`,
      `HTTPS_PROXY=${process.env.HTTPS_PROXY}`,
      `https_proxy=${process.env.https_proxy}`
    ]
  }
  const llvmPath = await ensureTool('llvm', '10.0.1', '~/tools/llvm-10.01')
  const container = await docker.createContainer({
    Cmd: ['sleep', '3600'],
    Image: tag,
    name: containerName,
    HostConfig: {
      AutoRemove: true,
      NetworkMode: 'host',
      Binds: [`${manylinuxCacheDir}:${manylinuxCacheDir}`],
      Mounts: [
        {
          Source: oneflowSrc,
          Target: oneflowSrc,
          ReadOnly: true,
          Type: 'bind'
        },
        {
          Source: CUDA_TOOLKIT_ROOT_DIR,
          Target: '/usr/local/cuda',
          ReadOnly: true,
          Type: 'bind'
        },
        {
          Source: CUDNN_ROOT_DIR,
          Target: '/usr/local/cudnn',
          ReadOnly: true,
          Type: 'bind'
        },
        {
          Source: llvmPath,
          Target: '/usr/local/llvm',
          ReadOnly: true,
          Type: 'bind'
        }
      ]
    },
    Env: httpProxyEnvs
  })
  await container.start()
  const buildDir = '/build'
  const cmakeInitCache = 'cmake/caches/ci/cuda-75.cmake'
  await runExec(container, ['mkdir', buildDir])
  await runExec(container, ['ls'], oneflowSrc)
  await runExec(
    container,
    [
      'cmake',
      '-S',
      oneflowSrc,
      '-C',
      cmakeInitCache,
      '-B',
      buildDir,
      '-DPython3_EXECUTABLE=/opt/python/cp38-cp38/bin/python3'
    ],
    oneflowSrc
  )
}
