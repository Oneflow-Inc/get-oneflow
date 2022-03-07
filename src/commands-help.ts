import {Interfaces, Help} from '@oclif/core'
import {fetch_yml_configuration} from './commands/build'

export default class MyHelpClass extends Help {
  async showCommandHelp(command: Interfaces.Command) {
    let settings = fetch_yml_configuration()
    for (let key in settings) {
      let val = settings[key]['default']
      let req = settings[key]['required'] == true && !val
      let show = val ? '\n    default value: ' + val : ''
      console.log(`  [${req ? 'required' : 'optional'}] --${key} ${show} `)
    }
  }
}
