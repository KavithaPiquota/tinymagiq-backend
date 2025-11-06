const { pool } = require("../config/database");
const { OpenAI } = require("openai");
const multer = require("multer");

// ✅ Memory storage for streaming uploads
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 25 * 1024 * 1024 }, // 25MB
  fileFilter: (req, file, cb) => {
    const allowedTypes = [
      "audio/webm",
      "audio/mpeg",
      "audio/mp3",
      "audio/wav",
      "audio/mp4",
      "audio/ogg",
      "video/webm",
      "video/mp4"
    ];
    if (allowedTypes.includes(file.mimetype)) cb(null, true);
    else cb(new Error("Invalid file type. Only audio allowed."));
  },
});

// ✅ Fetch KEY from DB
const getOpenAIApiKey = async () => {
  const result = await pool.query("SELECT api_key FROM keys LIMIT 1");
  if (result.rows.length === 0) throw new Error("No API key found in DB");
  return result.rows[0].api_key;
};

const transcribeAudio = async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({
        success: false,
        message: "No audio file provided.",
      });
    }

    const apiKey = await getOpenAIApiKey();
    const openai = new OpenAI({ apiKey });

    // ✅ Send WebM directly to OpenAI — no ffmpeg, no wav, no cpu cost
    const transcription = await openai.audio.transcriptions.create({
      file: new File([req.file.buffer], "audio.webm", { type: "audio/webm" }),
      model: "gpt-4o-transcribe",       // ✅ FASTEST model
      language: "en",
      task:"translate"
    });

    let text = transcription.text?.trim() || "";

    // Filter hallucinations / noise results
    if (text.length < 3 || /^(thank you|okay|bye|sure)$/i.test(text)) {
      text = "";
    }

    return res.status(200).json({
      success: true,
      data: { transcription: text },
      message: text ? "Transcription successful" : "No clear speech detected",
    });

  } catch (err) {
    console.error("Transcription error:", err);

    if (err.message.includes("Invalid file type")) {
      return res.status(400).json({
        success: false,
        message: err.message,
      });
    }

    return res.status(500).json({
      success: false,
      message: "Server transcription error",
      error: err.message,
    });
  }
};

module.exports = {
  transcribeAudio: [upload.single("audio"), transcribeAudio],
};
