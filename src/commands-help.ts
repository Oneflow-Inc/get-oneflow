import {Interfaces, Help} from '@oclif/core'
import {fetch_yml_configuration} from './commands/build'

export default class MyHelpClass extends Help {
  async showCommandHelp(command: Interfaces.Command) {
    let settings = fetch_yml_configuration()
    for (let key in settings) {
      let val = settings[key]['default']
      let req = settings[key]['required'] == true && !val
      let is_boolean = val == 'true' || val == 'false'
      let description = settings[key]['description']
      let output = `  [${req ? 'required' : 'optional'}] --${key} ${
        is_boolean ? '(boolean)' : 'value'
      }`
      output +=
        description && description != ''
          ? '\n    - description: ' + description
          : ''
      output += val ? '\n    - default value: ' + val : ''
      console.log(output)
    }
  }
}
