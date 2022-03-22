import * as gh from '@actions/github'
import * as core from '@actions/core'
import {runAndSetFailed} from './utils/util'
import {buildWithCondaOrManyLinux} from './buildOneFlow'
import {cacheRun, postCacheRun} from './utils/cache'
import * as matrix from './utils/matrix'
import {downloadByDigest, uploadByDigest} from './utils/ssh'
import {findWheel} from './utils/findWheel'
import {setMasterAddress} from './utils/getMasterAddress'
import {waitForGPURunner} from './utils/wait'
import {checkPriorityPR} from './utils/crashUnlessPriority'
import {revivePRs} from './utils/revivePullRequests'
import {benchmarkWithPytest, updateBenchmakrHistory} from './utils/benchmark'
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
  | 'master-address'
  | 'wait-for-gpu'
  | 'priority-pr'
  | 'revive-pr'
  | 'pytest-benchmark'
  | 'update-benchmark-history'

runAndSetFailed(async () => {
  core.debug(JSON.stringify(gh, null, 2))
  const actionType = core.getInput('action-type', {
    required: true
  }) as ActionType
  if (actionType === 'build-oneflow') await buildWithCondaOrManyLinux()
  else if (actionType === 'cache-complete') {
    const isPostState = core.getState('isPost')
    if (isPostState && JSON.parse(isPostState)) {
      await postCacheRun()
    } else {
      await cacheRun()
      core.saveState('isPost', true)
    }
  } else if (actionType === 'cache-complete/matrix/build')
    await matrix.setBuildMatrix()
  else if (actionType === 'cache-complete/matrix/test')
    await matrix.setTestMatrix()
  else if (actionType === 'digest/download') await downloadByDigest()
  else if (actionType === 'digest/upload') await uploadByDigest()
  else if (actionType === 'find-wheel') await findWheel()
  else if (actionType === 'master-address') setMasterAddress()
  else if (actionType === 'wait-for-gpu') await waitForGPURunner()
  else if (actionType === 'priority-pr') await checkPriorityPR()
  else if (actionType === 'revive-pr') await revivePRs()
  else if (actionType === 'pytest-benchmark') await benchmarkWithPytest()
  else if (actionType === 'update-benchmark-history')
    await updateBenchmakrHistory()
  else throw new Error(`Action type not implemented ${actionType}`)
})
