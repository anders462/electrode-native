import { MiniApp, utils as coreUtils } from 'ern-core'
import { epilog } from '../lib'
import { Argv } from 'yargs'

export const command = 'link'
export const desc = 'Link a MiniApp'

export const builder = (argv: Argv) => {
  return argv.epilog(epilog(exports))
}

export const handler = async () => {
  try {
    await MiniApp.fromCurrentPath().link()
  } catch (e) {
    coreUtils.logErrorAndExitProcess(e)
  }
}
