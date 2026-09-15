const publicApiBaseUrl = process.env.EXPO_PUBLIC_API_BASE_URL?.replace(/\/$/, "");

function serviceUrl(overrideName, publicPath, localPort) {
  return (
    process.env[overrideName] ??
    (publicApiBaseUrl
      ? `${publicApiBaseUrl}${publicPath}`
      : `http://localhost:${localPort}`)
  );
}

module.exports = ({ config }) => ({
  ...config,
  extra: {
    ...config.extra,
    identityUrl: serviceUrl("EXPO_PUBLIC_IDENTITY_URL", "/api/identity", 3001),
    patientUrl: serviceUrl("EXPO_PUBLIC_PATIENT_URL", "/api/patients", 3002),
    schedulingUrl: serviceUrl("EXPO_PUBLIC_SCHEDULING_URL", "/api/scheduling", 3003),
  },
});
