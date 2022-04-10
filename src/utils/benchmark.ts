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
      best_data.median >= cmp_data.median &&
      best_data.stddev >= cmp_data.stddev
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
    iqr: number | null
    stddev: number | null
    times: number | null
  } | null
}

const pytest = async (
  pyTestScript: string,
  containerName: string,
  jsonPath: string,
  cachePath: string,
  histogramPrefix: string,
  args: string[]
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
      '--benchmark-min-rounds=10',
      pyTestScript
    ].concat(args),
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
  histogramPrefix: string,
  args: string[]
): Promise<boolean> {
  const time = config.retry?.times ? config.retry.times + 1 : 1
  let index = 1
  while (index <= time) {
    core.info(`[exec] ${index++}:${time} ${pyTestScript}`)
    await pytest(
      pyTestScript,
      containerName,
      jsonPath,
      cachePath,
      histogramPrefix,
      args
    )

    const outputContent: logJSON = JSON.parse(
      fs.readFileSync(jsonPath).toString()
    )
    const stats = outputContent.benchmarks[0].stats

    const retryList = [
      {
        threshold: config.retry?.iqr_outliers,
        realVal: stats.iqr_outliers,
        name: 'iqr_outliers'
      },
      {
        threshold: config.retry?.stddev_outliers,
        realVal: stats.stddev_outliers,
        name: 'stddev_outliers'
      },
      {
        threshold: config.retry?.iqr,
        realVal: stats.iqr * 1000,
        name: 'iqr'
      },
      {
        threshold: config.retry?.stddev,
        realVal: stats.stddev * 1000,
        name: 'stddev'
      }
    ]
    let success = true
    for (const retryParam of retryList) {
      if (retryParam.threshold) {
        if (retryParam.realVal > retryParam.threshold) {
          core.info(
            `[exec] - Fail: ${retryParam.realVal}(${retryParam.name}) > ${retryParam.threshold}`
          )
          success = false
          break
        } else {
          core.info(
            `[exec] - done: ${retryParam.realVal}(${retryParam.name}) < ${retryParam.threshold}`
          )
        }
      }
    }
    if (success) return true
  }
  return false
}

type benchmarkRes =
  | 'BEST_NOT_MATCH'
  | 'BEST_UNKNOWN'
  | 'UNKNOWN'
  | 'ERROR'
  | 'PASS'
  | 'GREATER'

function compareOutput(
  jsonPath: string,
  bestInHistoryJSONPath: string,
  config: collectOutJson
): benchmarkRes {
  core.info(`[compare] ${jsonPath} with ${bestInHistoryJSONPath}`)
  const bestJSON: logJSON = JSON.parse(
    fs.readFileSync(bestInHistoryJSONPath).toString()
  )
  const best_benchmark = bestJSON.benchmarks
  const cmpJSON: logJSON = JSON.parse(fs.readFileSync(jsonPath).toString())
  const cmp_benchmark = cmpJSON.benchmarks
  if (best_benchmark.length !== cmp_benchmark.length) return 'BEST_NOT_MATCH'

  const best_data = best_benchmark[0].stats
  const cmp_data = cmp_benchmark[0].stats
  core.info(`[compare] - best stats ${JSON.stringify(best_data)}`)
  core.info(`[compare] - cmp stats ${JSON.stringify(cmp_data)}`)
  if (best_benchmark[0].name !== cmp_benchmark[0].name) return 'BEST_NOT_MATCH'

  const compareList = [
    {
      threshold: config.compare?.median?.endsWith('%')
        ? parseInt(
            config.compare.median.substring(0, config.compare.median.length - 1)
          ) / 100
        : null,
      best: best_data.median,
      cmp: cmp_data.median,
      name: 'median'
    },
    {
      threshold: config.compare?.max?.endsWith('%')
        ? parseInt(
            config.compare.max.substring(0, config.compare.max.length - 1)
          ) / 100
        : null,
      best: best_data.max,
      cmp: cmp_data.max,
      name: 'max'
    },
    {
      threshold: config.compare?.min?.endsWith('%')
        ? parseInt(
            config.compare.min.substring(0, config.compare.min.length - 1)
          ) / 100
        : null,
      best: best_data.min,
      cmp: cmp_data.min,
      name: 'min'
    },
    {
      threshold: config.compare?.mean?.endsWith('%')
        ? parseInt(
            config.compare.mean.substring(0, config.compare.mean.length - 1)
          ) / 100
        : null,
      best: best_data.mean,
      cmp: cmp_data.mean,
      name: 'mean'
    }
  ]

  let greater = false
  for (const compareParam of compareList) {
    if (compareParam.threshold) {
      const realVal = (compareParam.cmp - compareParam.best) / compareParam.best
      if (realVal > compareParam.threshold) {
        core.info(
          `[error][compare] - failed ${realVal}(${compareParam.name}) > ${compareParam.threshold}`
        )
        return 'ERROR'
      } else {
        if (realVal < 0) greater = true
        core.info(
          `[compare] - done ${realVal}(${compareParam.name}) < ${compareParam.threshold}`
        )
      }
    }
  }
  return greater && best_data.stddev > cmp_data.stddev ? 'GREATER' : 'PASS'
}

