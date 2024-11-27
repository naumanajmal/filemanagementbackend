const express = require('express');
const authenticate = require('../middlewares/authenticate');
const {
    uploadFiles,
    shareFile,
    updateFileOrder,
    viewSharedFile,
    deleteFile,
    updateFileTags
} = require('../controllers/file.controller');
const multer = require('multer');
const upload = multer();
const router = express.Router();

// File upload route
router.post('/upload', authenticate, upload.array('files'), uploadFiles);

// Share file route
router.post('/share/:fileId', authenticate, shareFile);

// Update file order route
router.post('/update-order', authenticate, updateFileOrder);

// View shared file route
router.get('/view/:sharedId', viewSharedFile);

// Delete file route
router.delete('/file/:filename', authenticate, deleteFile);

// Update file tags route
router.post('/files/update-tags', authenticate, updateFileTags);

module.exports = router;
