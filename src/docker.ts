import * as core from '@actions/core'
import * as exec from '@actions/exec'
import * as tc from '@actions/tool-cache'
import Docker, {Container, MountSettings} from 'dockerode'
import {getPathInput, isSelfHosted} from './util'
import * as io from '@actions/io'
import path from 'path'
import fs from 'fs'
import {ok} from 'assert'
import {getOSSDownloadURL, ensureTool, LLVM12, ensureCUDA} from './ensure'
import os from 'os'

async function load_img(tag: string, url: string): Promise<void> {
  if (isSelfHosted()) {
    await exec.exec('docker', ['ps'], {silent: true})
    const inspect = await exec.exec('docker', ['inspect', tag], {
      ignoreReturnCode: true,
      silent: true
    })
    if (inspect !== 0) {
      const imgPath = await tc.downloadTool(url)
      await exec.exec('docker', ['load', '-i', imgPath])
    }
  } else {
    await exec.exec('docker', ['pull', tag], {silent: false})
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
    core.setFailed(error.message)
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
type StreamStatus = {
  status: string
  progressDetail?: {
    current: string
    total: string
  }
  progress?: string
  id?: string
}
type StreamFrameData = {stream: string}
type StreamFrame = StreamFrameData | StreamStatus | StreamErr

export const DOCKER_TOOL_URLS = {
  sccache:
    'https://github.com/mozilla/sccache/releases/download/v0.2.15/sccache-v0.2.15-x86_64-unknown-linux-musl.tar.gz',
  ccache:
    'https://github.com/ccache/ccache/releases/download/v4.4/ccache-4.4.tar.gz',
  bazel:
    'https://github.com/bazelbuild/bazel/releases/download/3.4.1/bazel-3.4.1-linux-x86_64',
  llvm1201src:
    'https://github.com/llvm/llvm-project/releases/download/llvmorg-12.0.1/llvm-project-12.0.1.src.tar.xz'
}

export async function buildManylinuxAndTag(
  version: ManylinuxVersion
): Promise<string> {
  const fromTag = tagFromversion(version)
  const splits = fromTag.split('/')
  let toTag: string = 'oneflowinc/'.concat(splits[splits.length - 1])
  toTag = [toTag, os.userInfo().username].join(':')
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
      SCCACHE_RELEASE_URL: getOSSDownloadURL(DOCKER_TOOL_URLS.sccache),
      CCACHE_RELEASE_URL: getOSSDownloadURL(DOCKER_TOOL_URLS.ccache),
      LLVM_SRC_URL: getOSSDownloadURL(DOCKER_TOOL_URLS.llvm1201src),
      BAZEL_URL: getOSSDownloadURL(DOCKER_TOOL_URLS.bazel)
    }
    buildArgs = {...buildArgs, ...selfHostedBuildArgs}
  }
  core.info(
    JSON.stringify(
      {
        toTag,
        buildArgs
      },
      null,
      2
    )
  )
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
  core.debug('started building docker img')
  new Docker().modem.demuxStream(stream, process.stdout, process.stderr)
  await new Promise((resolve, reject) => {
    new Docker().modem.followProgress(
      stream,
      (err, res: StreamFrame[]) => {
        const lastFrame = res[res.length - 1] as StreamErr
        lastFrame.error ? reject(lastFrame) : resolve(res)
        err ? reject(err) : resolve(res)
      },
      (event: StreamFrame) => {
        const err = event as StreamErr
        const status = event as StreamStatus
        const data = event as StreamFrameData
        if (err.error) {
          core.info(err.error)
        } else if (status.status) {
          core.info(`[${status.status}] ${status.progress}`)
        } else if (data.stream) {
          core.info(data.stream)
        } else {
          core.info(JSON.stringify(event, null, 2))
        }
      }
    )
  })
  core.debug('done building docker img')
  return toTag
}

interface RunExecOptions {
  env?: string[] | undefined
  cwd?: string | undefined
}

