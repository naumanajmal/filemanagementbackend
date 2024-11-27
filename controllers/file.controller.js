const File = require('../models/file.model');
const { S3Client, PutObjectCommand, DeleteObjectCommand, GetObjectCommand } = require('@aws-sdk/client-s3');
const { getSignedUrl } = require('@aws-sdk/s3-request-presigner');
const shortid = require('shortid');

const s3Client = require('../config/s3');
const BUCKET_NAME = process.env.AWS_BUCKET_NAME;

// Upload files
const uploadFiles = async (req, res) => {
    console.log("here in upload files")
    const { tags } = req.body;

    if (!req.files || req.files.length === 0) {
        return res.status(400).json({ error: 'No files uploaded' });
    }

    try {
        const userId = req.user._id;

        const fileRecords = await Promise.all(
            req.files.map(async (file) => {
                const key = `${Date.now()}-${file.originalname}`;
                const params = {
                    Bucket: BUCKET_NAME,
                    Key: key,
                    Body: file.buffer,
                    ContentType: file.mimetype,
                };

                await s3Client.send(new PutObjectCommand(params));

                const newFile = new File({
                    filename: `${key}`,
                    filepath: `s3://${BUCKET_NAME}/${key}`,
                    mimetype: file.mimetype,
                    size: file.size,
                    userId,
                    tags: tags ? tags.split(',') : [],
                });

                return newFile.save();
            })
        );

        res.status(200).json({
            message: 'Files uploaded successfully',
            files: fileRecords,
        });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Internal server error' });
    }
};

// Share file
const shareFile = async (req, res) => {
    const fileId = req.params.fileId;

    try {
        const userId = req.user._id;
        const file = await File.findOne({ _id: fileId, userId });

        if (!file) {
            return res.status(404).json({ error: 'File not found or you do not have permission to share this file' });
        }

        if (!file.sharedLink) {
            file.sharedLink = `${req.protocol}://46.101.155.18/view/${shortid.generate()}`;
            await file.save();
        }

        res.status(200).json({ sharedLink: file.sharedLink });
    } catch (err) {
        res.status(500).json({ error: 'Internal server error' });
    }
};

// Update file order
const updateFileOrder = async (req, res) => {
    const { order } = req.body;
console.log("here order")
    if (!Array.isArray(order)) {
        return res.status(400).json({ message: 'Invalid order format' });
    }

    try {
        const bulkOperations = order.map((item, index) => ({
            updateOne: {
                filter: { _id: item },
                update: { order: index },
            },
        }));

        await File.bulkWrite(bulkOperations);
        return res.status(200).json({ message: 'Order updated successfully' });
    } catch (err) {
        console.error('Error updating file order:', err);
        res.status(500).json({ message: 'Failed to update order' });
    }
 

};

// View shared file
const viewSharedFile = async (req, res) => {
    const sharedId = req.params.sharedId;

    try {
        const file = await File.findOne({ sharedLink: { $regex: sharedId } });

        if (!file) {
            return res.status(404).json({ error: 'File not found' });
        }
        file.views += 1;
        await file.save();

        const key = file.filepath.split(`${BUCKET_NAME}/`)[1];
        const params = { Bucket: BUCKET_NAME, Key: key };
        const url = await getSignedUrl(s3Client, new GetObjectCommand(params), { expiresIn: 3600 });

        res.status(200).json({ url });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Internal server error' });
    }
};

// Delete file
const deleteFile = async (req, res) => {
    const filename = req.params.filename;

    try {
        const userId = req.user._id;

        const file = await File.findOne({ filename, userId });
        if (!file) {
            return res.status(404).json({ error: 'File not found or you do not have permission to delete this file' });
        }

        const key = file.filepath.split(`${BUCKET_NAME}/`)[1];
        const params = { Bucket: BUCKET_NAME, Key: key };

        await s3Client.send(new DeleteObjectCommand(params));

        await file.deleteOne();

        res.status(200).json({ message: 'File deleted successfully' });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Internal server error' });
    }
};

// Update file tags
const updateFileTags = async (req, res) => {
    const { filename, tags } = req.body;

    if (!filename || !Array.isArray(tags)) {
        return res.status(400).json({ error: 'Invalid data provided' });
    }

    try {
        const file = await File.findOne({ filename });

        if (!file) {
            return res.status(404).json({ error: 'File not found' });
        }

        file.tags = tags;
        await file.save();

        res.status(200).json(file);
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Failed to update tags' });
    }
};

module.exports = {
    uploadFiles,
    shareFile,
    updateFileOrder,
    viewSharedFile,
    deleteFile,
    updateFileTags,
};
