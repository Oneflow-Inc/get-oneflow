import * as gh from '@actions/github'
import * as exec from '@actions/exec'
import * as core from '@actions/core'
import OSS from 'ali-oss'
import * as path from 'path'
import * as fs from 'fs'
import * as util from './util'

class OssStorage {
  private client
  oss_region = 'oss-cn-beijing'
  oss_entry = 'https://oss-cn-beijing.aliyuncs.com'
  oss_bucket = 'oneflow-static'
  oss_id = process.env['OSS_ACCESS_KEY_ID'] as string
  oss_secret = process.env['OSS_ACCESS_KEY_SECRET'] as string
  constructor() {
    this.client = new OSS({
      region: this.oss_region,
      accessKeyId: this.oss_id,
      accessKeySecret: this.oss_secret,
      endpoint: this.oss_entry,
      bucket: this.oss_bucket
    })
  }

  async push(remote_path: string, local_path: string): Promise<boolean> {
    try {
      await this.client.put(remote_path, local_path)
      return true
    } catch (e) {
      return false
    }
  }

  async pull(remote_path: string, local_path: string): Promise<boolean> {
    try {
      await this.client.get(remote_path, local_path)
      return true
    } catch (e) {
      return false
    }
  }
}

function getFunc(flags: string): (a1: number, a2: number) => boolean {
  if (flags === '') {
    return function (a1: number, a2: number) {
      return a1 !== a2 || true
    }
  }
  if (flags.endsWith('%')) {
    const num = parseFloat(flags.substring(0, flags.length - 1))
    return function (a1: number, a2: number) {
      return a1 * (1 - num / 100) >= a2
    }
  } else {
    const num = parseFloat(flags)
    return function (a1: number, a2: number) {
      return a1 - num >= a2
    }
  }
}

export async function compareJson(
  bestJsonPath: string,
  cmpJsonPath: string,
  minFlags = '',
  maxFlags = '',
  meanFlags = ''
): Promise<boolean> {
  const best_data = JSON.parse(fs.readFileSync(bestJsonPath, 'utf-8'))
    .benchmarks.stats
  const cmp_data = JSON.parse(fs.readFileSync(cmpJsonPath, 'utf-8')).benchmarks
    .stats
  if (minFlags === '' && maxFlags === '' && meanFlags === '') return false
  return (
    getFunc(minFlags)(parseFloat(best_data.min), parseFloat(cmp_data.min)) &&
    getFunc(maxFlags)(parseFloat(best_data.max), parseFloat(cmp_data.max)) &&
    getFunc(meanFlags)(parseFloat(best_data.mean), parseFloat(cmp_data.mean))
  )
}

export async function benchmarkRefreshLog(): Promise<void> {
  const benchmarkId = '1-gpu-Resnet50'
  const oss = new OssStorage()
  const ossBestJsonPath = `benchmark/best/${benchmarkId}.json`
  const localPath = 'tmp'

  const minFlags = core.getInput('min-flag')
  const maxFlags = core.getInput('max-flag')
  const meanFlags = core.getInput('mean-flag')

  await exec.exec('rm', ['-rf', localPath])
  await exec.exec('mkdir', ['-p', localPath])
  //const ossPRJSONPath = `benchmark/pr/${gh.context.issue.number}/run/${gh.context.runId}/${benchmarkId}.json`
  const ossPRJSONPath = `benchmark/pr/7806/run/1992968915/${benchmarkId}.json`
  const localBestJsonPath = `${localPath}/best.json`
  const localPrJsonPath = `${localPath}/pr.json`
  if (
    (await oss.pull(ossBestJsonPath, localBestJsonPath)) &&
    (await oss.pull(ossPRJSONPath, localPrJsonPath))
  ) {
    if (
      await compareJson(
        localBestJsonPath,
        localPrJsonPath,
        minFlags,
        maxFlags,
        meanFlags
      )
    ) {
      await oss.push(localPrJsonPath, ossBestJsonPath)
    }
  }
}

export async function benchmarkWithPytest(): Promise<void> {
  const pyTestScript = util.getPathInput('pytest-script')
  const benchmarkId = core.getInput('benchmark-id')
  const pytestArgs = core.getMultilineInput('pytest-args')
  const pytestCompareArgs = core.getMultilineInput('pytest-compare-args')
  const containerName = core.getInput('container-name')

  const oss = new OssStorage()
  const cache_dir = `benchmark_result/${benchmarkId}`
  const jsonPath = path.join(cache_dir, 'result.json')
  const bestInHistoryJSONPath = path.join(cache_dir, 'best.json')
  const ossHistoricalBestJSONPath = `benchmark/best/${benchmarkId}.json`
  const ossPRJSONPath = `benchmark/pr/${gh.context.issue.number}/run/${gh.context.runId}/${benchmarkId}.json`
  // TODO: if it beats historical best, save it to PR best and replace historical best when PR is merged
  // const ossPRBESTJSONPath = `benchmark/pr/${gh.context.issue.number}/best/${benchmarkId}.json`
  const dockerExec = async (args: string[]): Promise<void> => {
    await exec.exec(
      'docker',
      ['exec', '-w', process.cwd(), containerName].concat(args)
    )
  }
  const pytest = async (args: string[]): Promise<void> => {
    await dockerExec(
      [
        'python3',
        '-m',
        'pytest',
        '-p',
        'no:randomly',
        '-p',
        'no:cacheprovider',
        '--max-worker-restart=0',
        '-x',
        '--durations=50',
        '--capture=sys'
      ].concat(args)
    )
  }

  await exec.exec('mkdir', ['-p', cache_dir])
  if (await oss.pull(ossHistoricalBestJSONPath, bestInHistoryJSONPath)) {
    await pytest(
      [
        '-v',
        `--benchmark-json=${jsonPath}`,
        `--benchmark-storage=${cache_dir}`,
        `--benchmark-compare=best`,
        pyTestScript
      ]
        .concat(pytestArgs)
        .concat(pytestCompareArgs)
    )
  } else {
    await pytest(
      ['-v', `--benchmark-json=${jsonPath}`, pyTestScript].concat(pytestArgs)
    )
    core.warning(`saving best record for benchmark: ${benchmarkId} `)
    await oss.push(ossHistoricalBestJSONPath, jsonPath)
  }
  await oss.push(ossPRJSONPath, jsonPath)
}
