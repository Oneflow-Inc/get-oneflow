import * as core from '@actions/core'
import {staticBucketStore} from './ensure'

const PythonNameMap = new Map([
  ['3.6', 'cp36-cp36m'],
  ['3.7', 'cp37-cp37m'],
  ['3.8', 'cp38-cp38'],
  ['3.9', 'cp39-cp39'],
  ['3.10', 'cp310-cp310']
])

export async function findWheel(): Promise<void> {
  const commitId = core.getInput('ref', {required: true})
  const computePlatform = core.getInput('entry', {required: true})

  const store = staticBucketStore()
  const pipIndexPath = `commit/${commitId}/${computePlatform}/index.html`
  const result = await store.get(pipIndexPath)
  const stream = result.content
  const pythonVersion = core.getInput('python-version', {required: true})
  const pythonName = PythonNameMap.get(pythonVersion)
  if (stream.includes(pythonName)) {
    core.info(
      `OneFlow python wheel index file is found in oss ${pipIndexPath}.`
    )
    core.setOutput('find-wheel-hit', true)
  } else {
    core.info(
      `OneFlow python wheel index file is found in oss ${pipIndexPath}, but could not find a version that satisfies the requirement.`
    )
    core.setOutput('find-wheel-hit', false)
  }
}
