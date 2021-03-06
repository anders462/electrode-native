import { yarn } from './clients'
import { PackagePath } from './PackagePath'
import gitCli from './gitCli'
import http from 'http'
import _ from 'lodash'
import { manifest } from './Manifest'
import * as ModuleType from './ModuleTypes'
import path from 'path'
import fs from 'fs'
import log from './log'
import config from './config'
import camelCase = require('lodash/camelCase')
import { packageCache } from './packageCache'

const gitDirectoryRe = /.*\/(.*).git/

export async function isPublishedToNpm(
  pkg: string | PackagePath
): Promise<boolean> {
  if (typeof pkg === 'string') {
    pkg = PackagePath.fromString(pkg)
  }

  let publishedVersionsInfo
  try {
    publishedVersionsInfo = await yarn.info(pkg, {
      field: 'versions',
      json: true,
    })
  } catch (e) {
    log.debug(e)
    return false
  }
  if (publishedVersionsInfo) {
    const publishedVersions: string[] = publishedVersionsInfo.data
    const type: string = publishedVersionsInfo.type
    if (type && type === 'inspect') {
      const pkgVersion = PackagePath.fromString(pkg.toString()).version
      if (publishedVersions && pkgVersion) {
        return publishedVersions.includes(pkgVersion)
      } else {
        return true
      }
    }
  }
  return false
}

export async function httpGet(url: string): Promise<any> {
  return new Promise((resolve, reject) => {
    http
      .get(url, res => {
        resolve(res)
      })
      .on('error', e => {
        reject(e)
      })
  })
}

/**
 * Camelize name (parameter, property, method, etc)
 *
 * @param word string to be camelize
 * @param lowercaseFirstLetter lower case for first letter if set to true
 * @return camelized string
 */
export function camelize(
  word: string,
  lowercaseFirstLetter: boolean = false
): string {
  word = camelCase(word)
  return (
    word &&
    word[0][lowercaseFirstLetter ? 'toLowerCase' : 'toUpperCase']() +
      word.substring(1)
  )
}

/**
 * Split the camel case string
 *
 * @param camelCaseString
 * @returns {string}
 */
export function splitCamelCaseString(camelCaseString: string): string[] {
  return camelCaseString.split(/(?=[A-Z])/).map(token => {
    return token.toLowerCase()
  })
}

export function getDefaultPackageNameForCamelCaseString(
  moduleName: string,
  moduleType?: string
): string {
  const splitArray = splitCamelCaseString(moduleName)
  switch (moduleType) {
    case ModuleType.MINIAPP:
      return _.filter(
        splitArray,
        token => !['mini', 'app'].includes(token)
      ).join('-')
    case ModuleType.API:
      return _.filter(splitArray, token => !['api'].includes(token)).join('-')
    case ModuleType.JS_API_IMPL:
    case ModuleType.NATIVE_API_IMPL:
      return _.filter(
        splitArray,
        token => !['api', 'impl'].includes(token)
      ).join('-')
    default:
      return splitArray.join('-')
  }
}

export function getDefaultPackageNameForModule(
  moduleName: string,
  moduleType: string
): string {
  const basePackageName = getDefaultPackageNameForCamelCaseString(
    moduleName,
    moduleType
  )
  switch (moduleType) {
    case ModuleType.MINIAPP:
      return basePackageName.concat('-miniapp')
    case ModuleType.API:
      return basePackageName.concat('-api')
    case ModuleType.JS_API_IMPL:
      return basePackageName.concat('-api-impl-js')
    case ModuleType.NATIVE_API_IMPL:
      return basePackageName.concat('-api-impl-native')
    default:
      throw new Error(`Unsupported module type : ${moduleType}`)
  }
}

export async function isDependencyApiOrApiImpl(
  dependencyName: string
): Promise<boolean> {
  const isApi = await isDependencyApi(dependencyName)
  const isApiImpl = !isApi ? await isDependencyApiImpl(dependencyName) : false
  // Note: using constants as using await in return statement was not satisfying standard checks
  return isApi || isApiImpl
}

export async function isDependencyApi(
  dependencyName: string
): Promise<boolean> {
  // for api generated using default name minimize the await time
  if (/^.*react-native-.+-api$/.test(dependencyName)) {
    return true
  }
  let result
  try {
    const depInfo = await yarn.info(PackagePath.fromString(dependencyName), {
      field: 'ern 2> /dev/null',
      json: true,
    })
    result =
      depInfo && depInfo.type === 'error'
        ? false
        : depInfo.data && ModuleType.API === depInfo.data.moduleType
  } catch (e) {
    log.debug(e)
    return false
  }
  return result
}

/**
 *
 * @param dependencyName: Name of the dependency
 * @param forceYanInfo: if true, a yarn info command will be executed to determine the api implementation
 * @param type: checks to see if a dependency is of a specific type(js|native) as well
 * @returns {Promise.<boolean>}
 */
export async function isDependencyApiImpl(
  dependencyName: string | PackagePath,
  forceYanInfo?: boolean,
  type?: string
): Promise<boolean> {
  if (dependencyName instanceof PackagePath) {
    dependencyName = dependencyName.toString()
  }
  // for api-impl generated using default name minimize the await time
  if (
    !type &&
    !forceYanInfo &&
    /^.*react-native-.+-api-impl$/.test(dependencyName)
  ) {
    return true
  }

  const modulesTypes = type
    ? [type]
    : [ModuleType.NATIVE_API_IMPL, ModuleType.JS_API_IMPL]
  let result
  try {
    const depInfo = await yarn.info(PackagePath.fromString(dependencyName), {
      field: 'ern 2> /dev/null',
      json: true,
    })
    result =
      depInfo && depInfo.type === 'error'
        ? false
        : depInfo.data && modulesTypes.indexOf(depInfo.data.moduleType) > -1
  } catch (e) {
    log.debug(e)
    return false
  }

  return result
}

