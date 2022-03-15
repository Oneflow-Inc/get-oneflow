/* eslint-disable @typescript-eslint/no-unused-vars */
import * as core from '@actions/core'
import { cp, mkdirP, rmRF } from '@actions/io'
import OSS from 'ali-oss'
import { execSync } from 'child_process'
import fs from 'fs'

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
        });
    }

    async push(remote_path: string, local_path: string): Promise<boolean> {
        try {
            await this.client.put(remote_path, local_path);
            return true
        } catch (e) {
            return false
        }
    }

    async pull(remote_path: string, local_path: string): Promise<boolean> {
        try {
            await this.client.get(remote_path, local_path);
            return true
        } catch (e) {
            return false
        }
    }
}

class Benchmark {

    constructor(
        public pytest_script: string,
        public benchmark_id: string,
        public pytest_args: string,
        public pytest_cmp_args: string,
        public docker_name: string
    ) {
    }
    async run() {

        let oss = new OssStorage();
        let cache_dir = `benchmark_result/${this.benchmark_id}`
        let docker_pre_cmd = `docker exec -i ${this.docker_name}`
        execSync(`${docker_pre_cmd} mkdir -p ${cache_dir}`)
        execSync(`${docker_pre_cmd} python3 -m pytest -v ${this.pytest_script} ${this.pytest_args} --benchmark_cache_dir ${cache_dir} --benchmark-save=pytest`,
        {stdio: [0, 1, 2]})
        if (await oss.pull(`benchmark/${this.benchmark_id}`, `benchmark_result/${this.benchmark_id}/0002_pytest.json`)) {
            execSync(`${docker_pre_cmd} python3 -m pytest-benchmark  --benchmark_cache_dir ${cache_dir} compare 0001 0002 ${this.pytest_cmp_args}`)
        } else {
            await oss.push(`benchmark/${this.benchmark_id}`, `benchmark_result/${this.benchmark_id}/0001_pytest.json`)
        }
    }
}

export async function benchmarkWithPytest(): Promise<void> {
    const pyTestScript = core.getInput('pytest-script')
    const benchmarkId = core.getInput('benchmark-id')
    const pytestArgs = core.getMultilineInput('pytest-args')
    const pytestCompareArgs = core.getMultilineInput('pytest-compare-args')
    const containerName = core.getMultilineInput('container-name')

    // TODO: by yuhao
    let benchmark = new Benchmark(pyTestScript, benchmarkId, pytestArgs.join('\n'), pytestCompareArgs.join('\n'), containerName.join('\n'))
    benchmark.run()
}
