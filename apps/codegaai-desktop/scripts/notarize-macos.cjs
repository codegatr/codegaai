const { notarize } = require("@electron/notarize");

module.exports = async function notarizeMacApp(context) {
  if (process.platform !== "darwin") return;

  const appleId = process.env.APPLE_ID;
  const appleIdPassword = process.env.APPLE_APP_SPECIFIC_PASSWORD;
  const teamId = process.env.APPLE_TEAM_ID;
  const missing = [
    ["APPLE_ID", appleId],
    ["APPLE_APP_SPECIFIC_PASSWORD", appleIdPassword],
    ["APPLE_TEAM_ID", teamId],
  ]
    .filter(([, value]) => !value)
    .map(([name]) => name);

  if (missing.length) {
    throw new Error(`macOS notarization credentials are missing: ${missing.join(", ")}`);
  }

  const appPath = `${context.appOutDir}/${context.packager.appInfo.productFilename}.app`;
  console.log(`Notarizing ${appPath}`);
  await notarize({
    appPath,
    appleId,
    appleIdPassword,
    teamId,
  });
};
