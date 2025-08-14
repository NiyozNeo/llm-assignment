const express = require("express");
const cors = require("cors");
const app = express();
const port = 3000;

const OpenAI = require("openai");

// Enable CORS for all routes
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

require("dotenv").config();
const openai = new OpenAI({
  apiKey: process.env.OPEN_AI_KEY,
});

app.post("/translate", async (req, res) => {
  try {
    if (!req.body.text) {
      return res.status(400).json({ error: "Text is required" });
    }

    const text = req.body.text;

    console.log("Translating text:", text);

    // OpenAI API call for translation
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

    const translatedText = response.choices[0].message.content;
    console.log("Translation result:", translatedText);

    res.json({ translatedText });
  } catch (error) {
    console.error("Translation error:", error);
    res.status(500).json({ error: "Translation failed" });
  }
});

app.get("/health", (req, res) => {
  res.json({ status: "OK", message: "Translation service is running" });
});

app.listen(port, () => {
  console.log(`Translation server listening on port ${port}`);
  console.log(`Health check: http://localhost:${port}/health`);
});
