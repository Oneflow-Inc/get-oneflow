import * as core from '@actions/core'
import * as exec from './exec'
import * as tc from '@actions/tool-cache'
import Docker from 'dockerode'

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

type ManylinuxVersion = '1' | '2010' | '2014' | '2_24'

function tagFromversion(version: ManylinuxVersion): string {
  const repo = 'quay.io/pypa/'
  switch (version) {
    case '1':
    case '2010':
    case '2014':
      return repo.concat('manylinux').concat(version).concat('_x86_64')
    case '2_24':
      return repo.concat('manylinux_').concat(version).concat('_x86_64')
    default:
      throw new Error(`${version} not supported`)
  }
}

type StreamErr = {
  errorDetail: {
    code: number
    message: string
  }
  error: string
}
type StreamFrameData = {stream: string}
type StreamFrame = StreamFrameData | StreamErr

export async function buildManylinuxAndTag(
  version: ManylinuxVersion
): Promise<void> {
  const fromTag = tagFromversion(version)
  core.info(fromTag)
  const splits = fromTag.split('/')
  const toTag: string = 'oneflowinc/'.concat(splits[splits.length - 1])
  core.info(toTag)
  const docker = new Docker({socketPath: '/var/run/docker.sock'})
  const stream = await docker.buildImage(
    {
      context: version === '2_24' ? 'manylinux/debian' : 'manylinux/centos',
      src: ['Dockerfile']
    },
    {
      t: toTag,
      buildargs: {
        from: fromTag,
        networkmode: 'host',
        HTTP_PROXY: process.env.HTTP_PROXY as string,
        http_proxy: process.env.http_proxy as string,
        HTTPS_PROXY: process.env.HTTPS_PROXY as string,
        https_proxy: process.env.https_proxy as string,
        SCCACHE_RELEASE_URL:
          'https://oneflow-static.oss-cn-beijing.aliyuncs.com/downloads/sccache-v0.2.15-x86_64-unknown-linux-musl.tar.gz'
      }
    }
  )

  await new Promise((resolve, reject) => {
    new Docker().modem.followProgress(
      stream,
      (err, res: StreamFrame[]) => {
        const lastFrame = res[res.length - 1] as StreamErr
        lastFrame.error ? reject(lastFrame) : resolve(res)
        err ? reject(err) : resolve(res)
      },
      event => {
        if ((event as StreamFrameData).stream) {
          // eslint-disable-next-line no-console
          console.log(event.stream)
        }
      }
    )
  })
}

export async function buildManylinux(): Promise<void> {
  await buildManylinuxAndTag('2014')
  // await buildManylinuxAndTag('2_24')
}
