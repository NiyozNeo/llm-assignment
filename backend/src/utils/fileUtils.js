const fs = require('fs');
const path = require('path');
const logger = require('../logger');

function ensureFileHasExt(file) {
  if (!file) return null;
  const orig = file.originalname || '';
  let ext = path.extname(orig).toLowerCase();

  logger.debug('ensureFileHasExt called', { originalname: orig, mimetype: file.mimetype, currentPath: file.path, size: file.size });

  if (!ext) {
    const mimeMap = {
      'audio/webm': '.webm',
      'audio/wav': '.wav',
      'audio/x-wav': '.wav',
      'audio/mpeg': '.mp3',
      'audio/mp3': '.mp3',
      'audio/ogg': '.ogg',
      'audio/opus': '.ogg',
      'audio/mp4': '.mp4',
      'audio/aac': '.m4a',
      'audio/x-m4a': '.m4a'
    };
    ext = mimeMap[file.mimetype] || '';
    logger.debug('Inferred extension', { inferredExt: ext, fromMimetype: file.mimetype });
  }

  if (!ext) {
    logger.warn('Could not determine file extension for upload; leaving as-is', { originalname: orig, mimetype: file.mimetype });
    return file.path;
  }

  const newPath = file.path + ext;
  try {
    if (!fs.existsSync(newPath)) {
      fs.renameSync(file.path, newPath);
      logger.info('Renamed upload to include extension', { oldPath: file.path, newPath, ext });
    } else {
      logger.debug('Target path already exists, skipping rename', { newPath });
    }
  } catch (err) {
    logger.error('Failed to rename uploaded file to include extension', { err: err?.message, stack: err?.stack });
    return file.path;
  }
  return newPath;
}

  // Delete files older than a given age (in ms) from a directory
  function deleteOldFiles(dir, maxAgeMs) {
    const now = Date.now();
    fs.readdir(dir, (err, files) => {
      if (err) return;
      files.forEach(file => {
        const filePath = path.join(dir, file);
        fs.stat(filePath, (err, stats) => {
          if (err) return;
          if (now - stats.mtimeMs > maxAgeMs) {
            fs.unlink(filePath, () => {});
          }
        });
      });
    });
  }

module.exports = { ensureFileHasExt, deleteOldFiles };
