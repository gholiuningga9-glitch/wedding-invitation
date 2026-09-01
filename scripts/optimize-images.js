const fs = require('fs');
const path = require('path');
const sharp = require('sharp');

const dir = path.join(process.cwd(), 'assets', 'images');
const extensions = new Set(['.jpg', '.jpeg', '.png', '.webp']);

const files = fs.readdirSync(dir)
  .filter((file) => extensions.has(path.extname(file).toLowerCase()))
  .sort();

(async () => {
  for (const file of files) {
    const fullPath = path.join(dir, file);
    const before = fs.statSync(fullPath).size;
    const ext = path.extname(file).toLowerCase();

    try {
      const image = sharp(fullPath);
      const meta = await image.metadata();
      const width = meta.width || 0;
      const height = meta.height || 0;
      const targetWidth = width > 1600 ? 1600 : width;
      const targetHeight = height > 1600 ? Math.round((height / width) * targetWidth) : height;

      const output = sharp(fullPath)
        .resize({
          width: targetWidth,
          height: targetHeight,
          fit: 'inside',
          withoutEnlargement: true,
        });

      const tempPath = `${fullPath}.tmp`;

      if (ext === '.jpg' || ext === '.jpeg') {
        await output.jpeg({ quality: 78, mozjpeg: true }).toFile(tempPath);
      } else if (ext === '.png') {
        await output.png({ quality: 80, compressionLevel: 9, effort: 10 }).toFile(tempPath);
      } else if (ext === '.webp') {
        await output.webp({ quality: 80, effort: 6 }).toFile(tempPath);
      }

      fs.renameSync(tempPath, fullPath);
      const after = fs.statSync(fullPath).size;
      const saved = before - after;
      console.log(`${file}: ${before} -> ${after} bytes (${saved > 0 ? '-' : '+'}${Math.abs(saved)} bytes) | ${width}x${height}`);
    } catch (error) {
      console.error(`ERROR ${file}: ${error.message}`);
    }
  }
})();
