import * as core from '@actions/core'
import {buildManylinuxAndTag} from './utils/docker'

async function run(): Promise<void> {
  try {
    const manylinuxVersion: string = core.getInput('manylinux-version', {
      required: true
    })
    if (manylinuxVersion === '2014') {
      const tag = await buildManylinuxAndTag(manylinuxVersion)
      core.setOutput('tag', tag)
    } else {
      core.setFailed(`unsupported manylinuxVersion: ${manylinuxVersion}`)
    }
  } catch (error) {
    core.setFailed(error as Error)
  }
}

run()
