import * as gh from '@actions/github'
import * as exec from '@actions/exec'
import * as core from '@actions/core'
import * as fs from 'fs'
import OSS from 'ali-oss'
import * as path from 'path'
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
  core.info(`[compareWith]: ${ossPRBESTJSONDir}`)

  const oss = OssStorage.getInstance()
  const lastCommitHistoryList = await oss.list(ossPRBESTJSONDir)
  for (const name of lastCommitHistoryList) {
    const benchmarkId = name.split('/').pop()
    if (!benchmarkId?.match(/\.json/)) continue
    core.info(`[compare]: - ${benchmarkId}`)

    const ossHistoricalBestJSONPath = `${gh.context.repo.owner}/${gh.context.repo.repo}/best/${benchmarkId}`
    if (await compareJson(ossHistoricalBestJSONPath, name))
      core.info(
        `[compareJson]: ${name} is better than ${ossHistoricalBestJSONPath}`
      )
    await oss.copy(ossHistoricalBestJSONPath, name)
  }
}
interface collectOutJson {
  func_name: string
  file_name: string
  compare: {
    median: string | null
    max: string | null
    min: string | null
    mean: string | null
  } | null
  retry: {
    iqr_outliers: number | null
    stddev_outliers: number | null
    times: number | null
  } | null
}

const pytest = async (
  pyTestScript: string,
  containerName: string,
  jsonPath: string,
  cachePath: string,
  histogramPrefix: string
): Promise<number> =>
  await exec.exec(
    'docker',
    [
      'exec',
      '-w',
      process.cwd(),
      containerName,
      'python3',
      '-m',
      'pytest',
      '-p',
      'no:randomly',
      '-p',
      'no:cacheprovider',
      '--max-worker-restart=0',
      '-x',
      '--capture=sys',
      '-v',
      `--benchmark-json=${jsonPath}`,
      `--benchmark-storage=${cachePath}`,
      '--benchmark-disable-gc',
      `--benchmark-warmup=on`,
      `--benchmark-histogram=${histogramPrefix}`,
      '--benchmark-min-rounds=80',
      pyTestScript
    ],
    {
      ignoreReturnCode: true
    }
  )

async function retryWhile(
  config: collectOutJson,
  jsonPath: string,
  pyTestScript: string,
  containerName: string,
  cachePath: string,
  histogramPrefix: string
): Promise<boolean> {
  let sucess = false
  const time = config.retry?.times ? config.retry.times + 1 : 1
  let index = 1
  while (!sucess && index <= time) {
    core.info(`[exec] ${index++}:${time} ${pyTestScript}`)
    await pytest(
      pyTestScript,
      containerName,
      jsonPath,
      cachePath,
      histogramPrefix
    )

    const outputContent: logJSON = JSON.parse(
      fs.readFileSync(jsonPath).toString()
    )

    sucess = true
    if (
      config.retry?.iqr_outliers &&
      outputContent.benchmarks[0].stats.iqr_outliers >
        config.retry?.iqr_outliers
    ) {
      core.info(
        `[outliers] ${outputContent.benchmarks[0].stats.iqr_outliers}(iqr_outliers) > ${config.retry?.iqr_outliers}`
      )
      sucess = false
    }
    if (
      config.retry?.stddev_outliers &&
      outputContent.benchmarks[0].stats.stddev_outliers >
        config.retry?.stddev_outliers
    ) {
      core.info(
        `[outliers] ${outputContent.benchmarks[0].stats.stddev_outliers}(stddev_outliers) > ${config.retry?.stddev_outliers}`
      )
      sucess = false
    }
  }
  return sucess
}

function compareOutput(
  jsonPath: string,
  bestInHistoryJSONPath: string,
  config: collectOutJson
): boolean {
  core.info(`[compare] ${jsonPath} with ${bestInHistoryJSONPath}`)
  const bestJSON: logJSON = JSON.parse(
    fs.readFileSync(bestInHistoryJSONPath).toString()
  )
  const best_benchmark = bestJSON.benchmarks
  const cmpJSON: logJSON = JSON.parse(fs.readFileSync(jsonPath).toString())
  const cmp_benchmark = cmpJSON.benchmarks
  if (best_benchmark.length !== cmp_benchmark.length) return false

  const best_data = best_benchmark[0].stats
  const cmp_data = cmp_benchmark[0].stats
  if (best_benchmark[0].name !== cmp_benchmark[0].name) return false

  if (config.compare?.median?.endsWith('%')) {
    const settings = config.compare.median
    const percent = parseInt(settings.substring(0, settings.length - 1))
    if (
      (cmp_data.median - best_data.median) / best_data.median >=
      percent / 100
    )
      return false
  }
  if (config.compare?.max?.endsWith('%')) {
    const settings = config.compare.max
    const percent = parseInt(settings.substring(0, settings.length - 1))
    if ((cmp_data.max - best_data.max) / best_data.max >= percent / 100)
      return false
  }
  if (config.compare?.min?.endsWith('%')) {
    const settings = config.compare.min
    const percent = parseInt(settings.substring(0, settings.length - 1))
    if ((cmp_data.min - best_data.min) / best_data.min >= percent / 100)
      return false
  }
  if (config.compare?.mean?.endsWith('%')) {
    const settings = config.compare.mean
    const percent = parseInt(settings.substring(0, settings.length - 1))
    if ((cmp_data.mean - best_data.mean) / best_data.mean >= percent / 100)
      return false
  }
  return true
}

