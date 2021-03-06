import { NativeApplicationDescriptor, ErnBinaryStore, log } from 'ern-core'
import { getActiveCauldron } from 'ern-cauldron-api'
import { epilog, logErrorAndExitIfNotSatisfied } from '../../lib'
import path from 'path'
import { Argv } from 'yargs'

export const command = 'add <descriptor> <pathToBinary>'
export const desc = 'Add a mobile application binary to the binary store'

export const builder = (argv: Argv) => {
  return argv.epilog(epilog(exports))
}

export const handler = async ({
  descriptor,
  pathToBinary,
}: {
  descriptor: string
  pathToBinary: string
}) => {
  await logErrorAndExitIfNotSatisfied({
    cauldronIsActive: {
      extraErrorMessage:
        'A Cauldron must be active in order to use this command',
    },
    isCompleteNapDescriptorString: {
      descriptor,
    },
    napDescriptorExistInCauldron: {
      descriptor,
      extraErrorMessage:
        'Cannot add binary of a non existing native application version',
    },
  })

  const napDescriptor = NativeApplicationDescriptor.fromString(descriptor)

  const cauldron = await getActiveCauldron()
  const binaryStoreConfig = await cauldron.getBinaryStoreConfig()
  if (!binaryStoreConfig) {
    return log.error('No binaryStore configuration was found in Cauldron')
  }

  try {
    const binaryStore = new ErnBinaryStore(binaryStoreConfig)
    const absolutePathToBinary = path.resolve(pathToBinary)
    await binaryStore.addBinary(napDescriptor, absolutePathToBinary)
    log.info(
      `Binary was successfuly added to the store for ${napDescriptor.toString()}`
    )
  } catch (e) {
    log.error(
      `An error occurred while trying to add the binary of ${napDescriptor.toString()}`
    )
  }
}
