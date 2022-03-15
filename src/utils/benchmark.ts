import * as core from '@actions/core'
import OSS from 'ali-oss'
import {execSync} from 'child_process'
import * as path from 'path'

class OssStorage {
  private client
  oss_region = 'oss-cn-beijing'
  oss_entry = 'https://oss-cn-beijing.aliyuncs.com'
  oss_bucket = 'oneflow-ci-cache'
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
  const pyTestScript = core.getInput('pytest-script')
  const benchmarkId = core.getInput('benchmark-id')
  const pytestArgs = core.getMultilineInput('pytest-args')
  const pytestCompareArgs = core.getMultilineInput('pytest-compare-args')
  const containerName = core.getMultilineInput('container-name')

  const oss = new OssStorage()
  const cache_dir = `benchmark_result/${benchmarkId}`
  const docker_pre_cmd = `docker exec ${containerName}`
  const jsonPath = path.join(cache_dir, 'result.json')
  execSync(`${docker_pre_cmd} mkdir -p ${cache_dir}`)
  execSync(
    `${docker_pre_cmd} python3 -m pytest -v ${pyTestScript} ${pytestArgs} --benchmark-json ${jsonPath} --benchmark-save=pytest`,
    {stdio: [0, 1, 2]}
  )
  if (
    await oss.pull(
      `benchmark/${benchmarkId}`,
      `benchmark_result/${benchmarkId}/0002_pytest.json`
    )
  ) {
    execSync(
      `${docker_pre_cmd} python3 -m pytest-benchmark  --benchmark_cache_dir ${cache_dir} compare 0001 0002 ${pytestCompareArgs}`
    )
  } else {
    await oss.push(
      `benchmark/${benchmarkId}`,
      `benchmark_result/${benchmarkId}/0001_pytest.json`
    )
  }
}
