import * as core from '@actions/core'
import * as exec from '@actions/exec'
import * as tc from '@actions/tool-cache'
import Docker, {Container, MountSettings} from 'dockerode'
import {ensureTool as ensureTool, getPathInput, isSelfHosted} from './util'
import * as io from '@actions/io'
import path from 'path'
import fs from 'fs'
import {ok} from 'assert'

async function load_img(tag: string, url: string): Promise<void> {
  await exec.exec('docker', ['ps'], {silent: true})
  const inspect = await exec.exec('docker', ['inspect', tag], {
    ignoreReturnCode: true,
    silent: true
  })
  if (inspect !== 0) {
    const imgPath = await tc.downloadTool(url)
    await exec.exec('docker', ['load', '-i', imgPath])
  }
}

export async function ensureDocker(): Promise<void> {
  try {
    await exec.exec('docker', ['ps'], {silent: true})
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
  let buildArgs = {
    from: fromTag,
    HTTP_PROXY: process.env.HTTP_PROXY as string,
    http_proxy: process.env.http_proxy as string,
    HTTPS_PROXY: process.env.HTTPS_PROXY as string,
    https_proxy: process.env.https_proxy as string
  }
  if (isSelfHosted()) {
    const selfHostedBuildArgs = {
      SCCACHE_RELEASE_URL:
        'https://oneflow-static.oss-cn-beijing.aliyuncs.com/downloads/sccache-v0.2.15-x86_64-unknown-linux-musl.tar.gz',
      LLVM_SRC_URL:
        'https://oneflow-static.oss-cn-beijing.aliyuncs.com/downloads/llvm-project-12.0.1.src.tar.xz',
      BAZEL_URL:
        'https://oneflow-static.oss-cn-beijing.aliyuncs.com/downloads/bazel-3.4.1-linux-x86_64'
    }
    buildArgs = {...buildArgs, ...selfHostedBuildArgs}
  }
  const stream = await docker.buildImage(
    {
      context: version === '2_24' ? 'manylinux/debian' : 'manylinux/centos',
      src: ['Dockerfile']
    },
    {
      t: toTag,
      networkmode: 'host',
      buildargs: buildArgs
    }
  )
  new Docker().modem.demuxStream(stream, process.stdout, process.stderr)
  await new Promise((resolve, reject) => {
    new Docker().modem.followProgress(stream, (err, res: StreamFrame[]) => {
      const lastFrame = res[res.length - 1] as StreamErr
      lastFrame.error ? reject(res) : resolve(res)
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

const PythonExeMap = new Map([
  ['3.6', '/opt/python/cp36-cp36m/bin/python3'],
  ['3.7', '/opt/python/cp37-cp37m/bin/python3'],
  ['3.8', '/opt/python/cp38-cp38/bin/python3'],
  ['3.9', '/opt/python/cp39-cp39/bin/python3'],
  ['3.10', '/opt/python/cp310-cp310/bin/python3']
])

function getPythonExe(pythonVersion: string): string {
  const exe = PythonExeMap.get(pythonVersion)
  ok(exe)
  return exe
}

export async function buildOneFlow(tag: string): Promise<void> {
  const oneflowSrc: string = getPathInput('oneflow-src', {required: true})
  const wheelhouseDir: string = getPathInput('wheelhouse-dir', {required: true})
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
  let llvmDir = ''
  const shouldMountLLVM = false
  const mounts: MountSettings[] = [
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
    }
  ]
  if (shouldMountLLVM) {
    llvmDir = await ensureTool('llvm', '9.0.1', '~/tools/llvm-9.01')
    mounts.push({
      Source: llvmDir,
      Target: '/usr/local/llvm',
      ReadOnly: true,
      Type: 'bind'
    })
  }
  const buildDir = path.join(manylinuxCacheDir, 'build')

  const container = await docker.createContainer({
    Cmd: ['sleep', '3600'],
    Image: tag,
    name: containerName,
    HostConfig: {
      AutoRemove: true,
      NetworkMode: 'host',
      Binds: [
        `${manylinuxCacheDir}:${manylinuxCacheDir}`,
        `${path.join(manylinuxCacheDir, 'ccache')}:/root/.ccache`,
        `${path.join(manylinuxCacheDir, 'local')}:/root/.local`,
        `${oneflowSrc}:${oneflowSrc}`,
        `${wheelhouseDir}:${wheelhouseDir}`
      ],
      Mounts: mounts
    },
    Env: [
      `ONEFLOW_CI_BUILD_DIR=${buildDir}`,
      `ONEFLOW_CI_SRC_DIR=${oneflowSrc}`,
      `ONEFLOW_CI_LLVM_DIR=${llvmDir}`
    ].concat(httpProxyEnvs)
  })
  await container.start()

  const pythonVersions: string[] = core.getMultilineInput('python-versions', {
    required: true
  })
  for (const pythonVersion of pythonVersions) {
    const pythonExe = getPythonExe(pythonVersion)
    await buildOnePythonVersion(container, oneflowSrc, buildDir, pythonExe)
  }
  const distDir = path.join(oneflowSrc, 'python', 'dist')
  const whlFiles = await fs.promises.readdir(distDir)
  ok(whlFiles.length)
  await Promise.all(
    whlFiles.map(async (whl: string) =>
      runExec(
        container,
        ['auditwheel', 'repair', whl, '--wheel-dir', wheelhouseDir],
        distDir
      )
    )
  )
}

async function buildOnePythonVersion(
  container: Docker.Container,
  oneflowSrc: string,
  buildDir: string,
  pythonExe: string
): Promise<void> {
  const cmakeInitCache = getPathInput('cmake-init-cache')
  const argsExclude = ['-e', '!dist', '-e', '!dist/**']
  await runExec(
    container,
    ['git', 'clean', '-nXd'].concat(argsExclude),
    path.join(oneflowSrc, 'python')
  )
  await runExec(
    container,
    ['git', 'clean', '-fXd'].concat(argsExclude),
    path.join(oneflowSrc, 'python')
  )
  await runExec(container, ['mkdir', '-p', buildDir])
  await runExec(container, [
    'cmake',
    '-S',
    oneflowSrc,
    '-C',
    cmakeInitCache,
    '-B',
    buildDir,
    `-DPython3_EXECUTABLE=${pythonExe}`
  ])
  await runExec(container, [
    'cmake',
    '--build',
    buildDir,
    '--parallel',
    (await exec.getExecOutput('nproc')).stdout.trim()
  ])
  await runExec(
    container,
    [pythonExe, 'setup.py', 'bdist_wheel'],
    path.join(oneflowSrc, 'python')
  )
}