export async function singleBenchmark(
  pyTestScript: string,
  benchmarkId: string,
  config: collectOutJson,
  containerName: string
): Promise<benchmarkRes> {
  const oss = OssStorage.getInstance()
  const cachePath = `benchmarkResult/${benchmarkId}`
  const jsonPath = path.join(cachePath, 'result.json')
  const bestInHistoryJSONPath = path.join(cachePath, 'best.json')
  const histogramPrefix = path.join(cachePath, benchmarkId)
  const ossHistoricalBestJSONPath = `${gh.context.repo.owner}/${gh.context.repo.repo}/best/${benchmarkId}.json`
  const ossRunPath = `${gh.context.repo.owner}/${gh.context.repo.repo}/pr/${gh.context.issue.number}/commit/${gh.context.sha}/run/${gh.context.runId}`
  const ossRunJSONPath = `${ossRunPath}/${benchmarkId}.json`

  await exec.exec('nvidia-smi', [])
  await exec.exec('mkdir', ['-p', cachePath])

  const hasBest = await oss.pull(
    ossHistoricalBestJSONPath,
    bestInHistoryJSONPath
  )

  const args = hasBest ? [`--benchmark-compare=${bestInHistoryJSONPath}`] : []
  const success = await retryWhile(
    config,
    jsonPath,
    pyTestScript,
    containerName,
    cachePath,
    histogramPrefix,
    args
  )

  if (!success) {
    core.info(`[task]  ${pyTestScript} benchmark is unkown`)
    return 'UNKNOWN'
  } else {
    core.info(`[task]  ${pyTestScript} benchmark pass`)
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
    return res
  } else {
    oss.push(ossHistoricalBestJSONPath, jsonPath)
  }
  return 'UNKNOWN'
}

export async function benchmarkBatch(
  collectOutputJsons: string[],
  containerName: string
): Promise<benchmarkRes[]> {
  const res: benchmarkRes[] = []
  for (const outputJson of collectOutputJsons) {
    const config: collectOutJson = JSON.parse(outputJson)
    const output = await singleBenchmark(
      `${config.file_name}::${config.func_name}`,
      `1-gpu-${config.func_name}`,
      config,
      containerName
    )
    res.push(output)
    core.info(`[output] ${config.func_name} ${output}`)
  }
  return res
}

export async function benchmarkWithPytest(): Promise<void> {
  core.info(`[task] benchmark with pytest`)
  const collectPath = core.getInput('collect-path')
  const containerName = core.getInput('container-name')
  const unkownThreshold = parseInt(core.getInput('unkown-threshold')) / 100
  const errorThreshold = parseInt(core.getInput('error-threshold')) / 100

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
  const res = await benchmarkBatch(collectOutputJsons, containerName)
  let unknownNum = 0
  let errorNum = 0

  for (let i = 0; i < realFuctionCount; i++) {
    switch (res[i]) {
      case 'BEST_NOT_MATCH':
        core.info(`[error] best not match ${collectOutputJsons[i]}`)
        errorNum++
        break
      case 'BEST_UNKNOWN':
        core.info(`[unkown]best unknown ${collectOutputJsons[i]}`)
        unknownNum++
        break
      case 'ERROR':
        core.info(`[error] ${collectOutputJsons[i]}`)
        errorNum++
        break
      case 'PASS':
        break
      case 'GREATER':
        core.info(`[greater] ${collectOutputJsons[i]}`)
        break
      case 'UNKNOWN':
        core.info(`[unkown] ${collectOutputJsons[i]}`)
        unknownNum++
        break
    }
  }
  const realUnkown = unknownNum / realFuctionCount
  const realError = errorNum / realFuctionCount
  core.info(`[pass] unkown/total: ${unknownNum}/${realFuctionCount}`)
  core.info(`[pass] error/total: ${errorNum}/${realFuctionCount}`)
  if (realUnkown > unkownThreshold)
    throw Error(
      `[error] unkown/total > threshold: ${realUnkown} > ${unkownThreshold}`
    )
  if (realError > errorThreshold)
    throw Error(
      `[error] error/total > threshold: ${realError} > ${errorThreshold}`
    )
}
