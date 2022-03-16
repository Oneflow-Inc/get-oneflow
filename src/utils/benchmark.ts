import * as gh from '@actions/github'
import * as exec from '@actions/exec'
import * as core from '@actions/core'
import OSS from 'ali-oss'
import * as path from 'path'
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