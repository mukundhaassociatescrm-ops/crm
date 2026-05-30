const express = require('express');
const { protect } = require('../middleware/authMiddleware');
const { authorizeRole } = require('../middleware/roleMiddleware');
const { posterImageUploadMiddleware } = require('../middleware/posterUpload');
const {
  getCategories,
  listPosters,
  listActivePosters,
  getPosterById,
  getPublicPosterBySlug,
  createPoster,
  updatePoster,
  setPosterStatus,
  deletePoster,
} = require('../controllers/posterController');

const router = express.Router();

router.get('/public/:slug', getPublicPosterBySlug);

router.get('/categories', protect, authorizeRole('admin'), getCategories);
router.get('/active', protect, authorizeRole('admin'), listActivePosters);
router.get('/', protect, authorizeRole('admin'), listPosters);
router.get('/:id', protect, authorizeRole('admin'), getPosterById);

router.post('/', protect, authorizeRole('admin'), posterImageUploadMiddleware, createPoster);
router.put('/:id', protect, authorizeRole('admin'), posterImageUploadMiddleware, updatePoster);
router.patch('/:id/status', protect, authorizeRole('admin'), setPosterStatus);
router.delete('/:id', protect, authorizeRole('admin'), deletePoster);

module.exports = router;
