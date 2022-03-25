import {test} from '@jest/globals'
import {updateBenchmarkHistory} from '../src/utils/benchmark'

const MINUTES15 = 1000 * 60 * 15
// shows how the runner will run a javascript action with env / stdout protocol

test(
  'cache test matrix',
  async () => {
    // await updateBenchmarkHistory()
  },
  MINUTES15
)
