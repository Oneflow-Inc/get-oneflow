import * as gh from '@actions/github'
import * as exec from '@actions/exec'
import * as core from '@actions/core'
import * as fs from 'fs'
import OSS from 'ali-oss'
import * as path from 'path'
import * as sysutil from 'util'
import {ExecOptions} from '@actions/exec/lib/interfaces'
import {getOSSCredentials} from './cache'

class OssStorage {
  private static instance: OssStorage
  private client
  oss_region = 'oss-cn-beijing'
  oss_entry = 'https://oss-cn-beijing.aliyuncs.com'
  oss_bucket = 'oneflow-benchmark'
  oss_id = getOSSCredentials().accessKeyId
  oss_secret = getOSSCredentials().accessKeySecret
  private constructor() {
    this.client = new OSS({
      region: this.oss_region,
      accessKeyId: this.oss_id,
      accessKeySecret: this.oss_secret,
      endpoint: this.oss_entry,
      bucket: this.oss_bucket
    })
  }

  static getInstance(): OssStorage {
    if (!OssStorage.instance) {
      OssStorage.instance = new OssStorage()
    }
    return OssStorage.instance
  }

  async push(remote_path: string, local_path: string): Promise<void> {
    if (gh.context.repo.owner !== 'Oneflow-Inc') {
      core.warning(
        'Not Oneflow-Inc repo, so skipping benchmarks result uploading due to lack of secrets'
      )
      return
    }
    await this.client.put(remote_path, local_path)
    core.info(`[push] ${remote_path}`)
    const base_url = 'https://oneflow-benchmark.oss-cn-beijing.aliyuncs.com'
    core.info(`[url] ${base_url}/${remote_path}`)
  }

  async pull(remote_path: string, local_path: string): Promise<boolean> {
    try {
      await this.client.get(remote_path, local_path)
      return true
    } catch (e) {
      return false
    }
  }

  async pull2Json(remote_path: string): Promise<string> {
    try {
      const buffer = await this.client.get(remote_path)
      return buffer.content.toString()
    } catch (e) {
      return ''
    }
  }

  async copy(dst_path: string, src_path: string): Promise<void> {
    if (gh.context.repo.owner !== 'Oneflow-Inc') {
      core.warning(
        'Not Oneflow-Inc repo, so skipping benchmarks best result updating due to lack of secrets'
      )
      return
    }
    await this.client.copy(dst_path, src_path)
  }

  async list(remote_path: string): Promise<string[]> {
    const res: string[] = []
    try {
      const bestList = await this.client.list(
        {'max-keys': 1000, prefix: remote_path},
        {}
      )
      for (const object of bestList.objects) {
        res.push(object['name'])
      }
      return res
    } catch (e) {
      return res
    }
  }
}

interface logJSON {
  machine_info: unknown
  commit_info: unknown
  benchmarks: [
    {
      group: string | null
      name: string
      fullname: string
      stats: {
        min: number
        max: number
        mean: number
        stddev: number
        rounds: number
        median: number
        iqr: number
        q1: number
        q3: number
        iqr_outliers: number
        stddev_outliers: number
        outliers: number
        ld15iqr: number
        hd15iqr: number
        ops: number
        total: number
        data: [number]
        iterations: number
      }
    }
  ]
  datetime: string
  version: string
}

async function compareJson(
  bestJsonPath: string,
  cmpJsonPath: string
): Promise<boolean> {
  const oss = OssStorage.getInstance()

  const bestJSON: logJSON = JSON.parse(await oss.pull2Json(bestJsonPath))
  const best_data_list = bestJSON.benchmarks
  const cmpJSON: logJSON = JSON.parse(await oss.pull2Json(cmpJsonPath))
  const cmp_data_list = cmpJSON.benchmarks
  if (best_data_list.length !== cmp_data_list.length) return false
  return best_data_list.every(function (elem, index): boolean {
    if (elem.name !== cmp_data_list[index].name) return false
    const best_data = elem.stats
    const cmp_data = cmp_data_list[index].stats
    return (
      best_data.min >= cmp_data.min &&
      best_data.max >= cmp_data.max &&
      best_data.mean >= cmp_data.mean &&
      best_data.median >= cmp_data.median
    )
  })
}

export async function findLastCommit(prID: number): Promise<string> {
  const ossPRJSONPath = `${gh.context.repo.owner}/${gh.context.repo.repo}/pr/${prID}`
  const oss = OssStorage.getInstance()
  let max_run_id = 0
  let max_commit_id = ''
  for (const pathName of await oss.list(ossPRJSONPath)) {
    const res = pathName.match(/(\w+)\/run\/(\d+)/)
    if (res?.length === 3) {
      const current_run_id = parseInt(res[2])
      if (current_run_id > max_run_id) {
        max_run_id = current_run_id
        max_commit_id = res[1]
      }
    }
  }
  return max_commit_id
}
export async function updateBenchmarkHistory(
  issueNumber = gh.context.issue.number
): Promise<void> {
  const lastCommitPRID = await findLastCommit(issueNumber)
  core.info(`[findLastCommit]: ${lastCommitPRID}`)
  const ossPRBESTJSONDir = `${gh.context.repo.owner}/${gh.context.repo.repo}/pr/${issueNumber}/commit/${lastCommitPRID}/run`
  const oss = OssStorage.getInstance()
  const lastCommitHistoryList = await oss.list(ossPRBESTJSONDir)
  for (const name of lastCommitHistoryList) {
    const benchmarkId = name.split('/').pop()
    const ossHistoricalBestJSONPath = `${gh.context.repo.owner}/${gh.context.repo.repo}/best/${benchmarkId}`
    if (await compareJson(ossHistoricalBestJSONPath, name))
      core.info(
        `[compareJson]: ${name} is better than ${ossHistoricalBestJSONPath}`
      )
    await oss.copy(ossHistoricalBestJSONPath, name)
  }
}

