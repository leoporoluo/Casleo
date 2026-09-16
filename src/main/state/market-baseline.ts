import { lstat, readFile, readlink, rm, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { healProfilesModuleFallback } from '@deepseek-ai/dsh-app-boot'
import { listGenerations, readDesired, writeDesired } from 'dsh-desktop-market-installer/generations/registry'
import { compareSemver, parseSemver, readInstalledPluginVersion } from './plugin-market-check'
import { profilePackageJsonPath } from './plugin-recovery'
import { clearProfileInstallMarker } from './profile-install-marker'
import { upgradeMarketInSharedTree, type MarketSharedTreeUpgradeOptions } from './plugin-upgrade'

/**
 * The spec a missing or broken market is installed with. `latest` lets the
 * registry resolve the newest published dsh-market, so a fresh install never
 * starts on the build the app happened to ship with; an already-installed
 * market is left at whatever version the user is on.
 */
export const MARKET_INSTALL_SPEC = 'latest'

const MARKET_PACKAGE = 'dshmarket'

interface MarketManifest {
  dependencies?: Record<string, string>
  dsh?: {
    desktop?: {
      generationProjection?: {
        plugins?: Record<string, { visibleVersion?: string; previousOverride?: { present?: boolean; value?: string } }>
      }
    }
    profile?: { bundles?: string[] }
  }
  pnpm?: { overrides?: Record<string, string> }
}

/** Drop a range prefix (`^1.2.3` → `1.2.3`); undefined when nothing is left. */
function stripRangePrefix(version: string | undefined): string | undefined {
  const clean = version?.replace(/^[~^v=><\s]+/g, '')
  return clean ? clean : undefined
}

/**
 * Whether a version already on disk or declared in the manifest is at or above
 * the version a repair installs.
 *
 * `MARKET_INSTALL_SPEC` is the floating `latest` tag rather than a pinned
 * version, and it names no floor a local build could fall short of: whatever
 * the registry serves is at least as new as anything installed. Any readable
 * version therefore meets it. A pinned spec compares numerically — the shape
 * upstream ships, where a build below the verified baseline is replaced.
 */
function meetsMarketTarget(version: string | undefined): boolean {
  const clean = stripRangePrefix(version)
  if (!clean || !parseSemver(clean)) return false
  const target = stripRangePrefix(MARKET_INSTALL_SPEC)
  if (!target || !parseSemver(target)) return true
  return compareSemver(clean, target) >= 0
}

/**
 * The version a repair installs. Upstream keeps a declaration that exceeds the
 * pinned baseline and falls back to the baseline otherwise.
 *
 * Casleo's spec is the floating `latest` tag (see `MARKET_INSTALL_SPEC`), which
 * always resolves to the newest published build and so can never pull a profile
 * below what it already declares; it therefore stays the target, and a
 * declaration only wins where the spec is pinned and the declaration exceeds
 * it. The cleaned exact version is returned, because the caller verifies the
 * installed version by equality.
 */
function resolveMarketTargetVersion(declaredVersion: string | undefined): string {
  const declared = stripRangePrefix(declaredVersion)
  const pinned = stripRangePrefix(MARKET_INSTALL_SPEC)
  if (
    declared !== undefined && !!parseSemver(declared) &&
    pinned !== undefined && !!parseSemver(pinned) &&
    compareSemver(declared, pinned) > 0
  ) {
    return declared
  }
  return MARKET_INSTALL_SPEC
}

/**
 * Undo any projection of dshmarket as a generation — before generation
 * projection runs.
 *
 * dshmarket is a core bundle that must always be a real directory in the
 * shared tree (`KEEP_IN_SHARED_TREE` in generation-migration.ts). A stray
 * `desired.json` entry for it is otherwise re-linked by `projectGenerations`
 * on *every* launch, which is why an incompatible build kept coming back
 * after each repair: the repair ran after projection had already recreated
 * the link, or never ran at all because an unrelated pending plugin removal
 * had deferred maintenance.
 *
 * This only rewrites declarations and drops the link; the shared-tree install
 * that follows is `ensureMarketBaseline`'s job. Harness must be stopped.
 * @returns whether anything had to be undone.
 */
export async function demoteMarketGeneration(
  dshHome: string,
  note?: (line: string) => void
): Promise<boolean> {
  const manifestPath = profilePackageJsonPath(dshHome)
  let raw: string
  try {
    raw = await readFile(manifestPath, 'utf8')
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return false
    throw error
  }
  const manifest = JSON.parse(raw) as MarketManifest
  const marketPath = join(dirname(manifestPath), 'node_modules', MARKET_PACKAGE)

  const owned = manifest.dsh?.desktop?.generationProjection?.plugins?.[MARKET_PACKAGE]
  const linked = await lstat(marketPath)
    .then(async (info) => {
      if (!info.isSymbolicLink()) return false
      const target = await readlink(marketPath)
      return target.includes('.generations')
    })
    .catch(() => false)
  const [desired, generations] = await Promise.all([readDesired(dshHome), listGenerations(dshHome)])
  const marketGenerations = new Set(
    generations.filter((generation) => generation.pluginName === MARKET_PACKAGE).map((generation) => generation.id)
  )
  const desiredMarket = desired.filter((id) => marketGenerations.has(id))
  if (owned === undefined && !linked && desiredMarket.length === 0) return false

  note?.(`[market-baseline] dshmarket is projected as a generation; restoring it to the shared tree`)

  // Keep the declaration: dropping it would read as "the market was
  // uninstalled" and every later repair would decline to reinstall it. An
  // already-installed market is never dragged back to a baseline, so the
  // version on disk or in the manifest is kept ahead of the install spec —
  // which, being `latest`, still resolves upward on the next repair.
  let actualInstalledVersion: string | undefined
  try {
    actualInstalledVersion = await readInstalledPluginVersion(dshHome, MARKET_PACKAGE)
  } catch {
    // Missing or unreadable: the fallbacks below decide.
  }
  const generationVersion = generations.find((generation) => generation.pluginName === MARKET_PACKAGE)?.version
  const candidateVersion =
    owned?.visibleVersion ??
    (meetsMarketTarget(actualInstalledVersion) ? actualInstalledVersion : undefined) ??
    (meetsMarketTarget(manifest.dependencies?.[MARKET_PACKAGE]) ? manifest.dependencies?.[MARKET_PACKAGE] : undefined) ??
    (meetsMarketTarget(generationVersion) ? generationVersion : undefined) ??
    MARKET_INSTALL_SPEC

  manifest.dependencies ??= {}
  manifest.dependencies[MARKET_PACKAGE] = candidateVersion
  if (owned !== undefined) {
    delete manifest.dsh!.desktop!.generationProjection!.plugins![MARKET_PACKAGE]
    if (Object.keys(manifest.dsh!.desktop!.generationProjection!.plugins!).length === 0) {
      delete manifest.dsh!.desktop!.generationProjection
    }
    if (owned.previousOverride?.present && typeof owned.previousOverride.value === 'string') {
      manifest.pnpm ??= {}
      manifest.pnpm.overrides ??= {}
      manifest.pnpm.overrides[MARKET_PACKAGE] = owned.previousOverride.value
    } else if (manifest.pnpm?.overrides) {
      delete manifest.pnpm.overrides[MARKET_PACKAGE]
    }
  } else if (manifest.pnpm?.overrides?.[MARKET_PACKAGE]?.includes('.generations/live/')) {
    delete manifest.pnpm.overrides[MARKET_PACKAGE]
  }
  const bundles = manifest.dsh?.profile?.bundles
  if (Array.isArray(bundles) && !bundles.includes(MARKET_PACKAGE)) bundles.push(MARKET_PACKAGE)
  await writeFile(manifestPath, `${JSON.stringify(manifest, undefined, 2)}\n`, 'utf8')

  if (desiredMarket.length > 0) {
    await writeDesired(dshHome, desired.filter((id) => !marketGenerations.has(id)))
  }
  if (linked) {
    // Only the pointer goes: the generation directory it targets is left for
    // the ordinary sweep, and nothing that already loaded it is disturbed.
    await rm(marketPath, { force: true })
  }
  // No need to clear `.install-complete`: it is a fingerprint over
  // package.json and pnpm-lock.yaml, and the manifest write above already
  // invalidated it.
  return true
}

/** Run only after startup recovery gates and generation projection, with Harness stopped. */
export async function ensureMarketBaseline(
  options: Omit<MarketSharedTreeUpgradeOptions, 'targetVersion'>,
  upgrade: (options: MarketSharedTreeUpgradeOptions) => ReturnType<typeof upgradeMarketInSharedTree> = upgradeMarketInSharedTree
): Promise<void> {
  let raw: string
  try {
    raw = await readFile(profilePackageJsonPath(options.dshHome), 'utf8')
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return
    throw error
  }
  const manifest = JSON.parse(raw) as {
    dependencies?: Record<string, string>
    dsh?: { profile?: { bundles?: string[] } }
  }
  // A removed/disabled market stays removed. First-install UI owns adding it.
  if (!manifest.dependencies?.dshmarket || !manifest.dsh?.profile?.bundles?.includes('dshmarket')) return

  // Any parseable installed version counts as healthy: the market updates
  // itself, so the desktop only repairs what is missing or unreadable.
  const isInstalled = (version: string | undefined): boolean =>
    !!version && !!parseSemver(version)
  const installed = await readInstalledPluginVersion(options.dshHome, 'dshmarket')
  // dshmarket must never be a generation (it is a core bundle the migration
  // keeps hoisted — see KEEP_IN_SHARED_TREE in generation-migration.ts). A
  // generation link (pointing to .generations/live/…) forces a repair even
  // when its version reads as current, so a stray generation from an earlier
  // build cannot linger. A pnpm isolated-store symlink (pointing to .pnpm/…)
  // is left alone: it is pnpm's normal representation in non-hoisted profiles.
  const dshmarketPath = join(dirname(profilePackageJsonPath(options.dshHome)), 'node_modules', 'dshmarket')
  const isGenerationLink = await lstat(dshmarketPath)
    .then(async (info) => {
      if (!info.isSymbolicLink()) return false
      const target = await readlink(dshmarketPath)
      return target.includes('.generations')
    })
    .catch(() => false)
  if (isInstalled(installed) && !isGenerationLink) return

  // A declaration newer than the install spec is what pnpm is asked for; with
  // the floating `latest` spec the declaration cannot beat it, so the repair
  // still resolves the newest published market.
  const targetVersion = resolveMarketTargetVersion(manifest.dependencies?.dshmarket)
  options.note?.(
    isGenerationLink
      ? `[market-baseline] dshmarket ${installed ?? '(unknown)'} is a generation link; reinstalling into the shared tree`
      : `[market-baseline] installing dshmarket ${installed ?? '(missing)'} from ${targetVersion}`
  )
  // pnpm only treats the profile as a workspace root when this manifest is
  // present, and the install below asks for exactly that.
  const workspaceYamlPath = join(dirname(profilePackageJsonPath(options.dshHome)), 'pnpm-workspace.yaml')
  try {
    await readFile(workspaceYamlPath, 'utf8')
  } catch {
    await writeFile(workspaceYamlPath, 'packages:\n  - .\n\nnodeLinker: hoisted\nautoInstallPeers: false\n', 'utf8')
  }
  // This normally happens inside Harness boot, which has not run yet. Ensure
  // generation peer validation sees this installation's host packages first.
  await healProfilesModuleFallback({
    installAnchor: join(dirname(options.dshEntryPath), '..', 'package.json'),
    home: options.dshHome
  })
  await clearProfileInstallMarker(options.dshHome)
  const result = await upgrade({ ...options, targetVersion })
  if (!result.ok) throw new Error(result.detail ?? 'dshmarket installation failed')

  const actual = await readInstalledPluginVersion(options.dshHome, 'dshmarket')
  if (!isInstalled(actual)) {
    throw new Error(`dshmarket installation reported success, but the active version is ${actual ?? 'missing'}; expected a readable version`)
  }
  options.note?.(`[market-baseline] verified active dshmarket ${actual}`)
}
