const { execSync } = require("child_process");
const fs = require("fs");
const path = require("path");

const APP = path.join(__dirname, "../node_modules/electron/dist/Electron.app");
const PLIST = path.join(APP, "Contents/Info.plist");
const LPROJ = path.join(APP, "Contents/Resources/en.lproj");

if (!fs.existsSync(PLIST)) {
  console.log("Electron.app not found, skipping patch");
  process.exit(0);
}

// Patch Info.plist
try {
  execSync(`/usr/libexec/PlistBuddy -c "Set :CFBundleDisplayName WorkOS" "${PLIST}"`);
} catch {
  execSync(`/usr/libexec/PlistBuddy -c "Add :CFBundleDisplayName string WorkOS" "${PLIST}"`);
}
try {
  execSync(`/usr/libexec/PlistBuddy -c "Set :CFBundleName WorkOS" "${PLIST}"`);
} catch {}

// Create localized InfoPlist.strings for dock name
fs.mkdirSync(LPROJ, { recursive: true });
fs.writeFileSync(
  path.join(LPROJ, "InfoPlist.strings"),
  'CFBundleDisplayName = "WorkOS";\nCFBundleName = "WorkOS";\n'
);

console.log("Patched Electron.app → WorkOS");
