import {ComputePlatform, OutputIncludesAsMatrix} from './matrix'
import Docker, {MountSettings} from 'dockerode'
import os from 'os'
import {getPathInput} from './util'
import path from 'path'
import {killContainer, runBash} from './docker'
import {assert} from 'console'

// 1. check nobody is using the machine
// 2. check the metrics' standard deviation

// type ThroughputCalculationMethod = 'average' | 'minimum' | 'max' | 'medium'
type ExecutionMode = 'eager' | 'lazy' | 'jit' | 'graph'
// type Consistent = 'local' | 'consistent'
type Feature = 'amp'

interface EntryInclude {
  entry: string
  'compute-platform': ComputePlatform
  'cache-hit': Boolean
  'runs-on': string[] | string
  'execution-mode': ExecutionMode
  // consistent: Consistent
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

function updateName(entryInclude: EntryInclude): EntryInclude {
  entryInclude.entry = ([
    entryInclude['compute-platform'],
    entryInclude['execution-mode'],
    inputShapeToString(entryInclude['input-shape']),
    'world-size',
    entryInclude['world-size']
  ] as string[])
    .concat(entryInclude.features)
    .join('-')
  return entryInclude
}

export async function getTests(): Promise<EntryInclude[]> {
  const includes: EntryInclude[] = []
  const cacheHit = false
  const runsOn: string[] = []
  const modesToRun: ExecutionMode[] = ['eager', 'graph']
  const worldSizes: number[] = [1, 2]
  const allFeatures: Feature[][] = [['amp'], []]
  const inputSizes: number[][] = [
    [16, 3, 224, 224],
    [8, 3, 224, 224],
    [4, 3, 224, 224],
    [2, 3, 224, 224],
    [1, 3, 224, 224]
  ]
  for (const mode of modesToRun) {
    for (const features of allFeatures) {
      for (const worldSize of worldSizes) {
        for (const inputShape of inputSizes) {
          includes.push(
            updateName({
              entry: 'PLACEHOLDER',
              'compute-platform': 'cu102',
              'cache-hit': cacheHit,
              'runs-on': runsOn,
              features,
              'execution-mode': mode,
              'world-size': worldSize,
              'input-shape': inputShape
            })
          )
        }
      }
    }
  }
  return includes
}

export async function setSpeedMatrix(): Promise<void> {
  const entryIncludes = await getTests()
  OutputIncludesAsMatrix(entryIncludes)
}

function checkWithMediumHistory(result: GenericResult): boolean {
  assert(result)
  return false
}

export async function runTestInDocker(
  cmd: string,
  dockerImgTag: string
): Promise<void> {
  const docker = new Docker({socketPath: '/var/run/docker.sock'})
  const testCacheDir = getPathInput('test-cache-dir', {
    required: true
  })
  const containerName = 'oneflow-speed-test-'.concat(os.userInfo().username)
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
  const cmdToInstallOneFlow = 'pwd'
  await runBash(container, cmdToInstallOneFlow)
  await runBash(container, cmd, oneflowModels)
}

export async function runSpeedTest(entry: EntryInclude): Promise<void> {
  await runTestInDocker('', '')
  const genericResult: GenericResult = {
    peakGpuMemoryUsage: 100,
    throughput: 20,
    throughStd: 1,
    entry,
    systemInfo: 'todo'
  }
  if (checkWithMediumHistory(genericResult)) {
    throw new Error('check fail when comparing with historic performance data')
  }
}
function inputShapeToString(arg0: number[]): string {
  return arg0.join('x')
}
