import * as gh from '@actions/github'
import * as exec from '@actions/exec'
import * as core from '@actions/core'
import * as io from '@actions/io'
import * as fs from 'fs'
import OSS from 'ali-oss'
import * as path from 'path'
import {getOSSCredentials, pullWithoutSecret} from './cache'
import {Head} from './ghSupport'
import {getPercentageInput} from './util'

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
    const pull_request = gh.context.payload.pull_request
    if (pull_request) {
      const head = pull_request['head'] as Head
      if (head.repo.owner.login !== 'Oneflow-Inc') {
        core.warning(
          'Not Oneflow-Inc repo, so skipping benchmarks result uploading due to lack of secrets'
        )
        return
      }
    }
    await this.client.put(remote_path, local_path)
    core.info(`[push] ${remote_path}`)
    const base_url = 'https://oneflow-benchmark.oss-cn-beijing.aliyuncs.com'
    core.info(`[url] ${base_url}/${remote_path}`)
  }

  async pull(remote_path: string, local_path?: string): Promise<boolean> {
    return !!(await pullWithoutSecret(
      this.client,
      'oneflow-benchmark',
      remote_path,
      local_path
    ))
  }

  async pull2Json(remote_path: string): Promise<Object | null> {
    const downloaded = await pullWithoutSecret(
      this.client,
      'oneflow-benchmark',
      remote_path
    )
    if (downloaded) {
      const data = fs.readFileSync(downloaded).toString()
      return JSON.parse(data)
    } else {
      return null
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

  const bestJSON = (await oss.pull2Json(bestJsonPath)) as logJSON | null
  const cmpJSON = (await oss.pull2Json(cmpJsonPath)) as logJSON | null
  if (!bestJSON || !cmpJSON) {
    return false
  }
  const best_data_list = bestJSON.benchmarks
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
  const ossPRJsonPath = `${gh.context.repo.owner}/${gh.context.repo.repo}/pr/${prID}`
  const oss = OssStorage.getInstance()
  let max_run_id = 0
  let max_commit_id = ''
  for (const pathName of await oss.list(ossPRJsonPath)) {
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
  const lastCommitPRId = await findLastCommit(issueNumber)
  core.info(`[findLastCommit]: ${lastCommitPRId}`)
  const ossPRBestJSONDir = `${gh.context.repo.owner}/${gh.context.repo.repo}/pr/${issueNumber}/commit/${lastCommitPRId}/run`
  core.info(`[compareWith]: ${ossPRBestJSONDir}`)

  const oss = OssStorage.getInstance()
  const lastCommitHistoryList = await oss.list(ossPRBestJSONDir)
  for (const name of lastCommitHistoryList) {
    const benchmarkId = name.split('/').pop()
    if (!benchmarkId?.match(/\.json/)) continue
    core.info(`[compare]: - ${benchmarkId}`)

    const ossHistoricalBestJSONPath = `${gh.context.repo.owner}/${gh.context.repo.repo}/best/${benchmarkId}`
    if (await compareJson(ossHistoricalBestJSONPath, name)) {
      core.info(
        `[compareJson]: ${name} is better than ${ossHistoricalBestJSONPath}`
      )
      await oss.copy(ossHistoricalBestJSONPath, name)
    }
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
      '-p',
      'no:warnings',
      '--max-worker-restart=0',
      '-x',
      '--capture=sys',
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
type RunResult = 'success' | 'skip' | 'fail'

async function retryWhile(
  config: collectOutJson,
  jsonPath: string,
  pyTestScript: string,
  containerName: string,
  cachePath: string,
  histogramPrefix: string,
  args: string[]
): Promise<RunResult> {
  const time = config.retry?.times ? config.retry.times + 1 : 1
  let index = 1
  while (index <= time) {
    core.info(`[exec] ${index++}:${time} ${pyTestScript}`)
    const return_code = await pytest(
      pyTestScript,
      containerName,
      jsonPath,
      cachePath,
      histogramPrefix,
      args
    )

    let outputContent: logJSON
    try {
      outputContent = JSON.parse(fs.readFileSync(jsonPath).toString())
    } catch (error) {
      if (return_code === 0) {
        core.warning(`[skip] ${pyTestScript}`)
      }
      return 'skip'
    }
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
    if (success) return 'success'
  }
  return 'fail'
}

type benchmarkRes =
  | 'BEST_NOT_MATCH'
  | 'BEST_UNKNOWN'
  | 'UNKNOWN'
  | 'ERROR'
  | 'PASS'
  | 'GREATER'
  | 'SKIP'

// TODO: extend this to differentiate micro, small, medium, large cases. For instance a size1 benchmark should be micro
interface resJson {
  status: benchmarkRes
  best_stddev?: number
  best_median?: number
  now_stddev?: number
  now_median?: number
}
function compareOutput(
  jsonPath: string,
  bestInHistoryJSONPath: string,
  config: collectOutJson
): resJson {
  core.info(`[compare] ${jsonPath} with ${bestInHistoryJSONPath}`)
  const bestJSON: logJSON = JSON.parse(
    fs.readFileSync(bestInHistoryJSONPath).toString()
  )
  const best_benchmark = bestJSON.benchmarks
  const cmpJSON: logJSON = JSON.parse(fs.readFileSync(jsonPath).toString())
  const cmp_benchmark = cmpJSON.benchmarks
  if (best_benchmark.length !== cmp_benchmark.length)
    return {status: 'BEST_NOT_MATCH'}

  const best_data = best_benchmark[0].stats
  const cmp_data = cmp_benchmark[0].stats
  if (best_benchmark[0].name !== cmp_benchmark[0].name)
    return {status: 'BEST_NOT_MATCH'}

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
          `[compare] - failed ${realVal}(${compareParam.name}) > ${compareParam.threshold}`
        )
        return {
          status: 'ERROR',
          now_stddev: cmp_data.stddev,
          best_stddev: best_data.stddev,
          now_median: cmp_data.median,
          best_median: best_data.median
        }
      } else {
        if (realVal < 0) greater = true
        core.info(
          `[compare] - done ${realVal}(${compareParam.name}) < ${compareParam.threshold}`
        )
      }
    }
  }
  const status =
    greater && best_data.stddev > cmp_data.stddev ? 'GREATER' : 'PASS'
  return {
    status,
    now_stddev: cmp_data.stddev,
    best_stddev: best_data.stddev,
    now_median: cmp_data.median,
    best_median: best_data.median
  }
}

