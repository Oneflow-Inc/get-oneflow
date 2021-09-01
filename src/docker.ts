import * as core from '@actions/core'
import * as exec from './exec'
import * as tc from '@actions/tool-cache'

async function load_img(tag: string, url: string): Promise<void> {
  await exec.exec('docker', ['ps'])
  const inspect = await exec.exec('docker', ['inspect', tag], {
    ignoreReturnCode: true
  })
  if (inspect !== 0) {
    const imgPath = await tc.downloadTool(url)
    await exec.exec('docker', ['load', '-i', imgPath])
  }
}

export async function ensureDocker(): Promise<void> {
  try {
    await exec.exec('docker', ['ps'])
    await load_img(
      'quay.io/pypa/manylinux1_x86_64',
      'https://oneflow-static.oss-cn-beijing.aliyuncs.com/img/quay.iopypamanylinux1_x86_64.tar.gz'
    )
    await load_img(
      'quay.io/pypa/manylinux2010_x86_64',
      'https://oneflow-static.oss-cn-beijing.aliyuncs.com/img/quay.iopypamanylinux2010_x86_64.tar.gz'
    )
    await load_img(
      'quay.io/pypa/manylinux2014_x86_64:latest',
      'https://oneflow-static.oss-cn-beijing.aliyuncs.com/img/quay.iopypamanylinux2014_x86_64.tar.gz'
    )
    await load_img(
      'quay.io/pypa/manylinux_2_24_x86_64',
      'https://oneflow-static.oss-cn-beijing.aliyuncs.com/img/quay.iopypamanylinux_2_24_x86_64.tar.gz'
    )
  } catch (error) {
    core.warning(error.message)
  }
}
