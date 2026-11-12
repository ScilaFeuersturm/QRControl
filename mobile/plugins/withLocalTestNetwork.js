const { withAndroidManifest } = require('expo/config-plugins');
// Solo el perfil de ensayo admite el servidor HTTP de la red local.
module.exports = function withLocalTestNetwork(config) {
  return withAndroidManifest(config, (value) => {
    const application = value.modResults.manifest.application?.[0];
    if (application) {
      application.$['android:usesCleartextTraffic'] = process.env.ZENIT_ALLOW_LOCAL_HTTP === '1' ? 'true' : 'false';
    }
    return value;
  });
};
