const express = require("express");
const cors = require("cors");
const app = express();
const port = 3000;
const multer =  require('multer');
const fs = require("fs");
const path = require("path");

const OpenAI = require("openai");

const uploadDir = path.join(process.cwd(), 'uploads');
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}
const upload = multer({ dest: uploadDir });

// helper: ensure the saved multer file has a proper extension (rename if needed)
function ensureFileHasExt(file) {
  if (!file) return null;
  const orig = file.originalname || '';
  let ext = path.extname(orig).toLowerCase();

  log('DEBUG', 'ensureFileHasExt called', { originalname: orig, mimetype: file.mimetype, currentPath: file.path, size: file.size });

  // if original name had no ext, try to infer from mimetype
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
    log('DEBUG', 'Inferred extension', { inferredExt: ext, fromMimetype: file.mimetype });
  }

  if (!ext) {
    log('WARN', 'Could not determine file extension for upload; leaving as-is', { originalname: orig, mimetype: file.mimetype });
    // give up and return original path (OpenAI will likely reject unsupported formats)
    return file.path;
  }

  const newPath = file.path + ext;
  try {
    if (!fs.existsSync(newPath)) {
      fs.renameSync(file.path, newPath);
      log('INFO', 'Renamed upload to include extension', { oldPath: file.path, newPath, ext });
    } else {
      log('DEBUG', 'Target path already exists, skipping rename', { newPath });
    }
  } catch (err) {
    log('ERROR', 'Failed to rename uploaded file to include extension', { err: err?.message, stack: err?.stack });
    return file.path;
  }
  return newPath;
}

// Enable CORS for all routes
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

require("dotenv").config();
const openai = new OpenAI({
  apiKey: process.env.OPEN_AI_KEY,
});

// lightweight logger (writes to console and to logs/server.log)
const LOG_TO_FILE = true;
const logsDir = path.join(__dirname, '..', 'logs');
try {
  if (!fs.existsSync(logsDir)) fs.mkdirSync(logsDir, { recursive: true });
} catch (e) {
  console.error('Failed to create logs directory', e);
}
const logFile = path.join(logsDir, 'server.log');
function log(level, message, meta) {
  const timestamp = new Date().toISOString();
  const metaStr = meta ? ' ' + JSON.stringify(meta) : '';
  const line = `${timestamp} [${level}] ${message}${metaStr}`;
  // always print to console
  if (level === 'ERROR') console.error(line);
  else console.log(line);
  // append to file (best-effort, non-blocking)
  if (LOG_TO_FILE) {
    try {
      fs.appendFile(logFile, line + '\n', (err) => {
        if (err) console.error('Failed to write to log file', err);
      });
    } catch (e) {
      console.error('Failed to append log', e);
    }
  }
}

// request logging middleware (sanitized)
app.use((req, res, next) => {
  const safeHeaders = { ...req.headers };
  if (safeHeaders.authorization) safeHeaders.authorization = '[REDACTED]';
  log('INFO', `HTTP ${req.method} ${req.url}`, { ip: req.ip || req.connection?.remoteAddress, query: req.query, headers: { host: safeHeaders.host } });
  next();
});

app.post('/api/stt', upload.single('audio'), async (req, res) => {
  if (!req.file) {
    log('WARN', '/api/stt called without file');
    return res.status(400).json({ error: 'audio file required (field: audio)' });
  }
  const filePath = ensureFileHasExt(req.file);
  log('INFO', 'Processing /api/stt', { originalname: req.file.originalname, mimetype: req.file.mimetype, filePath });
  // DEBUG: save raw uploaded file so we can play exactly what the frontend sent
  try {
    const debugExt = path.extname(filePath) || '.webm';
    const debugName = `upload-debug-${Date.now()}${debugExt}`;
    const debugPath = path.join(logsDir, debugName);
    fs.copyFileSync(filePath, debugPath);
    log('DEBUG', 'Saved debug copy of uploaded audio (stt)', { debugPath });
  } catch (e) {
    log('WARN', 'Failed to save debug copy of uploaded audio (stt)', { err: e?.message });
  }
  try {
    const stats = fs.statSync(filePath);
    log('DEBUG', 'File stats before STT', { size: stats.size });
  } catch (e) {
    log('WARN', 'Failed to stat file before STT', { filePath, err: e?.message });
  }
  try {
    log('INFO', 'Calling OpenAI transcription (whisper-1)');
    const transcription = await openai.audio.transcriptions.create({
      model: 'whisper-1',
      file: fs.createReadStream(filePath),
      language: 'en' // source language
    });
    log('INFO', 'OpenAI transcription successful', { textSnippet: (transcription.text || '').slice(0, 200) });
    // cleanup temp
    fs.unlink(filePath, (err) => {
      if (err) log('WARN', 'Failed to unlink temp file', { filePath, err: err?.message });
      else log('DEBUG', 'Temp file deleted', { filePath });
    });
    res.json({ text: (transcription.text || '').trim() });
  } catch (err) {
    log('ERROR', 'STT failed', { message: err?.message, stack: err?.stack });
    // cleanup on error
    fs.unlink(filePath || req.file.path, () => {});
    res.status(500).json({ error: 'STT failed' });
  }
});

