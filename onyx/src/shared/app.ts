// Constants shared by the main process and the UI.

/** GitHub repository that publishes PTR AI releases (installers + latest.yml). Change it here only. */
export const GITHUB_REPO = 'solarynteam/ptr-ai'
export const REPO_URL = `https://github.com/${GITHUB_REPO}`
export const RELEASES_URL = `${REPO_URL}/releases`
export const LATEST_RELEASE_URL = `${REPO_URL}/releases/latest`
export const UPDATE_FEED_URL = `${REPO_URL}/releases/latest/download`

/**
 * Version of the Terms of Service. Bump it whenever src/renderer/src/lib/terms.ts changes in a
 * meaningful way: every user is then asked to accept the new terms before using the app again.
 */
export const TOS_VERSION = '1.0'
