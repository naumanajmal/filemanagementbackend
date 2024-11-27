// require('dotenv').config();
// const express = require('express');
// const connectDB = require('./config/db');
// const cors = require('cors');

// const authRoutes = require('./routes/auth.routes');
// const fileRoutes = require('./routes/file.routes');
// const statsRoutes = require('./routes/stats.routes');

// const app = express();

// // Middleware
// app.use(cors());
// app.use(express.json());

// // Routes
// app.use('/api/auth', authRoutes);
// app.use('/api/files', fileRoutes);
// app.use('/api/stats', statsRoutes);

// // Connect to DB and Start Server
// const PORT = process.env.PORT || 5001;
// connectDB(process.env.MONGO_URI);

// app.listen(PORT, () => {
//     console.log(`Server running on http://localhost:${PORT}`);
// });









const express = require('express');
const multer = require('multer');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcrypt');
const fs = require('fs');
const path = require('path');
const mongoose = require('mongoose');
const shortid = require('shortid'); // For generating shareable links
require('dotenv').config();
const app = express();
const PORT = process.env.PORT || 5001;
var cors = require('cors');
const { S3Client, PutObjectCommand, DeleteObjectCommand, GetObjectCommand } = require('@aws-sdk/client-s3');
const { getSignedUrl } = require('@aws-sdk/s3-request-presigner');
const { v4: uuidv4 } = require('uuid');
app.use(cors());

const MONGO_URI = process.env.MONGO_URI;

// Connect to MongoDB
mongoose.connect(MONGO_URI, { useNewUrlParser: true, useUnifiedTopology: true })
    .then(() => console.log('Connected to MongoDB'))
    .catch(err => console.error('Failed to connect to MongoDB', err));

// Define User Schema and Model
const userSchema = new mongoose.Schema({
    email: { type: String, required: true, unique: true },
    password: { type: String, required: true }
});
const User = mongoose.model('User', userSchema);

// Define File Schema and Model
const fileSchema = new mongoose.Schema({
    filename: { type: String, required: true },
    filepath: { type: String, required: true },
    mimetype: { type: String, required: true },
    size: { type: Number, required: true },
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    tags: [String], // Tags associated with the file
    uploadDate: { type: Date, default: Date.now },
    sharedLink: { type: String }, // Shareable link
    views: { type: Number, default: 0 }, // Number of times file was viewed
    order: { type: Number, default: 0 }, // New field for file order

});
const File = mongoose.model('File', fileSchema);

// Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Storage and File Validation
const uploadDir = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir);

 
const s3Client = new S3Client({
    region: process.env.AWS_REGION,
    credentials: {
        accessKeyId: process.env.AWS_ACCESS_KEY_ID,
        secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
    },
});

const BUCKET_NAME = process.env.AWS_BUCKET_NAME;

const upload = multer({
    storage: multer.memoryStorage(), // Temporarily store files in memory
    fileFilter: (req, file, cb) => {
        const validTypes = ['image/jpeg', 'image/png', 'application/pdf', 'video/mp4'];
        if (!validTypes.includes(file.mimetype)) {
            return cb(new Error('Invalid file type'), false);
        }
        cb(null, true);
    },
    limits: { fileSize: 50 * 1024 * 1024 }, // 50MB limit
});

// Authentication Middleware

const authenticate = (req, res, next) => {
    const token = req.header('Authorization')?.replace('Bearer ', '');

    if (!token) {
        return res.status(401).json({ error: 'No token provided' });
    }
    try {
        const decoded = jwt.verify(token, process.env.JWT_SECRET); // Verify JWT token
        req.user = decoded; // Attach the decoded token payload to the request object
        next(); // Proceed to the next middleware or route handler
    } catch (error) {
        return res.status(401).json({ error: 'Invalid or expired token' });
    }
};
// Routes

// File Upload with Tags
app.post('/upload', authenticate, upload.array('files'), async (req, res) => {
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

                // Upload file to S3
                await s3Client.send(new PutObjectCommand(params));

                // Save file details to database
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
});

// Generate Shareable Link
app.post('/share/:fileId', authenticate, async (req, res) => {
    const fileId = req.params.fileId;

    try {
        const userId = req.user._id;
        const file = await File.findOne({ _id: fileId, userId });

        if (!file) {
            return res.status(404).json({ error: 'File not found or you do not have permission to share this file' });
        }

        if (!file.sharedLink) {
            file.sharedLink = `${req.protocol}://localhost:5173/view/${shortid.generate()}`;
            await file.save();
        }

        res.status(200).json({ sharedLink: file.sharedLink });
    } catch (err) {
        res.status(500).json({ error: 'Internal server error' });
    }
});

