const express = require('express');
const authenticate = require('../middlewares/authenticate');
const { getFileStats } = require('../controllers/stats.controller');

const router = express.Router();

// Route to get file statistics
router.get('/', authenticate, getFileStats);

module.exports = router;
