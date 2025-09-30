const { pool } = require("../config/database");
const { OpenAI } = require("openai");
const multer = require("multer");
const fs = require("fs").promises;
const path = require("path");

// Configure multer for file uploads
const upload = multer({
  dest: "uploads/",
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
    if (allowedTypes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error("Invalid file type. Supported formats: mp3, wav, m4a, mp4, mpeg, mpga, webm"));
    }
  },
});

// Helper function to retrieve OpenAI API key from the keys table
const getOpenAIApiKey = async () => {
  try {
    const result = await pool.query("SELECT api_key FROM keys LIMIT 1");
    if (result.rows.length === 0) {
      throw new Error("No API key found in the keys table");
    }
    return result.rows[0].api_key;
  } catch (error) {
    console.error("Error fetching OpenAI API key:", error);
    throw error;
  }
};

// Transcribe audio file using OpenAI Whisper
const transcribeAudio = async (req, res) => {
  let tempFilePath = null;
  try {
    // Check if file is uploaded
    if (!req.file) {
      return res.status(400).json({
        success: false,
        error: "Bad request",
        message: "No audio file provided",
      });
    }

    // Fetch OpenAI API key
    const apiKey = await getOpenAIApiKey();

    // Initialize OpenAI client
    const openai = new OpenAI({ apiKey });

    // Rename the temp file to include the original extension (e.g., .webm)
    const originalExt = path.extname(req.file.originalname) || '.webm'; // Fallback to .webm if no ext
    tempFilePath = path.resolve(req.file.path + originalExt);
    await fs.rename(req.file.path, tempFilePath);

    // Read the renamed file
    const fileStream = require("fs").createReadStream(tempFilePath);

    // Call OpenAI Whisper API for transcription
    const transcription = await openai.audio.transcriptions.create({
      file: fileStream,
      model: "gpt-4o-transcribe",
      language: "en",
    });

    // Clean up the temporary file
    await fs.unlink(tempFilePath).catch((err) => {
      console.error(`Failed to delete temporary file ${tempFilePath}:`, err);
    });

    // Return the transcription
    res.status(200).json({
      success: true,
      data: {
        transcription: transcription.text,
      },
      message: "Audio transcribed successfully",
    });
  } catch (error) {
    // Clean up the temporary file in case of error
    if (tempFilePath || req.file) {
      const pathToDelete = tempFilePath || req.file.path;
      await fs.unlink(pathToDelete).catch((err) => {
        console.error(`Failed to delete temporary file ${pathToDelete}:`, err);
      });
    }

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
    if (error.code === "ERR_INVALID_FILE_SIZE") {
      return res.status(400).json({
        success: false,
        error: "Bad request",
        message: "File size exceeds 25MB limit",
      });
    }
    if (error.response && error.response.status) {
      return res.status(error.response.status).json({
        success: false,
        error: "OpenAI API error",
        message: error.response.data.error.message || "Failed to transcribe audio",
      });
    }
    res.status(500).json({
      success: false,
      error: "Internal server error",
      message: error.message,
    });
  }
};

// Export the controller with multer middleware
module.exports = {
  transcribeAudio: [upload.single("audio"), transcribeAudio],
};