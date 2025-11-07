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

// 🔹 Noise reduction via ffmpeg (in memory) - Updated filters
const denoiseAudio = (inputBuffer) => {
  return new Promise((resolve, reject) => {
    const inputStream = bufferToStream(inputBuffer);
    const outputStream = new PassThrough();
    const chunks = [];

    ffmpeg(inputStream)
      // Apply filters:
      //  - highpass: cut low-frequency rumble
      //  - afftdn: noise reduction
      //  - loudnorm: normalize volume
      //  - silenceremove: trim silence (tighter params)
      .audioFilters([
        "highpass=f=80",
        "afftdn=nf=-30",
        "loudnorm=I=-16:TP=-1.5:LRA=11",
        "silenceremove=stop_periods=-1:stop_duration=0.5:stop_threshold=-50dB:start_periods=1:start_duration=0.5:start_threshold=-40dB"
      ])
      .audioCodec("pcm_s16le")
      .format("wav")
      .on("error", (err) => reject(err))
      .pipe(outputStream, { end: true });

    outputStream.on("data", (chunk) => chunks.push(chunk));
    outputStream.on("end", () => resolve(Buffer.concat(chunks)));
  });
};

// Updated: RMS-based speech detection
const hasSpeech = (buffer) => {
  // Remove WAV header (44 bytes) to get raw PCM 16-bit samples
  const pcmBuffer = buffer.slice(44);
  if (pcmBuffer.length < 16000) return false;  // Min ~1s at 16kHz

  let sumSquares = 0;
  for (let i = 0; i < pcmBuffer.length; i += 2) {
    const val = pcmBuffer.readInt16LE(i);
    sumSquares += val * val;
  }
  const rms = Math.sqrt(sumSquares / (pcmBuffer.length / 2));  // RMS for energy
  const avgRms = rms / 32768;  // Normalize to 0-1 range (16-bit)
  return avgRms > 0.02;  // Tune: 0.01-0.05; lower for quiet speech, higher to avoid noise
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
      task: "transcribe",
    });

    let resultTxt = transcription.text.trim();
    const usedPrompt = "Transcribe clear English speech. Ignore background noise or silence.";  // Empty since no prompt
    if (usedPrompt) {
      const promptRegex = new RegExp(usedPrompt.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi');
      resultTxt = resultTxt.replace(promptRegex, '').trim();
    }

    const hallucinationPatterns = [
      /^(thank you|bye|okay|silence|sure|hello|uh|um)\b/i,
      /^\.{3,}$/,  // Excessive pauses
      /^[\?\!\.]{3,}$/,  // Excessive punctuation
      /(.)\1{5,}/  // Repetitions (e.g., "aaaaa")
    ];
    const isHallucination = hallucinationPatterns.some(pattern => pattern.test(resultTxt)) || resultTxt.length < 6;

    if (isHallucination) {
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