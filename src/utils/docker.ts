import * as core from '@actions/core'
import Docker, {
  Container,
  ContainerCreateOptions,
  MountSettings
} from 'dockerode'
import {getParallel, getPathInput} from './util'
import * as io from '@actions/io'
import path from 'path'
import fs from 'fs'
import {ok} from 'assert'
import os from 'os'
export type BuildEnv = 'conda' | 'manylinux' | 'llvm' | 'openvino'

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
  if (options?.env) {
    core.info(options?.env.join(' '))
  }
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
  const buildEnv: BuildEnv = core.getInput('oneflow-build-env') as BuildEnv
  if (buildEnv !== 'manylinux') {
    return 'python3'
  }
  const exe = PythonExeMap.get(pythonVersion)
  ok(exe, `python3 version not supported: ${pythonVersion}`)
  return exe
}

type BuildAndMakeWheelOptions = {
  shouldCleanBuildDir: Boolean
  shouldCleanCcache: Boolean
}
async function buildAndMakeWheel(
  createOptions: ContainerCreateOptions,
  docker: Docker,
  buildDir: string,
  opts: BuildAndMakeWheelOptions
): Promise<void> {
  const shouldSymbolicLinkLld = core.getBooleanInput('docker-run-use-lld')
  const useNVWheels = core.getBooleanInput('use-nvidia-wheels')
  if (shouldSymbolicLinkLld) {
    core.warning('docker-run-use-lld not supported for now')
  }
  const buildEnv: BuildEnv = core.getInput('oneflow-build-env') as BuildEnv
  const shouldAuditWheel =
    core.getBooleanInput('wheel-audit', {
      required: false
    }) && buildEnv !== 'llvm'
  const oneflowSrc: string = getPathInput('oneflow-src', {required: true})
  const wheelhouseDir: string = getPathInput('wheelhouse-dir', {required: true})
  const buildScript: string = getPathInput('build-script', {
    required: true
  })
  const clearWheelhouseDir: Boolean = core.getBooleanInput(
    'clear-wheelhouse-dir',
    {
      required: false
    }
  )

  const container = await docker.createContainer(createOptions)
  await container.start()
  if (opts.shouldCleanBuildDir) {
    await runBash(container, `rm -rf ${path.join(buildDir, '*')}`)
  }
  await runBash(container, 'ccache -s')
  if (opts.shouldCleanCcache) {
    core.warning(`cleaning ccache...`)
    await runBash(container, 'ccache -C')
    await runBash(container, `rm -rf ~/.ccache/*`)
    await runBash(container, 'ccache -s')
  }
  let pythonVersions: string[] = core.getMultilineInput('python-versions', {
    required: true
  })
  if (buildEnv === 'llvm') {
    pythonVersions = ['any']
  }
  const distDir = path.join(oneflowSrc, 'python', 'dist')
  runExec(container, ['rm', '-rf', distDir])
  for (const pythonVersion of pythonVersions) {
    const pythonExe = getPythonExe(pythonVersion)
    await buildOnePythonVersion(container, buildScript, pythonExe)
  }
  const whlFiles = await fs.promises.readdir(distDir)
  ok(whlFiles.length, `no .whl found in ${distDir}`)
  if (clearWheelhouseDir) {
    await runBash(container, `rm -rf ${path.join(wheelhouseDir, '*')}`)
  }
  // TODO: copy from dist
  let postProcessCmds = [runCPack(container, buildDir)]
  let nvLibs: string[] = []
  if (useNVWheels) {
    nvLibs = [
      'libcudnn_cnn_infer.so',
      'libcudnn_cnn_train.so',
      'libcudnn_ops_infer.so',
      'libcudnn_ops_train.so',
      'libcublas.so',
      'libcublasLt.so'
    ]
  }
  const nvLibsExcludes = Array.prototype.concat.apply(
    [],
    nvLibs.map((nvLib: string) => ['--exclude', nvLib])
  )
  if (shouldAuditWheel) {
    postProcessCmds = postProcessCmds.concat(
      whlFiles.map(async (whl: string) =>
        runExec(
          container,
          [
            getPythonExe(pythonVersions[0]),
            '-m',
            'auditwheel',
            '--verbose',
            'repair',
            whl,
            '--wheel-dir',
            wheelhouseDir
          ].concat(nvLibsExcludes),
          {cwd: distDir}
        )
      )
    )
  }
  await Promise.all(postProcessCmds)
}

async function runCPack(
  container: Docker.Container,
  buildDir: string
): Promise<void> {
  await runExec(container, ['cpack'], {cwd: buildDir})
  await runExec(container, ['rm', '-rf', './cpack/_CPack_Packages'], {
    cwd: buildDir
  })
}

export async function buildOneFlow(tag: string): Promise<void> {
  const oneflowSrc: string = getPathInput('oneflow-src', {required: true})
  const isNightly = core.getBooleanInput('nightly', {required: false})
  const nightlyDate = core.getInput('nightly-date', {
    required: false
  })
  const wheelhouseDir: string = getPathInput('wheelhouse-dir', {required: true})
  const docker = new Docker({socketPath: '/var/run/docker.sock'})
  const containerName = 'oneflow-manylinux-'.concat(os.userInfo().username)
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
  const mounts: MountSettings[] = []
  const buildDir = path.join(manylinuxCacheDir, `build`)
  let nightlyEnv: ConcatArray<string> = []
  if (isNightly && !!nightlyDate && nightlyDate.length > 0) {
    nightlyEnv = [`ONEFLOW_NIGHTLY_DATE=${nightlyDate}`]
  }
  const runLit = core.getBooleanInput('run-lit')
    ? ['ONEFLOW_CI_BUILD_RUN_LIT=1']
    : []
  const createOptions: ContainerCreateOptions = {
    Cmd: ['sleep', '7200'],
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
      Mounts: mounts,
      ShmSize: 8000000000 // 8gb
    },
    Env: [
      `ONEFLOW_CI_BUILD_DIR=${buildDir}`,
      `ONEFLOW_CI_SRC_DIR=${oneflowSrc}`,
      `ONEFLOW_CI_BUILD_PARALLEL=${getParallel()}`
    ]
      .concat(httpProxyEnvs)
      .concat(nightlyEnv)
      .concat(runLit)
  }

  try {
    const shouldCleanCcache = core.getBooleanInput('clean-ccache', {
      required: false
    })
    await killContainer(docker, containerName)
    await buildAndMakeWheel(createOptions, docker, buildDir, {
      shouldCleanBuildDir: false,
      shouldCleanCcache
    })
  } catch (error) {
    const retryFailedBuild = core.getBooleanInput('retry-failed-build')
    if (retryFailedBuild) {
      core.warning('Retry Build and Make Wheel.')
      core.warning(JSON.stringify(error, null, 2))
      await killContainer(docker, containerName)
      await buildAndMakeWheel(createOptions, docker, buildDir, {
        shouldCleanBuildDir: true,
        shouldCleanCcache: true
      })
    } else {
      core.setFailed(error as Error)
      throw error
    }
  }
}

async function killContainer(
  docker: Docker,
  containerName: string
): Promise<void> {
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
