import * as core from '@actions/core'
import {ok} from 'assert'
import * as cache from './utils/cache'
async function run(): Promise<void> {
  try {
    const keys: string[] = core.getMultilineInput('keys', {required: true})
    const matrixKeys: string[] = core.getMultilineInput('matrix-keys', {
      required: true
    })
    const runnerLabels: string[] = core.getMultilineInput('runner-labels', {
      required: true
    })
    // TODO: add condition
    const MATRIX_KEY_PLACEHOLDER = '[matrix-key]'
    for (const key of keys) {
      ok(key.includes(MATRIX_KEY_PLACEHOLDER))
    }
    interface Matrix {
      entry: string[]
      include: unknown[]
    }
    const matrix: Matrix = {entry: matrixKeys, include: []}
    for (const matrixKey of matrixKeys) {
      const found = await cache.checkComplete(
        keys.map(x => x.replace(MATRIX_KEY_PLACEHOLDER, matrixKey))
      )
      matrix.include = matrix.include.concat([
        {
          'cache-hit': !!found,
          'runs-on': found ? 'ubuntu-latest' : runnerLabels
        }
      ])
    }
    core.setOutput('matrix', matrix)
  } catch (error) {
    core.setFailed(error as Error)
  }
}

run()
