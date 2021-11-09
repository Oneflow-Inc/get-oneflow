import {ComputePlatform, OutputIncludesAsMatrix} from './matrix'
import Docker, {Container, MountSettings} from 'dockerode'
import os from 'os'
import {getPathInput} from './util'
import path from 'path'
import {killContainer, runBash} from './docker.ts'

type ThroughputCalculationMethod = 'average' | 'minimum' | 'max' | 'medium'
type Execution = 'eager' | 'lazy' | 'jit'
type Consistent = 'local' | 'consistent'
type Feature = 'amp'

interface EntryInclude {
  entry: string
  'compute-platform': ComputePlatform
  'cache-hit': Boolean
  'runs-on': string[] | string
  execution: Execution
  consistent: Consistent
  features: Feature[]
  'input-shape': number[]
  'world-size': number | null
}

interface GenericResult {
  peakGpuMemoryUsage: number // mb
  throughput: number
  throughStd: number
  entry: EntryInclude
  systemInfo: unknown
}

function checkWithMediumHistory(result: GenericResult): boolean {}

async function runTestInDocker(
  cmd: string,
  dockerImgTag: string
): Promise<void> {
  const docker = new Docker({socketPath: '/var/run/docker.sock'})
  const testCacheDir = getPathInput('test-cache-dir', {
    required: true
  })
  const containerName = 'oneflow-manylinux-'.concat(os.userInfo().username)
  const oneflowSrc: string = getPathInput('oneflow-src', {required: true})
  const oneflowModels: string = getPathInput('oneflow-models', {required: true})
  const mounts: MountSettings[] = []
  const createOptions = {
    Cmd: ['sleep', '3000'],
    Image: dockerImgTag,
    name: containerName,
    HostConfig: {
      AutoRemove: true,
      NetworkMode: 'host',
      Binds: [
        `${testCacheDir}:${testCacheDir}`,
        `${path.join(testCacheDir, 'ccache')}:/root/.ccache`,
        `${path.join(testCacheDir, 'local')}:/root/.local`,
        `${path.join(testCacheDir, 'cache')}:/root/.cache`,
        `${oneflowModels}:${oneflowModels}`
      ],
      Mounts: mounts
    },
    Env: [
      `ONEFLOW_SRC_DIR=${oneflowSrc}`,
      `ONEFLOW_MODELS_DIR=${oneflowModels}`
    ]
  }
  await killContainer(docker, containerName)
  const container = await docker.createContainer(createOptions)
  await container.start()
  const cmdToInstallOneFlow = ''
  await runBash(container, cmdToInstallOneFlow)
  await runBash(container, cmd)
}

function updateName(entryInclude: EntryInclude): EntryInclude {
  entryInclude.entry = ([
    entryInclude['compute-platform'],
    entryInclude.mode
  ] as string[])
    .concat(entryInclude.features)
    .join('-')
  return entryInclude
}

async function getTests(): Promise<EntryInclude[]> {
  const includes: EntryInclude[] = []
  const cacheHit = false
  const runsOn: string[] = []
  const modesToRun: Mode[] = ['eager', 'graph', 'ddp']
  const allFeatures: Feature[][] = [['amp'], []]
  for (const mode of modesToRun) {
    for (const features of allFeatures) {
      includes.push(
        updateName({
          entry: 'PLACEHOLDER',
          'compute-platform': 'cu102',
          'cache-hit': cacheHit,
          'runs-on': runsOn,
          features,
          mode
        })
      )
    }
  }
  return includes
}

export async function setSpeedMatrix(): Promise<void> {
  const entryIncludes = await getTests()
  OutputIncludesAsMatrix(entryIncludes)
}
