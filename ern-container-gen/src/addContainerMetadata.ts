import { Platform } from 'ern-core'
import { ContainerGeneratorConfig, ContainerMetadata } from './types'
import { writeFile } from './writeFile'
import { getContainerMetadataPath } from './getContainerMetadataPath'

export async function addContainerMetadata(conf: ContainerGeneratorConfig) {
  const metadata: ContainerMetadata = {
    ernVersion: Platform.currentVersion,
    jsApiImpls: conf.jsApiImpls.map(j => j.toString()),
    miniApps: conf.miniApps.map(m => m.packagePath.toString()),
    nativeDeps: conf.plugins.map(p => p.toString()),
    platform: conf.targetPlatform,
  }
  const pathToMetadataFile = getContainerMetadataPath(conf.outDir)
  return writeFile(pathToMetadataFile, JSON.stringify(metadata, null, 2))
}
