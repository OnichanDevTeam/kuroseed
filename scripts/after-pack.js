const path = require('path');

exports.default = async function (context) {
  if (context.electronPlatformName !== 'win32') return;

  const { rcedit } = await import('rcedit');

  const exePath = path.join(
    context.appOutDir,
    `${context.packager.appInfo.productFilename}.exe`
  );

  await rcedit(exePath, {
    icon: path.join(__dirname, '..', 'build', 'icon.ico'),
    'version-string': {
      ProductName: 'KuroSeed',
      FileDescription: 'KuroSeed - Anime Auto-Downloader',
      CompanyName: 'KuroSeed',
      LegalCopyright: 'Copyright © 2024',
      OriginalFilename: 'KuroSeed.exe',
    },
    'product-version': context.packager.appInfo.version,
    'file-version': context.packager.appInfo.version,
  });

  console.log('  ✓ rcedit: icon and metadata applied to exe');
};
