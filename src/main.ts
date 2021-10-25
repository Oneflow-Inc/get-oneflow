import * as gh from '@actions/github'
import * as core from '@actions/core'
import {runAndSetFailed} from './utils/util'
import {buildWithCondaOrManyLinux} from './buildOneFlow'
import {cacheRun, postCacheRun} from './utils/cache'
import * as matrix from './utils/matrix'
import {downloadByDigest, uploadByDigest} from './utils/ssh'
import {runMirror} from './utils/mirrorTools'
import {runBuildManylinux} from './utils/docker'
import {findWheel} from './utils/findWheel'
type ActionType =
  | 'build-oneflow'
  | 'cache-complete'
  | 'cache-complete/matrix/build'
  | 'cache-complete/matrix/test'
  | 'digest/download'
  | 'digest/upload'
  | 'find-wheel'
  | 'manylinux'
  | 'mirror'
runAndSetFailed(async () => {
  core.debug(JSON.stringify(gh, null, 2))
  const actionType = core.getInput('action-type', {
    required: true
  }) as ActionType
  if (actionType === 'build-oneflow') await buildWithCondaOrManyLinux()
  if (actionType === 'cache-complete') {
    const isPostState = core.getState('isPost')
    if (isPostState && JSON.parse(isPostState)) {
      await postCacheRun()
    } else {
      await cacheRun()
      core.saveState('isPost', true)
    }
  }
  if (actionType === 'cache-complete/matrix/build')
    await matrix.setBuildMatrix()
  if (actionType === 'cache-complete/matrix/test') await matrix.setTestMatrix()
  if (actionType === 'digest/download') await downloadByDigest()
  if (actionType === 'digest/upload') await uploadByDigest()
  if (actionType === 'mirror') await runMirror()
  if (actionType === 'manylinux') await runBuildManylinux()
  if (actionType === 'find-wheel') await findWheel()
})