app.post('/update-order', async (req, res) => {
    const { userId, files } = req.body; // `files` is an array of { _id, order }

    if (!userId || !files) {
        return res.status(400).json({ error: 'User ID and files are required' });
    }

    try {
        const bulkOperations = files.map((file) => ({
            updateOne: {
                filter: { _id: file._id, userId },
                update: { order: file.order },
            },
        }));

        await File.bulkWrite(bulkOperations);

        res.status(200).json({ message: 'File order updated successfully' });
    } catch (error) {
        console.error('Error updating file order:', error);
        res.status(500).json({ error: 'Failed to update file order' });
    }
});



// View Shared File
app.get('/view/:sharedId', async (req, res) => {
    const sharedId = req.params.sharedId;

    try {
        const file = await File.findOne({ sharedLink: { $regex: sharedId } });

        if (!file) {
            return res.status(404).json({ error: 'File not found' });
        }
        file.views += 1; // Increment view count
        await file.save();

        const key = file.filepath.split(`${BUCKET_NAME}/`)[1];
        const params = { Bucket: BUCKET_NAME, Key: key };
        const url = await getSignedUrl(s3Client, new GetObjectCommand(params), { expiresIn: 3600 });

        res.status(200).json({ url });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// Get File Statistics
app.get('/stats', authenticate, async (req, res) => {
    console.log("here")
    const userId = req.user._id;

    try {
        const files = await File.find({ userId });

        res.status(200).json(files.map(file => ({
            filename: file.filename,
            views: file.views,
            tags: file.tags,
            sharedLink: file.sharedLink,
            _id: file._id

        })));
    } catch (err) {
        res.status(500).json({ error: 'Internal server error' });
    }
});



// Delete File
app.delete('/file/:filename', authenticate, async (req, res) => {
    const filename = req.params.filename;

    try {
        const userId = req.user._id;

        const file = await File.findOne({ filename, userId });
        if (!file) {
            return res.status(404).json({ error: 'File not found or you do not have permission to delete this file' });
        }

        const key = file.filepath.split(`${BUCKET_NAME}/`)[1];
        const params = { Bucket: BUCKET_NAME, Key: key };

        // Delete file from S3
        await s3Client.send(new DeleteObjectCommand(params));

        // Delete record from database
        await file.deleteOne();

        res.status(200).json({ message: 'File deleted successfully' });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Internal server error' });
    }
});
app.post('/files/update-tags', authenticate, async (req, res) => {
    const { filename, tags } = req.body;

    if (!filename || !Array.isArray(tags)) {
        return res.status(400).json({ error: 'Invalid data provided' });
    }

    try {
        const file = await File.findOne({ filename });

        if (!file) {
            return res.status(404).json({ error: 'File not found' });
        }

        file.tags = tags; // Update the tags
        await file.save();

        res.status(200).json(file); // Return updated file data
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Failed to update tags' });
    }
});


// User Registration
app.post('/register', async (req, res) => {
    const { email, password, confirmPassword } = req.body;

    if (!email || !password || !confirmPassword) {
        return res.status(400).json({ error: 'All fields are required' });
    }

    if (password !== confirmPassword) {
        return res.status(400).json({ error: 'Passwords do not match' });
    }

    try {
        const hashedPassword = await bcrypt.hash(password, 10);
        const user = new User({ email, password: hashedPassword });
        await user.save();
        res.status(201).json({ message: 'User registered successfully' });
    } catch (err) {
        if (err.code === 11000) {
            return res.status(400).json({ error: 'Email already exists' });
        }
        res.status(500).json({ error: 'Internal server error' });
    }
});

// User Login
app.post('/login', async (req, res) => {
    const { email, password } = req.body;

    try {
        const user = await User.findOne({ email });
        if (!user) {
            return res.status(404).json({ error: 'User not found' });
        }

        const isMatch = await bcrypt.compare(password, user.password);
        if (!isMatch) {
            return res.status(401).json({ error: 'Invalid credentials' });
        }

        const token = jwt.sign(
            {
                _id: user._id,
                email: user.email,
            },
            process.env.JWT_SECRET,
            { expiresIn: '1h' }
        );

        res.status(200).json({ message: 'Login successful', token });
    } catch (err) {
        res.status(500).json({ error: 'Internal server error' });
    }
});

// Start Server
app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
});


