import * as core from '@actions/core'

async function run(): Promise<void> {
  try {
    // const keys: string[] = core.getMultilineInput('keys')
    let runnerLabels: string[] = core.getMultilineInput('runner-labels')
    const prefixes: string[] = core.getMultilineInput('prefixes')
    // if (runnerLabels.includes('self-hosted') === false) {
    //   runnerLabels.concat('self-hosted')
    // }
    const found = true
    if (found) {
      runnerLabels = ['ubuntu-latest']
    } else {
      if (runnerLabels.includes('self-hosted') === false) {
        runnerLabels = runnerLabels.concat(['self-hosted'])
      }
      if (runnerLabels.includes('linux') === false) {
        runnerLabels = runnerLabels.concat(['linux'])
      }
    }
    core.setOutput('runs-on', runnerLabels)
    core.setOutput('prefixes', prefixes)
  } catch (error) {
    core.setFailed(error.message)
  }
}

run()
