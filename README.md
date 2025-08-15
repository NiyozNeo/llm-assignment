# LLM Assignment

This project is a full-stack application consisting of a Node.js/Express backend and a React/TypeScript frontend. It demonstrates file upload, logging, and integration with OpenAI services.

## Table of Contents
- [Project Structure](#project-structure)
- [Backend](#backend)
  - [Setup](#backend-setup)
  - [Features](#backend-features)
  - [Scripts](#backend-scripts)
- [Frontend](#frontend)
  - [Setup](#frontend-setup)
  - [Features](#frontend-features)
  - [Scripts](#frontend-scripts)
- [Development](#development)
- [License](#license)

---

## Project Structure
```
llm-assignment/
├── backend/
│   ├── src/
│   ├── logs/
│   ├── uploads/
│   ├── test/
│   ├── package.json
│   └── README.md
├── frontend/
│   ├── src/
│   ├── public/
│   ├── package.json
│   └── README.md
└── README.md
```

---

## Backend
Node.js/Express server for file upload, logging, and OpenAI integration.

### Backend Setup
1. Navigate to the backend folder:
   ```sh
   cd backend
   ```
2. Install dependencies:
   ```sh
   npm install
   ```
3. Start the server:
   ```sh
   npm start
   ```

### Backend Features
- File upload handling (audio, video)
- Logging requests and errors
- Integration with OpenAI API
- API endpoints defined in `src/routes/api.js`
- Utility functions in `src/utils/fileUtils.js`

### Backend Scripts
- `npm start` — Start the server
- `npm test` — Run backend tests

---

## Frontend
React + TypeScript app for interacting with the backend.

### Frontend Setup
1. Navigate to the frontend folder:
   ```sh
   cd frontend
   ```
2. Install dependencies:
   ```sh
   npm install
   ```
3. Start the development server:
   ```sh
   npm run dev
   ```

### Frontend Features
- File upload UI
- Error boundary for robust error handling
- Modern UI with Vite

### Frontend Scripts
- `npm run dev` — Start development server
- `npm run build` — Build for production
- `npm run test` — Run frontend tests

---

## Development
- Backend runs on Node.js (Express)
- Frontend runs on React (Vite)
- Logs and uploads are stored in respective backend folders
- See individual `README.md` files in `backend/` and `frontend/` for more details

---

## License
This project is licensed under the MIT License.
