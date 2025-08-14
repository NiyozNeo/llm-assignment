const express = require("express");
const app = express();
const port = 3000;

const OpenAI = require("openai");

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

require("dotenv").config();
const openai = new OpenAI({
  apiKey: process.env.OPEN_AI_KEY,
});

app.post("/", async (req, res) => {
  if (!req.body.text) {
    return res.status(400).send("Text is required");
  }

  const text = req.body.text;

  // Example OpenAI API call
  const response = await openai.chat.completions.create({
    model: "gpt-4o-mini",
    messages: [
      {
        role: "system",
        content:
          "You are a translator. Translate the user's text to Spanish and ONLY reply with the translation. No extra words.",
      },
      {
        role: "user",
        content: text,
      },
    ],
  });

  console.log(response.choices[0].message.content);

  res.send(response.choices[0].message.content);
});

app.listen(port, () => {
  console.log(`Example app listening on port ${port}`);
});
