import {downloadByDigest} from './utils/ssh'
import {runAndSetFailed} from './utils/util'

runAndSetFailed(downloadByDigest)