export async function singleBenchmark(
  pyTestScript: string,
  benchmarkId: string,
  config: collectOutJson,
  containerName: string
): Promise<resJson> {
  const oss = OssStorage.getInstance()
  const cachePath = `benchmarkResult/${benchmarkId}`
  const jsonPath = path.join(cachePath, 'result.json')
  const bestInHistoryJSONPath = path.join(cachePath, 'best.json')
  const histogramPrefix = path.join(cachePath, benchmarkId)
  const ossHistoricalBestJSONPath = `${gh.context.repo.owner}/${gh.context.repo.repo}/best/${benchmarkId}.json`
  const ossRunPath = `${gh.context.repo.owner}/${gh.context.repo.repo}/pr/${gh.context.issue.number}/commit/${gh.context.sha}/run/${gh.context.runId}`
  const ossRunJSONPath = `${ossRunPath}/${benchmarkId}.json`
  await io.mkdirP(cachePath)

  const hasBest = await oss.pull(
    ossHistoricalBestJSONPath,
    bestInHistoryJSONPath
  )

  const args = hasBest ? [`--benchmark-compare=${bestInHistoryJSONPath}`] : []
  const runResult = await retryWhile(
    config,
    jsonPath,
    pyTestScript,
    containerName,
    cachePath,
    histogramPrefix,
    args
  )

  if (runResult === 'skip') {
    return {status: 'SKIP'}
  }
  for (const file of fs.readdirSync(cachePath)) {
    if (file.endsWith('.svg')) {
      const histogramPath = `${cachePath}/${file}`
      const ossRunHistogramPath = `${ossRunPath}/${file}`
      await oss.push(ossRunHistogramPath, histogramPath)
    }
  }
  await oss.push(ossRunJSONPath, jsonPath)

  if (hasBest && runResult === 'success') {
    const res = compareOutput(jsonPath, bestInHistoryJSONPath, config)
    return res
  } else {
    oss.push(ossHistoricalBestJSONPath, jsonPath)
  }
  return {status: 'UNKNOWN'}
}

export async function benchmarkBatch(
  collectOutputJSONs: string[],
  containerName: string
): Promise<resJson[]> {
  await exec.exec('nvidia-smi', [])
  const res: resJson[] = []
  let total = 0
  let unknown = 0
  let error = 0
  let skip = 0
  for (const outputJson of collectOutputJSONs) {
    const config: collectOutJson = JSON.parse(outputJson)
    const output = await singleBenchmark(
      `${config.file_name}::${config.func_name}`,
      `1-gpu-${config.func_name}`,
      config,
      containerName
    )
    res.push(output)
    core.info(`[status][${config.func_name}] ${output.status}`)
    total++

    if (output.status === 'BEST_NOT_MATCH' || output.status === 'ERROR') error++
    else if (output.status === 'BEST_UNKNOWN' || output.status === 'UNKNOWN')
      unknown++
    else if (output.status === 'SKIP') skip++
    core.info(
      `[summary] ${JSON.stringify(
        {
          total,
          error,
          unknown,
          skip
        },
        null,
        2
      )}`
    )
  }
  return res
}

interface pytestArgs {
  collectPath: string
  containerName: string
  unknownThreshold: number
  errorThreshold: number
}

