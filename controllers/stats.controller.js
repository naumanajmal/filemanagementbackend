const File = require('../models/file.model');

// Get file statistics
const getFileStats = async (req, res) => {
    const userId = req.user._id;

    try {
        const files = await File.find({ userId }).sort({ order: 1 });

        const stats = files.map(file => ({
            filename: file.filename,
            views: file.views,
            tags: file.tags,
            sharedLink: file.sharedLink,
            _id: file._id,
        }));

        res.status(200).json(stats);
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Internal server error' });
    }
};

module.exports = {
    getFileStats,
};
