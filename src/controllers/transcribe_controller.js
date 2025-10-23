const { pool } = require("../config/database");
const { OpenAI } = require("openai");
const multer = require("multer");
const ffmpeg = require("fluent-ffmpeg");
const { PassThrough } = require("stream");

// ✅ Use in-memory storage (no filesystem writes)
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 25 * 1024 * 1024 }, // 25MB limit
  fileFilter: (req, file, cb) => {
    const allowedTypes = [
      "audio/mpeg",
      "audio/mp3",
      "audio/wav",
      "audio/x-wav",
      "audio/mp4",
      "audio/mpeg4-generic",
      "audio/webm",
      "video/mp4",
      "video/mpeg",
    ];
    if (allowedTypes.includes(file.mimetype)) cb(null, true);
    else
      cb(
        new Error(
          "Invalid file type. Supported: mp3, wav, m4a, mp4, mpeg, mpga, webm"
        )
      );
  },
});

// 🔹 Helper: Get OpenAI API key from DB
const getOpenAIApiKey = async () => {
  const result = await pool.query("SELECT api_key FROM keys LIMIT 1");
  if (result.rows.length === 0) throw new Error("No API key found in the keys table");
  return result.rows[0].api_key;
};

// 🔹 Helper: Convert Buffer to Stream
const bufferToStream = (buffer) => {
  const stream = new PassThrough();
  stream.end(buffer);
  return stream;
};

// 🔹 Noise reduction via ffmpeg (in memory)
const denoiseAudio = (inputBuffer) => {
  return new Promise((resolve, reject) => {
    const inputStream = bufferToStream(inputBuffer);
    const outputStream = new PassThrough();
    const chunks = [];

    ffmpeg(inputStream)
      // Apply filters:
      //  - afftdn: basic noise reduction
      //  - loudnorm: normalize volume
      //  - silenceremove: trim silence
      .audioFilters([
        "afftdn=nf=-25",
        "loudnorm",
        "silenceremove=stop_periods=-1:stop_duration=1:stop_threshold=-40dB"
      ])
      .audioCodec("pcm_s16le")
      .format("wav")
      .on("error", (err) => reject(err))
      .pipe(outputStream, { end: true });

    outputStream.on("data", (chunk) => chunks.push(chunk));
    outputStream.on("end", () => resolve(Buffer.concat(chunks)));
  });
};

const hasSpeech = (buffer) => {
  // Remove WAV header (44 bytes) to get raw PCM 16-bit samples
  const pcmBuffer = buffer.slice(44);
  let sum = 0;
  for (let i = 0; i < pcmBuffer.length; i += 2) {
    const val = pcmBuffer.readInt16LE(i);
    sum += Math.abs(val);
  }
  const avgLevel = sum / (pcmBuffer.length / 2);
  return avgLevel > 700; // You can experiment with 500/700/900 as needed
};

const transcribeAudio = async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({
        success: false,
        error: "Bad request",
        message: "No audio file provided",
      });
    }

    const apiKey = await getOpenAIApiKey();
    const openai = new OpenAI({ apiKey });

    // Step 1: Denoise audio in-memory
    const cleanedBuffer = await denoiseAudio(req.file.buffer);

    // Amplitude-based speech detection
    if (!hasSpeech(cleanedBuffer)) {
      return res.status(200).json({
        success: true,
        data: { transcription: "" },
        message: "No speech detected based on amplitude threshold",
      });
    }

    if (cleanedBuffer.length < 3200) {
      return res.status(200).json({
        success: true,
        data: { transcription: "" },
        message: "Audio too short after noise reduction",
      });
    }

    const transcription = await openai.audio.transcriptions.create({
      file: new File([cleanedBuffer], "audio.wav", { type: "audio/wav" }),
      model: "whisper-1",
      language: "en",
      task: "translate",
    });

    let resultTxt = transcription.text.trim();
    // Filter undesirable hallucination outputs
    if (resultTxt.length < 6 || /^(thank you|bye|okay|silence|sure)\b/i.test(resultTxt)) {
      resultTxt = "";
    }

    res.status(200).json({
      success: true,
      data: { transcription: resultTxt },
      message: resultTxt === "" ? "No speech detected — please try again." : "Audio transcribed successfully",
    });
  } catch (error) {
    console.error("Error transcribing audio:", error);

    if (error.message.includes("No API key found")) {
      return res.status(500).json({
        success: false,
        error: "Internal server error",
        message: "API key configuration error",
      });
    }

    if (error.message.includes("Invalid file type")) {
      return res.status(400).json({
        success: false,
        error: "Bad request",
        message: error.message,
      });
    }

    res.status(500).json({
      success: false,
      error: "Internal server error",
      message: error.message,
    });
  }
};

module.exports = {
  transcribeAudio: [upload.single("audio"), transcribeAudio],
};
