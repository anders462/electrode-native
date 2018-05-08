import { ContainerPublisher, ContainerPublisherConfig } from '../FlowTypes'
import { createTmpDir, gitCli, shell, log } from 'ern-core'
import path from 'path'

export default class GithubPublisher implements ContainerPublisher {
  get name(): string {
    return 'github'
  }

  public async publish(config: ContainerPublisherConfig) {
    const workingGitDir = createTmpDir()

    try {
      shell.pushd(workingGitDir)
      const git = gitCli()
      log.debug(`Cloning git repository(${config.url}) to ${workingGitDir}`)
      await gitCli().cloneAsync(config.url, '.')
      shell.rm('-rf', `${workingGitDir}/*`)
      shell.cp('-Rf', path.join(config.containerPath, '{.*,*}'), workingGitDir)
      await git.addAsync('./*')
      await git.commitAsync(`Container v${config.containerVersion}`)
      await git.tagAsync([`v${config.containerVersion}`])
      await git.pushAsync('origin', 'master')
      await git.pushTagsAsync('origin')
    } finally {
      shell.popd()
    }
  }
}