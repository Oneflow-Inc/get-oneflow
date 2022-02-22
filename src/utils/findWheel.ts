import * as core from '@actions/core'
import {ossStore} from './ensure'

const PythonNameMap = new Map([
  ['3.6', 'cp36-cp36m'],
  ['3.7', 'cp37-cp37m'],
  ['3.8', 'cp38-cp38'],
  ['3.9', 'cp39-cp39'],
  ['3.10', 'cp310-cp310']
])

export async function checkIfWheelExists(
  commitId: string,
  computePlatform: string,
  pythonVersion: string
): Promise<boolean> {
  const store = ossStore()
  store.useBucket('oneflow-staging')
  const pipIndexPath = `commit/${commitId}/${computePlatform}/index.html`

  let result = null
  try {
    result = await store.get(pipIndexPath)
  } catch (error) {
    core.info('Could not find a version that satisfies the requirement')
    core.info(JSON.stringify(error, null, 2))
    core.setOutput('find-wheel-hit', false)
    return false
  }
  const stream = result.content
  const pythonName = PythonNameMap.get(pythonVersion)
  if (stream.includes(pythonName)) {
    core.info(
      `OneFlow python wheel index file is found in oss ${pipIndexPath}.`
    )
    core.setOutput('find-wheel-hit', true)
    return true
  } else {
    core.info(
      `OneFlow python wheel index file is found in oss ${pipIndexPath}, but could not find a version that satisfies the requirement.`
    )
    core.setOutput('find-wheel-hit', false)
    return false
  }
}

export async function findWheel(): Promise<boolean> {
  const commitId = core.getInput('ref', {required: true})
  const computePlatform = core.getInput('compute-platform', {required: true})
  const pythonVersion = core.getInput('python-version', {required: true})
  return checkIfWheelExists(commitId, computePlatform, pythonVersion)
}
