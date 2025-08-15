const OpenAI = require('openai');

function createClient(apiKey) {
  return new OpenAI({ apiKey });
}

module.exports = { createClient };
