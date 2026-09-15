const packageJson = require('./package.json')

module.exports = {
  ...packageJson.build,
  appId: 'com.casleo.desktop.dev',
  productName: 'Casleo Dev',
  directories: {
    ...packageJson.build.directories,
    output: 'dist-dev'
  },
  extraMetadata: {
    name: 'casleo-dev',
    productName: 'Casleo Dev',
    dshDesktopChannel: 'development'
  },
  artifactName: 'casleo-dev-${os}-${arch}.${ext}',
  nsis: {
    ...packageJson.build.nsis,
    artifactName: 'casleo-dev-windows-${arch}-setup.${ext}'
  },
  publish: null
}
