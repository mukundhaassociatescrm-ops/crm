const express = require('express');
const multer = require('multer');
const { uploadFile, uploadFileMiddleware } = require('../controllers/fileController');

const router = express.Router();

/**
 * @openapi
 * /api/files/upload:
 *   post:
 *     tags:
 *       - Chat
 *     summary: Upload attachment file and return public URL
 *     description: Supports existing document, image, video, text, and audio/mp4 uploads, up to 15 MB.
 *     requestBody:
 *       required: true
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             required:
 *               - file
 *             properties:
 *               file:
 *                 type: string
 *                 format: binary
 *     responses:
 *       200:
 *         description: File uploaded successfully
 *       400:
 *         description: Invalid file or unsupported type
 */
// Uploads a file and returns a publicly accessible URL.
router.post('/upload', uploadFileMiddleware, uploadFile);

router.use((error, _req, res, next) => {
	if (error instanceof multer.MulterError || error.message?.includes('Unsupported file type')) {
		return res.status(400).json({
			success: false,
			message: error.message,
		});
	}

	return next(error);
});

module.exports = router;