/**
 * POST /api/translate
 * JSON: { text: "English text" }
 * Returns: { text: "Spanish text" }
 *
 * Uses GPT-4o-mini with a strict system prompt to avoid extra words.
 */
app.post('/api/translate', async (req, res) => {
  const input = (req.body?.text || '').toString();
  if (!input) return res.status(400).json({ error: 'text required' });
  try {
    const completion = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      temperature: 0,
      messages: [
        {
          role: 'system',
          content:
            'You are a translation engine. Translate any text from English to Spanish and ONLY return the Spanish translation with no extra words.'
        },
        { role: 'user', content: input }
      ]
    });
    const out = completion.choices?.[0]?.message?.content?.trim() || '';
    res.json({ text: out });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Translation failed' });
  }
});

/**
 * POST /api/tts
 * JSON: { text: "Spanish text", voice?: "alloy", format?: "mp3" }
 * Returns: audio bytes with Content-Type set (default mp3)
 *
 * Uses GPT-4o-mini-tts to synthesize Spanish speech.
 */
app.post('/api/tts', async (req, res) => {
  const text = (req.body?.text || '').toString();
  if (!text) return res.status(400).json({ error: 'text required' });
  const voice = (req.body?.voice || 'alloy').toString();
  const format = (req.body?.format || 'mp3').toString(); // mp3 | wav | opus?
  try {
    const speech = await openai.audio.speech.create({
      model: 'gpt-4o-mini-tts',
      voice,
      input: text,
      format
    });

    const arrayBuffer = await speech.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    // DEBUG: save TTS output to logs for inspection
    try {
      const ext = format || 'mp3';
      const debugTtsPath = path.join(logsDir, `tts-${Date.now()}.${ext}`);
      fs.writeFileSync(debugTtsPath, buffer);
      log('DEBUG', 'Saved debug TTS file', { debugTtsPath, size: buffer.length, headHex: buffer.slice(0, 8).toString('hex') });
    } catch (e) {
      log('WARN', 'Failed to save debug TTS file', { err: e?.message });
    }

    const mime =
      format === 'wav' ? 'audio/wav' :
      format === 'opus' ? 'audio/ogg' :
      'audio/mpeg';

    res.setHeader('Content-Type', mime);
    res.setHeader('Content-Length', buffer.length);
    // inline playback
    res.setHeader('Content-Disposition', `inline; filename="speech.${format}"`);
    res.send(buffer);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'TTS failed' });
  }
});

/**
 * POST /api/pipe
 * multipart/form-data with field "audio"
 * Runs: STT (Whisper) -> Translate (GPT) -> TTS (Spanish)
 * Returns JSON with text + base64 audio to keep the demo simple.
 */
app.post('/api/pipe', upload.single('audio'), async (req, res) => {
  if (!req.file) {
    log('WARN', '/api/pipe called without file');
    return res.status(400).json({ error: 'audio file required (field: audio)' });
  }
  const filePath = ensureFileHasExt(req.file);
  log('INFO', 'Processing /api/pipe', { originalname: req.file.originalname, mimetype: req.file.mimetype, filePath });
  // DEBUG: save raw uploaded file so we can play exactly what the frontend sent
  try {
    const debugExt = path.extname(filePath) || '.webm';
    const debugName = `upload-debug-${Date.now()}${debugExt}`;
    const debugPath = path.join(logsDir, debugName);
    fs.copyFileSync(filePath, debugPath);
    log('DEBUG', 'Saved debug copy of uploaded audio (pipe)', { debugPath });
  } catch (e) {
    log('WARN', 'Failed to save debug copy of uploaded audio (pipe)', { err: e?.message });
  }
  try {
    log('INFO', 'Calling OpenAI transcription (whisper-1)');
    const stt = await openai.audio.transcriptions.create({
      model: 'whisper-1',
      file: fs.createReadStream(filePath),
      language: 'en'
    });
    const english = (stt.text || '').trim();
    log('INFO', 'Transcription complete', { englishSnippet: english.slice(0, 200) });

    log('INFO', 'Calling OpenAI chat completion for translation');
    const completion = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      temperature: 0,
      messages: [
        {
          role: 'system',
          content:
            'You are a translation engine. Translate any text from English to Spanish and ONLY return the Spanish translation with no extra words.'
        },
        { role: 'user', content: english }
      ]
    });
    const spanish = completion.choices?.[0]?.message?.content?.trim() || '';
    log('INFO', 'Translation complete', { spanishSnippet: spanish.slice(0, 200) });

    log('INFO', 'Calling OpenAI TTS (gpt-4o-mini-tts)');
    const speech = await openai.audio.speech.create({
      model: 'gpt-4o-mini-tts',
      voice: 'alloy',
      input: spanish,
      format: 'mp3'
    });
    const arrayBuffer = await speech.arrayBuffer();
    const audioBuf = Buffer.from(arrayBuffer);
    // DEBUG: save TTS output (pipe) to logs for inspection
    try {
      const debugPath = path.join(logsDir, `tts-pipe-${Date.now()}.mp3`);
      fs.writeFileSync(debugPath, audioBuf);
      log('DEBUG', 'Saved debug TTS file (pipe)', { debugPath, size: audioBuf.length, headHex: audioBuf.slice(0, 8).toString('hex') });
    } catch (e) {
      log('WARN', 'Failed to save debug TTS file (pipe)', { err: e?.message });
    }
    const audioBase64 = audioBuf.toString('base64');

    // cleanup
    fs.unlink(filePath, (err) => {
      if (err) log('WARN', 'Failed to unlink temp file', { filePath, err: err?.message });
      else log('DEBUG', 'Temp file deleted', { filePath });
    });
    res.json({
      english,
      spanish,
      audio: {
        mime: 'audio/mpeg',
        base64: audioBase64
      }
    });
  } catch (err) {
    log('ERROR', 'Pipeline failed', { message: err?.message, stack: err?.stack });
    fs.unlink(filePath || req.file.path, () => {});
    res.status(500).json({ error: 'Pipeline failed' });
  }
});

