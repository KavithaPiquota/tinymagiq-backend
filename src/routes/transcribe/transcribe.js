const express = require("express");
const router = express.Router();
const transcribeController = require("../../controllers/transcribe_controller");

// POST /api/transcribe - Transcribe audio file using OpenAI Whisper
router.post("/", transcribeController.transcribeAudio);

module.exports = router;