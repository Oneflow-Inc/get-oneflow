import OSS from 'ali-oss'
import * as core from '@actions/core'
import * as cache from './cache'

const PythonNameMap = new Map([
  ['3.6', 'cp36-cp36m'],
  ['3.7', 'cp37-cp37m'],
  ['3.8', 'cp38-cp38'],
  ['3.9', 'cp39-cp39'],
  ['3.10', 'cp310-cp310']
])

function staticBucketStore(): OSS {
  const store = new OSS(
    cache.addRetryMax({
      region: 'oss-cn-beijing',
      bucket: 'oneflow-staging',
      accessKeyId: cache.getOSSCredentials().accessKeyId,
      accessKeySecret: cache.getOSSCredentials().accessKeySecret
    })
  )
  return store
}

export async function findWheel(): Promise<void> {
  const commitId = core.getInput('ref', {required: true})
  const computePlatform = core.getInput('entry', {required: true})

  const pipIndexPath = `commit/${commitId}/${computePlatform}/index.html`

  const store = staticBucketStore()
  try {
    const result = await store.get(pipIndexPath)
    const stream = result.content
    const pythonVersion = core.getInput('python-version', {required: true})
    const pythonName = PythonNameMap.get(pythonVersion)
    if (stream.includes(pythonName)) {
      core.info(`OneFlow python wheel index is found in oss ${pipIndexPath}.`)
      core.setOutput('find-wheel-hit', true)
    } else {
      core.info(
        `OneFlow python wheel index is found in oss ${pipIndexPath}, but python version not match`
      )
      core.setOutput('find-wheel-hit', false)
    }
  } catch (error) {
    core.info('Can not find OneFlow python wheel in oss.')
    core.setOutput('find-wheel-hit', false)
  }
}
