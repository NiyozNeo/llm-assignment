const express = require("express");
const cors = require("cors");
const app = express();
const port = 3000;
const multer =  require('multer');
const fs = require("fs");
const path = require("path");

const OpenAI = require("openai");

const upload = multer({ dest: path.join(process.cwd(), 'uploads') });

// Enable CORS for all routes
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

require("dotenv").config();
const openai = new OpenAI({
  apiKey: process.env.OPEN_AI_KEY,
});

app.post('/api/stt', upload.single('audio'), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'audio file required (field: audio)' });
  try {
    const transcription = await openai.audio.transcriptions.create({
      // Whisper API
      model: 'whisper-1',
      file: fs.createReadStream(req.file.path),
      language: 'en' // source language
    });
    // cleanup temp
    fs.unlink(req.file.path, () => {});
    res.json({ text: (transcription.text || '').trim() });
  } catch (err) {
    console.error(err);
    // cleanup on error
    fs.unlink(req.file?.path || '', () => {});
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
  if (!req.file) return res.status(400).json({ error: 'audio file required (field: audio)' });

  try {
    // 1) STT
    const stt = await openai.audio.transcriptions.create({
      model: 'whisper-1',
      file: fs.createReadStream(req.file.path),
      language: 'en'
    });
    const english = (stt.text || '').trim();

    // 2) Translate
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

    // 3) TTS (Spanish)
    const speech = await openai.audio.speech.create({
      model: 'gpt-4o-mini-tts',
      voice: 'alloy',
      input: spanish,
      format: 'mp3'
    });
    const arrayBuffer = await speech.arrayBuffer();
    const audioBuf = Buffer.from(arrayBuffer);
    const audioBase64 = audioBuf.toString('base64');

    // cleanup
    fs.unlink(req.file.path, () => {});
    res.json({
      english,
      spanish,
      audio: {
        mime: 'audio/mpeg',
        base64: audioBase64
      }
    });
  } catch (err) {
    console.error(err);
    fs.unlink(req.file?.path || '', () => {});
    res.status(500).json({ error: 'Pipeline failed' });
  }
});

app.get("/health", (req, res) => {
  res.json({ status: "OK", message: "Translation service is running" });
});

app.listen(port, () => {
  console.log(`Translation server listening on port ${port}`);
  console.log(`Health check: http://localhost:${port}/health`);
});
