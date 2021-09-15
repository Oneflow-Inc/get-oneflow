import * as core from '@actions/core'
import * as cache from './utils/cache'

async function run(): Promise<void> {
  try {
    const entries: string[] = core.getMultilineInput('entries', {
      required: true
    })
    const runnerLabels: string[] = core.getMultilineInput('runner-labels', {
      required: true
    })
    interface Matrix {
      entry: string[]
      include: unknown[]
    }
    const matrix: Matrix = {entry: entries, include: []}
    for (const entry of entries) {
      const found = await cache.checkComplete(
        await cache.getOneFlowBuildCacheKeys(entry)
      )
      matrix.include = matrix.include.concat([
        {
          entry,
          'cache-hit': !!found,
          'runs-on': found ? 'ubuntu-latest' : runnerLabels
        }
      ])
    }
    core.setOutput('matrix', matrix)
    core.info(JSON.stringify(matrix, null, 2))
  } catch (error) {
    core.setFailed(error as Error)
  }
}

run()