/**
 * POST /api/transcribe
 * Alias for /api/pipe for compatibility with the frontend requirement.
 * Accepts multipart/form-data with field "audio" and returns JSON:
 * { english: string, spanish: string, audio: { mime: string, base64: string } }
 */
app.post('/api/transcribe', upload.single('audio'), async (req, res) => {
  if (!req.file) {
    log('WARN', '/api/transcribe called without file');
    return res.status(400).json({ error: 'audio file required (field: audio)' });
  }
  const filePath = ensureFileHasExt(req.file);
  log('INFO', 'Processing /api/transcribe', { originalname: req.file.originalname, mimetype: req.file.mimetype, filePath });
  // DEBUG: copy uploaded file to logs for manual playback/inspection
  try {
    const debugExt = path.extname(filePath) || '.webm';
    const debugName = `upload-debug-${Date.now()}${debugExt}`;
    const debugPath = path.join(logsDir, debugName);
    fs.copyFileSync(filePath, debugPath);
    log('DEBUG', 'Saved debug copy of uploaded audio', { debugPath });
  } catch (e) {
    log('WARN', 'Failed to save debug copy of uploaded audio', { err: e?.message });
  }
  try {
    log('INFO', 'Calling OpenAI transcription (whisper-1)');
    const stt = await openai.audio.transcriptions.create({
      model: 'whisper-1',
      file: fs.createReadStream(filePath),
      language: 'en'
    });
    const english = (stt.text || '').trim();
    log('INFO', 'Transcription complete', { englishSnippet: english.slice(0, 200) });

    log('INFO', 'Calling OpenAI chat completion for translation');
    const completion = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      temperature: 0,
      messages: [
        {
          role: 'system',
          content:
            'You are a translation engine. Translate any text from English to Spanish and ONLY return the Spanish translation with no extra words.'
        },
        { role: 'user', content: english }
      ]
    });
    const spanish = completion.choices?.[0]?.message?.content?.trim() || '';
    log('INFO', 'Translation complete', { spanishSnippet: spanish.slice(0, 200) });

    log('INFO', 'Calling OpenAI TTS (gpt-4o-mini-tts)');
    const speech = await openai.audio.speech.create({
      model: 'gpt-4o-mini-tts',
      voice: 'alloy',
      input: spanish,
      format: 'mp3'
    });
    const arrayBuffer = await speech.arrayBuffer();
    const audioBuf = Buffer.from(arrayBuffer);
    // DEBUG: save TTS output (transcribe) to logs for inspection
    try {
      const debugPath = path.join(logsDir, `tts-transcribe-${Date.now()}.mp3`);
      fs.writeFileSync(debugPath, audioBuf);
      log('DEBUG', 'Saved debug TTS file (transcribe)', { debugPath, size: audioBuf.length, headHex: audioBuf.slice(0, 8).toString('hex') });
    } catch (e) {
      log('WARN', 'Failed to save debug TTS file (transcribe)', { err: e?.message });
    }
    const audioBase64 = audioBuf.toString('base64');

    // cleanup
    fs.unlink(filePath, (err) => {
      if (err) log('WARN', 'Failed to unlink temp file', { filePath, err: err?.message });
      else log('DEBUG', 'Temp file deleted', { filePath });
    });
    res.json({
      english,
      spanish,
      audio: {
        mime: 'audio/mpeg',
        base64: audioBase64
      }
    });
  } catch (err) {
    log('ERROR', 'Transcription pipeline failed', { message: err?.message, stack: err?.stack });
    fs.unlink(filePath || req.file.path, () => {});
    res.status(500).json({ error: 'Transcription pipeline failed' });
  }
});

app.get("/health", (req, res) => {
  res.json({ status: "OK", message: "Translation service is running" });
});

app.listen(port, () => {
  console.log(`Translation server listening on port ${port}`);
  console.log(`Health check: http://localhost:${port}/health`);
});