function getPytestArgs(): pytestArgs {
  core.info(`[task] benchmark with pytest`)
  const collectPath = core.getInput('collect-path')
  const containerName = core.getInput('container-name')
  // TODO: This is a typo, update it oneflow as well
  const unknownThreshold = getPercentageInput('unknown-threshold')
  const errorThreshold = getPercentageInput('error-threshold')

  if (collectPath === '')
    throw Error('please set collect path in your action.yml')
  if (containerName === '')
    throw Error('please set container name in your action.yml')
  if (unknownThreshold == null)
    throw Error('please set 0 < unknown-threshold <= 100 in your action.yml')
  if (errorThreshold == null)
    throw Error('please set 0 < error-threshold <= 100 in your action.yml')
  return {collectPath, containerName, unknownThreshold, errorThreshold}
}

async function collectPytest(
  collectPath: string,
  containerName: string
): Promise<string[]> {
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
  let realFunctionCount = 0
  let decoratorFunctionCount = 0
  const collectOutputJSONs = []

  for (const line of lines) {
    const decoratorRes = line.match(/^oneflow-benchmark-function::(.*)/)
    if (line.match(/<Function test/)) realFunctionCount++
    if (decoratorRes) {
      decoratorFunctionCount++
      collectOutputJSONs.push(decoratorRes[1])
    }
  }

  if (realFunctionCount !== decoratorFunctionCount) {
    throw new Error(`decorator fail to cover all test function!`)
  }
  return collectOutputJSONs
}

function PrintRes(
  collectOutputJSONs: string[],
  res: resJson[],
  unknownThreshold: number,
  errorThreshold: number
): void {
  const realFunctionCount = collectOutputJSONs.length
  let unknownNum = 0
  let errorNum = 0
  let skipNum = 0

  for (let i = 0; i < realFunctionCount; i++) {
    core.info(
      `[task] ${JSON.stringify(JSON.parse(collectOutputJSONs[i]), null, 2)}`
    )
    switch (res[i].status) {
      case 'BEST_NOT_MATCH':
        core.info(`[status] best not match `)
        errorNum++
        break
      case 'BEST_UNKNOWN':
        core.info(`[unknown]: best unknown stddev(in retry) > need`)
        unknownNum++
        break
      case 'ERROR':
        core.info(`[status] compare failed`)
        core.info(JSON.stringify(res[i], null, 2))
        errorNum++
        break
      case 'PASS':
        core.info(`[pass]: fit`)
        core.info(JSON.stringify(res[i], null, 2))
        break
      case 'GREATER':
        core.info(`[greater]: with best`)
        core.info(JSON.stringify(res[i], null, 2))
        break
      case 'UNKNOWN':
        core.info(`[unknown]: retry failed`)
        unknownNum++
        break
      case 'SKIP':
        core.info(`[skip]`)
        skipNum++
        break
    }
  }
  const real_unknown = unknownNum / (realFunctionCount - skipNum)
  const realError = errorNum / (realFunctionCount - skipNum)
  core.info(` - [skip] skip/total: ${skipNum}/${realFunctionCount}`)
  core.info(
    ` - [pass] unknown/total(minus skip): ${unknownNum}/${
      realFunctionCount - skipNum
    }`
  )
  core.info(
    ` - [pass] error/total(minus skip): ${errorNum}/${
      realFunctionCount - skipNum
    }`
  )

  // TODO: upload a summary so that it could be later retrieved and analyzed
  if (real_unknown > unknownThreshold) {
    core.info(`the ci benchmark set unknown threshold is ${unknownThreshold}`)
    core.info(`the ci benchmark output of unknown threshold is ${real_unknown}`)
    throw Error(
      `failed to pass unknown/total(minus skip) > threshold: ${real_unknown} > ${unknownThreshold}`
    )
  } else
    core.info(
      `[success] unknown/total(minus skip) < threshold: ${real_unknown} < ${unknownThreshold}`
    )
  if (realError > errorThreshold) {
    core.info(`the ci benchmark set error threshold is ${errorThreshold}`)
    core.info(`the ci benchmark output of error threshold is ${realError}`)
    throw Error(
      `error/total(minus skip) > threshold: ${realError} > ${errorThreshold}`
    )
  } else
    core.info(
      `[success] error/total(minus skip) < threshold: ${realError} < ${errorThreshold}`
    )
}

export async function benchmarkWithPytest(): Promise<void> {
  const {
    collectPath,
    containerName,
    unknownThreshold,
    errorThreshold
  } = getPytestArgs()

  core.info(`[task] collect pytest functions in ${collectPath}`)
  const collectOutputJSONs = await collectPytest(collectPath, containerName)

  // 2. iter collections to execute each pytest function
  core.info(`[task] exec pytest functions`)
  const res = await benchmarkBatch(collectOutputJSONs, containerName)

  // 3. print output
  PrintRes(collectOutputJSONs, res, unknownThreshold, errorThreshold)
}
