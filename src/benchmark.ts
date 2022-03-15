import { cp, mkdirP, rmRF } from '@actions/io'
import OSS from 'ali-oss'
import { exec } from 'child_process'
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

    public log_dir: string
    constructor(public docker_cmd: string, public vision_path: string, public compare_flags: string) {
        let python_min_version = 7
        let version = `Linux-CPython-3.${python_min_version}-64bit`
        this.log_dir = `${vision_path}/.benchmarks/${version}/`
    }

    public compare_script(name: string) {
        return `cd ${this.vision_path} && python -m pytest \
    -v benchmark/test_benchmark.py::${name}                \
    --benchmark-save=${name}                               \
    --benchmark-compare=0001                               \
    ${this.compare_flags}`
    }

    public initialize_script(name: string) {
        return `cd ${this.vision_path} && python -m pytest \
    -v benchmark/test_benchmark.py::${name}                \
    --benchmark-save=${name}`
    }

    async run() {
        let oss = new OssStorage()
        let benchmark_cache = `${this.vision_path}/.benchmarks-cache`
        await rmRF(benchmark_cache)
        await mkdirP(benchmark_cache)

        const raw_data = fs.readFileSync(`${this.vision_path}/benchmark/test_benchmark.py`).toString()
        for (const line of raw_data.split(/[\n]+/)) {
            if (line.indexOf('def test_') == 0) {
                const regex = /(test_[a-zA-Z_]*)/g;
                const found = line.match(regex);
                if (found?.length == 1) {
                    await rmRF(this.log_dir)
                    await mkdirP(this.log_dir)
                    const task_name = found[0]
                    let remote_path = `benchmarks/${task_name}`
                    let local_path = `${this.log_dir}/0001_${task_name}.json`
                    let output = `${this.log_dir}/0001_${task_name}.json`
                    if (await oss.pull(remote_path, local_path)) {
                        let cmd = `${this.docker_cmd} ${this.compare_script(task_name)}`
                        const { stdout ,stderr } = await exec(cmd)
                    } else {
                        output = `${this.log_dir}/0002_${task_name}.json`
                        let cmd = `${this.docker_cmd} ${this.initialize_script(task_name)}`
                        const { stdout ,stderr } = await exec(cmd)
                    }
                    await cp(output, `${benchmark_cache}/${task_name}.json`)
                }
            }
        }
    }

}

let benchmark = new Benchmark('docker -it ', '/home/howin/Project/One/vision', '')
benchmark.run()