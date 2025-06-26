// src/routes/mentors/index.js
const express = require("express");
const router = express.Router();
const mentorsController = require("../../controllers/mentorsController");

// POST /api/mentors - Create a mentor
router.post("/", mentorsController.createMentor);

// GET /api/mentors - List all mentors
router.get("/", mentorsController.getMentors);

// PUT /api/mentors/:mentor_id - Update a mentor
router.put("/:mentor_id", mentorsController.updateMentor);

// DELETE /api/mentors/:mentor_id - Delete a mentor
router.delete("/:mentor_id", mentorsController.deleteMentor);

module.exports = router;
