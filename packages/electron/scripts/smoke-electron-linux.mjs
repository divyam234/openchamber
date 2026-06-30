import { spawnSync } from 'node:child_process';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const assert = (condition, message) => {
  if (!condition) throw new Error(message);
};

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const electronRoot = path.resolve(scriptDir, '..');
const repoRoot = path.resolve(electronRoot, '..', '..');

const runSmoke = (scriptName) => {
  const result = spawnSync(process.execPath, [path.join(scriptDir, scriptName)], {
    cwd: repoRoot,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  if (result.status !== 0) {
    throw new Error([
      `${scriptName} failed with exit ${result.status}`,
      result.stdout.trim(),
      result.stderr.trim(),
    ].filter(Boolean).join('\n'));
  }
  return { scriptName, stdout: result.stdout.trim() };
};

const readJson = async (filePath) => JSON.parse(await fs.readFile(filePath, 'utf8'));

const assertElectronBuilderLinuxConfig = async () => {
  const packageJson = await readJson(path.join(electronRoot, 'package.json'));
  assert(packageJson.name === '@openchamber/electron', 'Electron package name should remain scoped');
  assert(packageJson.license === 'MIT', 'Electron package should carry MIT license metadata for Linux packages');
  assert(packageJson.homepage === 'https://github.com/openchamber/openchamber', 'Electron package should carry homepage metadata for deb packaging');

  const build = packageJson.build || {};
  assert(build.artifactName === '${productName}-${version}-${arch}.${ext}', 'artifactName should remain version/arch stable');
  assert(build.directories?.output === 'dist', 'Electron Builder output should remain packages/electron/dist');
  assert(Array.isArray(build.files) && build.files.includes('dist-bundle/main.mjs') && build.files.includes('preload.mjs'), 'packaged app should include bundled main and preload');
  assert(build.extraResources?.some((entry) => entry?.from === 'resources/web-dist' && entry?.to === 'web-dist'), 'packaged Linux app should stage web-dist as an extra resource');

  const linuxTargets = build.linux?.target || [];
  assert(Array.isArray(linuxTargets), 'build.linux.target should be an array');
  assert(linuxTargets.join('|') === 'AppImage|deb', `Linux targets should remain AppImage|deb, got ${linuxTargets.join('|')}`);
  assert(build.linux?.category === 'Development', 'Linux category should remain Development');
  assert(build.linux?.executableName === 'openchamber', 'Linux executableName should remain openchamber');
  assert(build.linux?.desktop?.entry?.Name === 'OpenChamber', 'Linux desktop entry Name should remain OpenChamber');
  assert(build.linux?.desktop?.entry?.StartupWMClass === 'OpenChamber', 'Linux StartupWMClass should remain OpenChamber');
  assert(build.linux?.desktop?.entry?.StartupNotify === 'true', 'Linux StartupNotify should remain true');

  assert(build.deb?.packageName === 'openchamber', 'deb packageName should remain openchamber');
  assert(build.deb?.packageCategory === 'devel', 'deb packageCategory should remain devel');
  assert(build.deb?.priority === 'optional', 'deb priority should remain optional');
};

const assertBundleConfig = async () => {
  const bundleScript = await fs.readFile(path.join(scriptDir, 'bundle-main.mjs'), 'utf8');
  for (const helper of ['path-open-utils.mjs', 'linux-app-discovery.mjs', 'electron-lifecycle-utils.mjs']) {
    assert(!bundleScript.includes(`'../${helper}'`) && !bundleScript.includes(`'./${helper}'`), `bundle config should not externalize ${helper}`);
    assert(!new RegExp(`external:[\\s\\S]*${helper.replace('.', '\\.')}`).test(bundleScript), `bundle external list should not include ${helper}`);
  }
};

const smokeResults = [
  runSmoke('smoke-path-open-utils.mjs'),
  runSmoke('smoke-linux-app-discovery.mjs'),
  runSmoke('smoke-electron-lifecycle-utils.mjs'),
];
await assertElectronBuilderLinuxConfig();
await assertBundleConfig();

console.log(JSON.stringify({
  ok: true,
  smokeScripts: smokeResults.map((result) => result.scriptName),
  packageChecks: ['electron-builder-linux', 'bundle-main-local-helpers'],
}, null, 2));