export async function isDependencyJsApiImpl(
  dependency: string | PackagePath
): Promise<boolean> {
  return isDependencyApiImpl(dependency, true, ModuleType.JS_API_IMPL)
}

export async function isDependencyNativeApiImpl(
  dependency: string | PackagePath
): Promise<boolean> {
  return isDependencyApiImpl(dependency, true, ModuleType.NATIVE_API_IMPL)
}

/**
 * Version of react-native dependency in manifest
 */
export async function reactNativeManifestVersion() {
  const reactNativebasePathDependency = PackagePath.fromString('react-native')
  const reactNativeDependency = await manifest.getNativeDependency(
    reactNativebasePathDependency
  )

  if (!reactNativeDependency) {
    throw new Error('Could not retrieve react native dependency from manifest')
  }

  return reactNativeDependency.version
}

export function isValidElectrodeNativeModuleName(name: string): boolean {
  return /^[a-zA-Z]+$/.test(name)
}
/**
 * Download the plugin source given a plugin origin if not already downloaded
 * pluginOrigin: A plugin origin object
 * Sample plugin origin objects :
 * {
 *  "type": "git",
 *  "url": "https://github.com/aoriani/ReactNative-StackTracer.git",
 *  "version": "0.1.1"
 * }
 *
 * {
 *  "type": "npm",
 *  "name": "react-native-code-push",
 *  "version": "1.16.1-beta"
 * }
 *
 * Note: The plugin will be downloaded locally to the current directory
 * For npm origin it will be put in node_modules directory
 * For git origin it will be put directly at the root in a directory named after
 * the git repo as one would expect
 *
 * Returns:
 * @param pluginOrigin
 * @returns {Promise.<T>} Absolute path to where the plugin was installed
 */
export async function downloadPluginSource(pluginOrigin: any): Promise<string> {
  const downloadPath = getDownloadedPluginPath(pluginOrigin)
  let absolutePluginOutPath = path.join(process.cwd(), downloadPath)

  if (!fs.existsSync(absolutePluginOutPath)) {
    if (pluginOrigin.type === 'npm') {
      const dependency = packagePathFrom(pluginOrigin.name, {
        scope: pluginOrigin.scope,
        version: pluginOrigin.version,
      })
      const p = PackagePath.fromString(dependency.toString())
      if (config.getValue('package-cache-enabled', true)) {
        if (!(await packageCache.isInCache(p))) {
          absolutePluginOutPath = await packageCache.addToCache(p)
        } else {
          absolutePluginOutPath = (await packageCache.getObjectCachePath(
            p
          )) as string
        }
      } else {
        await yarn.add(PackagePath.fromString(dependency.toString()))
      }
    } else if (pluginOrigin.type === 'git') {
      if (pluginOrigin.version) {
        await gitCli().cloneAsync(pluginOrigin.url, {
          '--branch': pluginOrigin.version,
        })
      }
    } else {
      throw new Error(`Unsupported plugin origin type : ${pluginOrigin.type}`)
    }
  } else {
    log.debug(`Plugin already downloaded to ${absolutePluginOutPath}`)
  }

  return Promise.resolve(absolutePluginOutPath)
}

function packagePathFrom(
  name,
  {
    scope,
    version,
  }: {
    scope?: string
    version?: string
  } = {}
): PackagePath {
  return PackagePath.fromString(
    `${scope ? `@${scope}/` : ''}${name}${version ? `@${version}` : ''}`
  )
}

/**
 * Sample plugin origin objects :
 * {
 *  "type": "git",
 *  "url": "https://github.com/aoriani/ReactNative-StackTracer.git",
 *  "version": "0.1.1"
 * }
 *
 * {
 *  "type": "npm",
 *  "name": "react-native-code-push",
 *  "version": "1.16.1-beta"
 * }
 * @param pluginOrigin
 */
export function getDownloadedPluginPath(pluginOrigin: any) {
  let downloadPath
  if (pluginOrigin.type === 'npm') {
    if (pluginOrigin.scope) {
      downloadPath = path.join(
        'node_modules',
        `@${pluginOrigin.scope}`,
        pluginOrigin.name
      )
    } else {
      downloadPath = path.join('node_modules', pluginOrigin.name)
    }
  } else if (pluginOrigin.type === 'git') {
    if (pluginOrigin.version && gitDirectoryRe.test(pluginOrigin.url)) {
      downloadPath = gitDirectoryRe.exec(pluginOrigin.url)![1]
    }
  }

  if (!downloadPath) {
    throw new Error(`Unsupported plugin origin type : ${pluginOrigin.type}`)
  }
  return downloadPath
}

/**
 * Extracts all the js api implementation dependencies from the plugin array.
 * @param plugins
 * @returns {Promise.<Array.<Dependency>>}
 */
export async function extractJsApiImplementations(plugins: PackagePath[]) {
  const jsApiImplDependencies: PackagePath[] = []
  for (const dependency of plugins) {
    if (await isDependencyJsApiImpl(dependency)) {
      jsApiImplDependencies.push(dependency)
    }
  }
  return jsApiImplDependencies
}

export function logErrorAndExitProcess(e: Error, code: number = 1) {
  log.error(`An error occurred: ${e.message}`)
  log.debug(e.stack!)
  process.exit(code)
}
