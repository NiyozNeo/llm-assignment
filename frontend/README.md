
# Frontend (llm-assignment)

This is the frontend for the llm-assignment project. It provides a React-based user interface for recording audio, transcribing speech, translating to Spanish, and playing back synthesized speech.

## Features
- Record audio in-browser using MediaRecorder
- Send audio to backend for transcription and translation
- Display English transcript and Spanish translation
- Play and download synthesized Spanish speech
- Error boundaries for robust error handling
- Modern UI with Vite and TypeScript

## Requirements
- Node.js >= 18
- npm

## Setup
1. Install dependencies:
  ```sh
  npm install
  ```
2. Start the development server:
  ```sh
  npm run dev
  ```
3. Open your browser at [http://localhost:5173](http://localhost:5173) (default Vite port)

## Usage
- Click the record button to start/stop recording.
- Preview and send your recording for transcription and translation.
- View the transcript and translation in the chat bubbles.
- Play or download the synthesized Spanish speech.

## Project Structure
- `src/App.tsx`: Main app logic and UI
- `src/ErrorBoundary.tsx`: Error boundary for React errors
- `src/main.tsx`: App entry point
- `public/`: Static assets

## Environment
- The frontend expects the backend to be running at `/api` on the same host (proxy or CORS may be needed for production).

## Build
To build for production:
```sh
npm run build
```
The output will be in the `dist/` folder.

## License
MIT

You can also install [eslint-plugin-react-x](https://github.com/Rel1cx/eslint-react/tree/main/packages/plugins/eslint-plugin-react-x) and [eslint-plugin-react-dom](https://github.com/Rel1cx/eslint-react/tree/main/packages/plugins/eslint-plugin-react-dom) for React-specific lint rules:

```js
// eslint.config.js
import reactX from 'eslint-plugin-react-x'
import reactDom from 'eslint-plugin-react-dom'

export default tseslint.config([
  globalIgnores(['dist']),
  {
    files: ['**/*.{ts,tsx}'],
    extends: [
      // Other configs...
      // Enable lint rules for React
      reactX.configs['recommended-typescript'],
      // Enable lint rules for React DOM
      reactDom.configs.recommended,
    ],
    languageOptions: {
      parserOptions: {
        project: ['./tsconfig.node.json', './tsconfig.app.json'],
        tsconfigRootDir: import.meta.dirname,
      },
      // other options...
    },
  },
])
```
