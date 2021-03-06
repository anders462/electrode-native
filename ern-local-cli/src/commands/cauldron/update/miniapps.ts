import {
  MiniApp,
  PackagePath,
  NativeApplicationDescriptor,
  utils as coreUtils,
  nativeDepenciesVersionResolution as resolver,
  log,
  kax,
} from 'ern-core'
import { getActiveCauldron } from 'ern-cauldron-api'
import { performContainerStateUpdateInCauldron } from 'ern-orchestrator'
import {
  epilog,
  logErrorAndExitIfNotSatisfied,
  askUserToChooseANapDescriptorFromCauldron,
  logNativeDependenciesConflicts,
} from '../../../lib'
import _ from 'lodash'
import { Argv } from 'yargs'

export const command = 'miniapps <miniapps..>'
export const desc =
  'Update the version(s) of one or more MiniApp(s) in the Cauldron'

export const builder = (argv: Argv) => {
  return argv
    .option('containerVersion', {
      alias: 'v',
      describe:
        'Version to use for generated container. If none provided, patch version will be bumped by default.',
      type: 'string',
    })
    .option('descriptor', {
      alias: 'd',
      describe: 'A complete native application descriptor',
      type: 'string',
    })
    .option('force', {
      alias: 'f',
      describe: 'Force',
      type: 'boolean',
    })
    .epilog(epilog(exports))
}

// Most/All of the logic here should be moved to the MiniApp class
// Commands should remain as much logic less as possible
export const handler = async ({
  miniapps,
  descriptor,
  force,
  containerVersion,
}: {
  miniapps: string[]
  containerVersion?: string
  descriptor?: string
  force?: boolean
}) => {
  await logErrorAndExitIfNotSatisfied({
    cauldronIsActive: {
      extraErrorMessage:
        'A Cauldron must be active in order to use this command',
    },
  })
  try {
    if (!descriptor) {
      descriptor = await askUserToChooseANapDescriptorFromCauldron({
        onlyNonReleasedVersions: true,
      })
    }
    const napDescriptor = NativeApplicationDescriptor.fromString(descriptor)

    await logErrorAndExitIfNotSatisfied({
      isCompleteNapDescriptorString: { descriptor },
      isNewerContainerVersion: containerVersion
        ? {
            containerVersion,
            descriptor,
            extraErrorMessage:
              'To avoid conflicts with previous versions, you can only use container version newer than the current one',
          }
        : undefined,
      isValidContainerVersion: containerVersion
        ? { containerVersion }
        : undefined,
      miniAppIsInNativeApplicationVersionContainer: {
        extraErrorMessage:
          'If you want to add a new MiniApp(s), use -ern cauldron add miniapps- instead',
        miniApp: miniapps,
        napDescriptor,
      },
      miniAppIsInNativeApplicationVersionContainerWithDifferentVersion: {
        extraErrorMessage:
          'It seems like you are trying to update a MiniApp to a version that is already the one in use.',
        miniApp: miniapps,
        napDescriptor,
      },
      napDescriptorExistInCauldron: {
        descriptor,
        extraErrorMessage:
          'This command cannot work on a non existing native application version',
      },
    })

    const miniAppsObjs: MiniApp[] = []
    const miniAppsDependencyPaths = _.map(miniapps, m =>
      PackagePath.fromString(m)
    )
    for (const miniAppDependencyPath of miniAppsDependencyPaths) {
      const m = await kax
        .task(`Retrieving ${miniAppDependencyPath.toString()} MiniApp`)
        .run(MiniApp.fromPackagePath(miniAppDependencyPath))
      miniAppsObjs.push(m)
    }

    const cauldron = await getActiveCauldron()
    const miniAppsInCauldron = await cauldron.getContainerMiniApps(
      napDescriptor
    )
    const nonUpdatedMiniAppsInCauldron = _.xorBy(
      miniAppsDependencyPaths,
      miniAppsInCauldron,
      'basePath'
    )
    const nonUpdatedMiniAppsInCauldronObjs: MiniApp[] = []
    for (const nonUpdatedMiniAppInCauldron of nonUpdatedMiniAppsInCauldron) {
      const m = await kax
        .task(`Retrieving ${nonUpdatedMiniAppInCauldron.toString()} MiniApp`)
        .run(MiniApp.fromPackagePath(nonUpdatedMiniAppInCauldron))
      nonUpdatedMiniAppsInCauldronObjs.push(m)
    }

    const nativeDependencies = await resolver.resolveNativeDependenciesVersionsOfMiniApps(
      [...miniAppsObjs, ...nonUpdatedMiniAppsInCauldronObjs]
    )
    const cauldronDependencies = await cauldron.getNativeDependencies(
      napDescriptor
    )
    const finalNativeDependencies = resolver.retainHighestVersions(
      nativeDependencies.resolved,
      cauldronDependencies
    )

    logNativeDependenciesConflicts(nativeDependencies, {
      throwIfConflict: !force,
    })

    const cauldronCommitMessage = [
      `${
        miniapps.length === 1
          ? `Update ${
              miniapps[0]
            } MiniApp version in ${napDescriptor.toString()}`
          : `Update multiple MiniApps versions in ${napDescriptor.toString()}`
      }`,
    ]

    await performContainerStateUpdateInCauldron(
      async () => {
        for (const miniAppObj of miniAppsObjs) {
          cauldronCommitMessage.push(
            `- Update ${miniAppObj.name} MiniApp version to v${
              miniAppObj.version
            }`
          )
        }
        await cauldron.syncContainerMiniApps(
          napDescriptor,
          miniAppsDependencyPaths
        )
        await cauldron.syncContainerNativeDependencies(
          napDescriptor,
          finalNativeDependencies
        )
      },
      napDescriptor,
      cauldronCommitMessage,
      { containerVersion }
    )
    log.info(
      `MiniApp(s) version(s) was/were succesfully updated for ${napDescriptor.toString()} in Cauldron !`
    )
  } catch (e) {
    coreUtils.logErrorAndExitProcess(e)
  }
}