export async function runExec(
  container: Container,
  cmd: string[],
  options?: RunExecOptions
): Promise<void> {
  const exec_ = await container.exec({
    Cmd: cmd,
    AttachStdout: true,
    AttachStderr: true,
    WorkingDir: options?.cwd,
    Env: options?.env
  })
  core.info(cmd.join(' '))
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

export async function runBash(
  container: Container,
  cmd: string,
  cwd?: string
): Promise<void> {
  return await runExec(
    container,
    ['bash', '-lc', `source /root/.bashrc && ${cmd}`],
    {cwd}
  )
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
  ok(exe, pythonVersion)
  return exe
}

async function buildAndMakeWheel(
  createOptions: Object,
  docker: Docker
): Promise<void> {
  const shouldSymbolicLinkLld = core.getBooleanInput('docker-run-use-lld')
  const oneflowSrc: string = getPathInput('oneflow-src', {required: true})
  const wheelhouseDir: string = getPathInput('wheelhouse-dir', {required: true})
  const buildScript: string = getPathInput('build-script', {
    required: true
  })
  const container = await docker.createContainer(createOptions)
  await container.start()
  const pythonVersions: string[] = core.getMultilineInput('python-versions', {
    required: true
  })
  if (shouldSymbolicLinkLld) {
    for (const gccVersion of ['7', '10']) {
      await runBash(
        container,
        `rm -f /opt/rh/devtoolset-${gccVersion}/root/usr/bin/ld`
      )
      await runBash(
        container,
        `ln -s $(which lld) /opt/rh/devtoolset-${gccVersion}/root/usr/bin/ld`
      )
    }
  }
  const distDir = path.join(oneflowSrc, 'python', 'dist')
  runExec(container, ['rm', '-rf', distDir])
  for (const pythonVersion of pythonVersions) {
    const pythonExe = getPythonExe(pythonVersion)
    await buildOnePythonVersion(container, buildScript, pythonExe)
  }
  const whlFiles = await fs.promises.readdir(distDir)
  ok(whlFiles.length)
  await Promise.all(
    whlFiles.map(async (whl: string) =>
      runExec(
        container,
        ['auditwheel', 'repair', whl, '--wheel-dir', wheelhouseDir],
        {cwd: distDir}
      )
    )
  )
}

export async function buildOneFlow(tag: string): Promise<void> {
  const oneflowSrc: string = getPathInput('oneflow-src', {required: true})
  const wheelhouseDir: string = getPathInput('wheelhouse-dir', {required: true})
  const docker = new Docker({socketPath: '/var/run/docker.sock'})
  const cudaTools = await ensureCUDA()
  const containerName = 'oneflow-manylinux-'.concat(os.userInfo().username)
  const containerInfos = await docker.listContainers()
  for (const containerInfo of containerInfos) {
    if (
      containerInfo.Names.includes(containerName) ||
      containerInfo.Names.includes('/'.concat(containerName))
    ) {
      core.info(`removing docker container: ${containerInfo.Names}`)
      try {
        await docker.getContainer(containerInfo.Id).kill()
        await docker.getContainer(containerInfo.Id).wait({
          condition: 'removed'
        })
      } catch (error) {
        core.info(JSON.stringify(error))
      }
    }
  }
  let httpProxyEnvs: string[] = []
  const manylinuxCacheDir = getPathInput('manylinux-cache-dir', {
    required: true
  })
  // TODO: don't do any sub-directory appending, leave action caller to decide the cache dir?
  await io.mkdirP(manylinuxCacheDir)
  if (
    core.getBooleanInput('docker-run-use-system-http-proxy', {
      required: false
    })
  ) {
    httpProxyEnvs = [
      `HTTP_PROXY=${process.env.HTTP_PROXY}`,
      `http_proxy=${process.env.http_proxy}`,
      `HTTPS_PROXY=${process.env.HTTPS_PROXY}`,
      `https_proxy=${process.env.https_proxy}`
    ]
  }
  let llvmDir = ''
  const shouldMountLLVM = false
  let mounts: MountSettings[] = []
  if (cudaTools) {
    const CUDA_TOOLKIT_ROOT_DIR = cudaTools.cudaToolkit
    const CUDNN_ROOT_DIR = path.join(cudaTools.cudnn, 'cuda')
    mounts = mounts.concat([
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
    ])
  }
  if (shouldMountLLVM) {
    llvmDir = await ensureTool(LLVM12)
    mounts.push({
      Source: llvmDir,
      Target: '/usr/local/llvm',
      ReadOnly: true,
      Type: 'bind'
    })
  }
  const buildDir = path.join(manylinuxCacheDir, `build`)
  const createOptions = {
    Cmd: ['sleep', '3000'],
    Image: tag,
    name: containerName,
    HostConfig: {
      AutoRemove: true,
      NetworkMode: 'host',
      Binds: [
        `${manylinuxCacheDir}:${manylinuxCacheDir}`,
        `${path.join(manylinuxCacheDir, 'ccache')}:/root/.ccache`,
        `${path.join(manylinuxCacheDir, 'local')}:/root/.local`,
        `${path.join(manylinuxCacheDir, 'cache')}:/root/.cache`,
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
  }
  try {
    throw new Error('Something bad happened')
    // await buildAndMakeWheel(createOptions, docker)
  } catch (error) {
    const retryFailedBuild = core.getBooleanInput('retry-failed-build')
    if (retryFailedBuild) {
      if (fs.existsSync(buildDir)) {
        fs.rmdirSync(buildDir, {recursive: true})
        core.info('Remove build Directory')
      }
      core.info('Retry Build and Make Wheel.')
      await buildAndMakeWheel(createOptions, docker)
    } else {
      core.setFailed(error.message)
    }
  }
}

async function buildOnePythonVersion(
  container: Docker.Container,
  buildScript: string,
  pythonExe: string
): Promise<void> {
  const cmakeInitCache = getPathInput('cmake-init-cache', {required: true})
  await runExec(container, ['bash', '-l', buildScript], {
    env: [
      `ONEFLOW_CI_PYTHON_EXE=${pythonExe}`,
      `ONEFLOW_CI_CMAKE_INIT_CACHE=${cmakeInitCache}`
    ]
  })
}