export async function singleBenchmark(
  pyTestScript: string,
  benchmarkId: string,
  pytestArgs: string[],
  containerName: string
): Promise<void> {
  const oss = OssStorage.getInstance()
  const cache_dir = `benchmark_result/${benchmarkId}`
  const jsonPath = path.join(cache_dir, 'result.json')
  const bestInHistoryJSONPath = path.join(cache_dir, 'best.json')
  const histogramPrefix = path.join(cache_dir, benchmarkId)
  const ossHistoricalBestJSONPath = `${gh.context.repo.owner}/${gh.context.repo.repo}/best/${benchmarkId}.json`
  const ossRunPath = `${gh.context.repo.owner}/${gh.context.repo.repo}/pr/${gh.context.issue.number}/commit/${gh.context.sha}/run/${gh.context.runId}`
  const ossRunJSONPath = `${ossRunPath}/${benchmarkId}.json`

  const dockerExec = async (
    args: string[],
    options?: ExecOptions
  ): Promise<number> =>
    await exec.exec(
      'docker',
      ['exec', '-w', process.cwd(), containerName].concat(args),
      options
    )

  await exec.exec('nvidia-smi', [])
  const pytest = async (
    args: string[],
    options?: ExecOptions
  ): Promise<number> =>
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
        '--capture=sys'
      ].concat(args),
      options
    )

  await exec.exec('mkdir', ['-p', cache_dir])
  pytestArgs = pytestArgs.concat([
    '-v',
    `--benchmark-json=${jsonPath}`,
    `--benchmark-storage=${cache_dir}`,
    '--benchmark-disable-gc',
    `--benchmark-warmup=on`,
    `--benchmark-histogram=${histogramPrefix}`
  ])
  const hasBest = await oss.pull(
    ossHistoricalBestJSONPath,
    bestInHistoryJSONPath
  )
  if (hasBest) {
    pytestArgs = pytestArgs.concat([`--benchmark-compare=best`])
  } else {
    pytestArgs = pytestArgs.filter(x => !x.includes('benchmark-compare'))
  }
  const test_result = await pytest(pytestArgs.concat([pyTestScript]), {
    ignoreReturnCode: true
  })
  for (const file of fs.readdirSync(cache_dir)) {
    core.info(`[file] ${file}`)
    if (file.endsWith('.svg')) {
      const histogramPath = `${cache_dir}/${file}`
      const ossRunHistogramPath = `${ossRunPath}/${file}`
      await oss.push(ossRunHistogramPath, histogramPath)
    }
  }
  await oss.push(ossRunJSONPath, jsonPath)
  if (test_result !== 0) {
    throw new Error(`benchmark failed, return code: ${test_result}`)
  }
  if (!hasBest) {
    core.warning(`saving best record for benchmark: ${benchmarkId} `)
    await oss.push(ossHistoricalBestJSONPath, jsonPath)
  }
}

interface collectOutJson {
  func_name: string
  file_name: string
  args: string[]
}

export async function benchmarkBatch(
  collectOutputPath: string,
  containerName: string
): Promise<void> {
  const readdir = sysutil.promisify(fs.readdir)
  const files = await readdir(collectOutputPath)
  for (const file of files) {
    const data = fs.readFileSync(path.join(collectOutputPath, file), 'utf8')
    const config: collectOutJson = JSON.parse(data)
    await singleBenchmark(
      `${config.file_name}::${config.func_name}`,
      `1-gpu-${config.func_name}`,
      config.args,
      containerName
    )
  }
}

export async function benchmarkWithPytest(): Promise<void> {
  const collectPath = core.getInput('collect-path')
  const containerName = core.getInput('container-name')

  const dockerExec = async (
    args: string[],
    options?: ExecOptions
  ): Promise<number> =>
    await exec.exec(
      'docker',
      ['exec', '-w', process.cwd(), containerName].concat(args),
      options
    )

  const collectOutputPath = '.benchmark-collect'
  await exec.exec('rm', ['-rf', collectOutputPath])
  await exec.exec('mkdir', ['-p', collectOutputPath])
  const shellScript = String.raw`python3 -m  pytest -s --collect-only ${collectPath} | grep json | sed "s/'/\\\\\\\"/g" | xargs -d$'\n' -I {}  bash -c "echo "{}`
  shellScript.replace('.benchmark-collect', collectOutputPath)
  await dockerExec(['bash', '-c', shellScript])

  await benchmarkBatch(collectOutputPath, containerName)
}
