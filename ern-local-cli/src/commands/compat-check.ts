import {
  PackagePath,
  MiniApp,
  NativeApplicationDescriptor,
  utils as coreUtils,
  log,
} from 'ern-core'
import { checkCompatibilityWithNativeApp } from 'ern-orchestrator'
import {
  epilog,
  logErrorAndExitIfNotSatisfied,
  askUserToChooseANapDescriptorFromCauldron,
} from '../lib'

import { Argv } from 'yargs'

export const command = 'compat-check [miniapp]'
export const desc =
  'Run compatibility checks for one or more MiniApp(s) against a target native application version'

export const builder = (argv: Argv) => {
  return argv
    .option('miniapps', {
      alias: 'm',
      describe: 'A list of one or more miniapps',
      type: 'array',
    })
    .option('descriptor', {
      alias: 'd',
      describe:
        'Full native application selector (target native application version for the push)',
    })
    .epilog(epilog(exports))
}

export const handler = async ({
  miniapp,
  descriptor,
  miniapps = [],
}: {
  miniapp?: string
  descriptor?: string
  miniapps: string[]
}) => {
  try {
    if (!miniapp && miniapps.length === 0) {
      miniapps.push(MiniApp.fromCurrentPath().packageDescriptor)
    } else if (miniapp && miniapps.length === 0) {
      miniapps.push(miniapp)
    }

    if (!descriptor) {
      descriptor = await askUserToChooseANapDescriptorFromCauldron()
    }
    const napDescriptor = NativeApplicationDescriptor.fromString(descriptor)

    await logErrorAndExitIfNotSatisfied({
      isCompleteNapDescriptorString: { descriptor },
    })

    for (const miniappPath of miniapps) {
      const miniAppPackage = await MiniApp.fromPackagePath(
        PackagePath.fromString(miniappPath)
      )
      log.info(`=> ${miniAppPackage.name}`)
      await checkCompatibilityWithNativeApp(
        miniAppPackage,
        napDescriptor.name,
        napDescriptor.platform || undefined,
        napDescriptor.version || undefined
      )
    }
  } catch (e) {
    coreUtils.logErrorAndExitProcess(e)
  }
}
