# Backend (llm-assignment)

This is the backend server for the llm-assignment project. It provides API endpoints for speech-to-text (STT), translation, and text-to-speech (TTS) using OpenAI models.

## Features
- Speech-to-text (Whisper)
- English to Spanish translation (GPT-4o)
- Text-to-speech (GPT-4o TTS)
- File upload and cleanup
- Granular error handling
- Logging to file
- Scheduled cleanup of old uploads (using node-cron)

## Requirements
- Node.js >= 18
- npm
- OpenAI API key

## Setup
1. Install dependencies:
   ```sh
   npm install
   ```
2. Create a `.env` file in the backend directory:
   ```env
   OPEN_AI_KEY=your_openai_api_key_here
   ```
3. Start the server:
   ```sh
   node src/main.js
   ```

## API Endpoints
### POST `/api/stt`
- Upload an audio file (`audio` field)
- Returns: `{ text: "..." }`

### POST `/api/translate`
- Body: `{ text: "..." }`
- Returns: `{ text: "..." }` (Spanish translation)

### POST `/api/tts`
- Body: `{ text: "...", voice: "alloy", format: "mp3" }`
- Returns: audio file (mp3/wav/ogg)

### POST `/api/pipe` and `/api/transcribe`
- Upload an audio file (`audio` field)
- Returns: `{ english, spanish, audio: { mime, base64 } }`

### GET `/api/health`
- Returns: `{ status: "OK", message: "Translation service is running" }`

## Logging
- Logs are written to `backend/logs/server.log`.

## File Cleanup
- Uploaded files are deleted after processing.
- Old files in `uploads/` are deleted every hour (files older than 24 hours).

## Error Handling
- Granular error responses with type, message, and details.

## License
MIT