export async function singleBenchmark(
  pyTestScript: string,
  benchmarkId: string,
  config: collectOutJson,
  containerName: string,
  debugMode: boolean
): Promise<void> {
  const oss = OssStorage.getInstance()
  const cachePath = `benchmark_result/${benchmarkId}`
  const jsonPath = path.join(cachePath, 'result.json')
  const bestInHistoryJSONPath = path.join(cachePath, 'best.json')
  const histogramPrefix = path.join(cachePath, benchmarkId)
  const ossHistoricalBestJSONPath = `${gh.context.repo.owner}/${gh.context.repo.repo}/best/${benchmarkId}.json`
  const ossRunPath = `${gh.context.repo.owner}/${gh.context.repo.repo}/pr/${gh.context.issue.number}/commit/${gh.context.sha}/run/${gh.context.runId}`
  const ossRunJSONPath = `${ossRunPath}/${benchmarkId}.json`

  await exec.exec('nvidia-smi', [])
  await exec.exec('mkdir', ['-p', cachePath])

  let hasBest = await oss.pull(ossHistoricalBestJSONPath, bestInHistoryJSONPath)
  if (debugMode) hasBest = false

  const sucess = await retryWhile(
    config,
    jsonPath,
    pyTestScript,
    containerName,
    cachePath,
    histogramPrefix
  )
  if (!sucess) {
    core.error(`[task] ${pyTestScript} is satisfied the outliers`)
  }
  for (const file of fs.readdirSync(cachePath)) {
    core.info(`[file] ${file}`)
    if (file.endsWith('.svg')) {
      const histogramPath = `${cachePath}/${file}`
      const ossRunHistogramPath = `${ossRunPath}/${file}`
      await oss.push(ossRunHistogramPath, histogramPath)
    }
  }
  await oss.push(ossRunJSONPath, jsonPath)

  if (hasBest) {
    const res = compareOutput(jsonPath, bestInHistoryJSONPath, config)
    if (res) {
      throw new Error(`benchmark failed`)
    }
  }
}

export async function benchmarkBatch(
  collectOutputJsons: string[],
  containerName: string,
  debugMode: boolean
): Promise<void> {
  for (const outputJson of collectOutputJsons) {
    const config: collectOutJson = JSON.parse(outputJson)
    await singleBenchmark(
      `${config.file_name}::${config.func_name}`,
      `1-gpu-${config.func_name}`,
      config,
      containerName,
      debugMode
    )
  }
}

export async function benchmarkWithPytest(): Promise<void> {
  core.info(`[task] benchmark with pytest`)
  const collectPath = core.getInput('collect-path')
  const containerName = core.getInput('container-name')
  const debugMode = core.getInput('debug-mode') === 'true'

  core.info(`[task] collect pytest functions in ${collectPath}`)
  const output = await exec.getExecOutput(
    'docker',
    [
      'exec',
      '-w',
      process.cwd(),
      containerName,
      'python3',
      '-m',
      'pytest',
      '-s',
      '--collect-only',
      collectPath
    ],
    {silent: true}
  )

  const lines = output.stdout.split('\n')
  let realFuctionCount = 0
  let decoratorFunctionCount = 0
  const collectOutputJsons = []

  for (const line of lines) {
    const decoratorRes = line.match(/^oneflow-benchmark-function::(.*)/)
    if (line.match(/<Function test/)) realFuctionCount++
    if (decoratorRes) {
      decoratorFunctionCount++
      collectOutputJsons.push(decoratorRes[1])
    }
  }

  if (realFuctionCount !== decoratorFunctionCount) {
    core.error(`[error] decorator fail to cover all test function!`)
  }

  core.info(`[task] exec pytest functions`)
  await benchmarkBatch(collectOutputJsons, containerName, debugMode)
}
