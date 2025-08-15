const request = require('supertest');
const express = require('express');
const apiRoutesFactory = require('../src/routes/api');
const logger = require('../src/logger');

// Mock OpenAI client
const mockOpenai = {
  audio: {
    transcriptions: {
      create: async () => ({ text: 'hello world' })
    },
    speech: {
      create: async () => ({ arrayBuffer: async () => Buffer.from('test') })
    }
  },
  chat: {
    completions: {
      create: async () => ({ choices: [{ message: { content: 'hola mundo' } }] })
    }
  }
};

const app = express();
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use('/api', apiRoutesFactory({ openai: mockOpenai, upload: { single: () => (req, res, next) => next() }, logsDir: logger.logsDir }));

// Health check test
describe('GET /api/health', () => {
  it('should return status OK', async () => {
    const res = await request(app).get('/api/health');
    expect(res.statusCode).toBe(200);
    expect(res.body.status).toBe('OK');
  });
});

// Translate test
describe('POST /api/translate', () => {
  it('should translate text', async () => {
    const res = await request(app)
      .post('/api/translate')
      .send({ text: 'hello world' });
    expect(res.statusCode).toBe(200);
    expect(res.body.text).toBe('hola mundo');
  });
  it('should return 400 if text missing', async () => {
    const res = await request(app)
      .post('/api/translate')
      .send({});
    expect(res.statusCode).toBe(400);
    expect(res.body.error).toBe('text required');
  });
});
