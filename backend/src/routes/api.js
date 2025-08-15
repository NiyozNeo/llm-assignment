const express = require('express');
const fs = require('fs');
const path = require('path');

const { ensureFileHasExt } = require('../utils/fileUtils');
const logger = require('../logger');

module.exports = ({ openai, upload, logsDir }) => {
  const router = express.Router();

  router.post('/stt', upload.single('audio'), async (req, res) => {
    if (!req.file) {
      logger.warn('/api/stt called without file');
      return res.status(400).json({ error: 'audio file required (field: audio)' });
    }
    const filePath = ensureFileHasExt(req.file);
    logger.info('Processing /api/stt', { originalname: req.file.originalname, mimetype: req.file.mimetype, filePath });
    try {
      const debugExt = path.extname(filePath) || '.webm';
      const debugName = `upload-debug-${Date.now()}${debugExt}`;
      const debugPath = path.join(logsDir, debugName);
      fs.copyFileSync(filePath, debugPath);
      logger.debug('Saved debug copy of uploaded audio (stt)', { debugPath });
    } catch (e) {
      logger.warn('Failed to save debug copy of uploaded audio (stt)', { err: e?.message });
    }

    try {
      const transcription = await openai.audio.transcriptions.create({
        model: 'whisper-1',
        file: fs.createReadStream(filePath),
        language: 'en'
      });
      logger.info('OpenAI transcription successful', { textSnippet: (transcription.text || '').slice(0, 200) });
      fs.unlink(filePath, (err) => {
        if (err) logger.warn('Failed to unlink temp file', { filePath, err: err?.message });
        else logger.debug('Temp file deleted', { filePath });
      });
      res.json({ text: (transcription.text || '').trim() });
    } catch (err) {
      logger.error('STT failed', { message: err?.message, stack: err?.stack });
      fs.unlink(filePath || req.file.path, () => {});
      res.status(500).json({ error: 'STT failed' });
    }
  });

  router.post('/translate', async (req, res) => {
    const input = (req.body?.text || '').toString();
    if (!input) return res.status(400).json({ error: 'text required' });
    try {
      const completion = await openai.chat.completions.create({
        model: 'gpt-4o-mini',
        temperature: 0,
        messages: [
          { role: 'system', content: 'You are a translation engine. Translate any text from English to Spanish and ONLY return the Spanish translation with no extra words.' },
          { role: 'user', content: input }
        ]
      });
      const out = completion.choices?.[0]?.message?.content?.trim() || '';
      res.json({ text: out });
    } catch (err) {
      logger.error('Translation failed', { message: err?.message, stack: err?.stack });
      res.status(500).json({ error: 'Translation failed' });
    }
  });

  router.post('/tts', async (req, res) => {
    const text = (req.body?.text || '').toString();
    if (!text) return res.status(400).json({ error: 'text required' });
    const voice = (req.body?.voice || 'alloy').toString();
    const format = (req.body?.format || 'mp3').toString();
    try {
      const speech = await openai.audio.speech.create({ model: 'gpt-4o-mini-tts', voice, input: text, format });
      const arrayBuffer = await speech.arrayBuffer();
      const buffer = Buffer.from(arrayBuffer);
      try {
        const ext = format || 'mp3';
        const debugTtsPath = path.join(logsDir, `tts-${Date.now()}.${ext}`);
        fs.writeFileSync(debugTtsPath, buffer);
        logger.debug('Saved debug TTS file', { debugTtsPath, size: buffer.length, headHex: buffer.slice(0, 8).toString('hex') });
      } catch (e) {
        logger.warn('Failed to save debug TTS file', { err: e?.message });
      }
      const mime = format === 'wav' ? 'audio/wav' : format === 'opus' ? 'audio/ogg' : 'audio/mpeg';
      res.setHeader('Content-Type', mime);
      res.setHeader('Content-Length', buffer.length);
      res.setHeader('Content-Disposition', `inline; filename="speech.${format}"`);
      res.send(buffer);
    } catch (err) {
      logger.error('TTS failed', { message: err?.message, stack: err?.stack });
      res.status(500).json({ error: 'TTS failed' });
    }
  });

  async function translateAndTts(english) {
    const completion = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      temperature: 0,
      messages: [
        { role: 'system', content: 'You are a translation engine. Translate any text from English to Spanish and ONLY return the Spanish translation with no extra words.' },
        { role: 'user', content: english }
      ]
    });
    const spanish = completion.choices?.[0]?.message?.content?.trim() || '';
    const speech = await openai.audio.speech.create({ model: 'gpt-4o-mini-tts', voice: 'alloy', input: spanish, format: 'mp3' });
    const arrayBuffer = await speech.arrayBuffer();
    const audioBuf = Buffer.from(arrayBuffer);
    return { spanish, audioBuf };
  }

  // extract pipe handler so /pipe and /transcribe can share it without re-parsing
  async function handlePipeRequest(req, res) {
    if (!req.file) return res.status(400).json({ error: 'audio file required (field: audio)' });
    const filePath = ensureFileHasExt(req.file);
    logger.info('Processing /api/pipe', { originalname: req.file.originalname, mimetype: req.file.mimetype, filePath });
    try {
      try {
        const debugExt = path.extname(filePath) || '.webm';
        const debugName = `upload-debug-${Date.now()}${debugExt}`;
        const debugPath = path.join(logsDir, debugName);
        fs.copyFileSync(filePath, debugPath);
        logger.debug('Saved debug copy of uploaded audio (pipe)', { debugPath });
      } catch (e) {
        logger.warn('Failed to save debug copy of uploaded audio (pipe)', { err: e?.message });
      }

      const stt = await openai.audio.transcriptions.create({ model: 'whisper-1', file: fs.createReadStream(filePath), language: 'en' });
      const english = (stt.text || '').trim();
      logger.info('Transcription complete', { englishSnippet: english.slice(0, 200) });
      const { spanish, audioBuf } = await translateAndTts(english);
      logger.info('Translation complete', { spanishSnippet: spanish.slice(0, 200) });
      try {
        const debugPath = path.join(logsDir, `tts-pipe-${Date.now()}.mp3`);
        fs.writeFileSync(debugPath, audioBuf);
        logger.debug('Saved debug TTS file (pipe)', { debugPath, size: audioBuf.length, headHex: audioBuf.slice(0, 8).toString('hex') });
      } catch (e) {
        logger.warn('Failed to save debug TTS file (pipe)', { err: e?.message });
      }
      const audioBase64 = audioBuf.toString('base64');
      fs.unlink(filePath, (err) => {
        if (err) logger.warn('Failed to unlink temp file', { filePath, err: err?.message });
        else logger.debug('Temp file deleted', { filePath });
      });
      res.json({ english, spanish, audio: { mime: 'audio/mpeg', base64: audioBase64 } });
    } catch (err) {
      logger.error('Pipeline failed', { message: err?.message, stack: err?.stack });
      fs.unlink(req.file?.path || filePath, () => {});
      res.status(500).json({ error: 'Pipeline failed' });
    }
  }

  // route: /pipe
  router.post('/pipe', upload.single('audio'), async (req, res) => {
    return handlePipeRequest(req, res);
  });

  // alias/transcribe uses the same handler (do not re-run multer)
  router.post('/transcribe', upload.single('audio'), async (req, res) => {
    return handlePipeRequest(req, res);
  });

  router.get('/health', (req, res) => {
    res.json({ status: 'OK', message: 'Translation service is running' });
  });

  return router;
};
