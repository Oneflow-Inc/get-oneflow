import * as core from '@actions/core'

async function run(): Promise<void> {
  try {
    // const keys: string[] = core.getMultilineInput('keys')
    let runnerLabels: string[] = core.getMultilineInput('runner-labels')
    // if (runnerLabels.includes('self-hosted') === false) {
    //   runnerLabels.concat('self-hosted')
    // }
    if (runnerLabels === []) {
      runnerLabels = runnerLabels.concat('ubuntu-latest')
    }
    core.setOutput('runs-on', runnerLabels)
  } catch (error) {
    core.setFailed(error.message)
  }
}

run()
