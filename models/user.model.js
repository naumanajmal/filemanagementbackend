const mongoose = require('mongoose');
const bcrypt = require('bcrypt');

const userSchema = new mongoose.Schema({
    email: {
        type: String,
        required: true,
        unique: true,
        trim: true,
        lowercase: true,
    },
    password: {
        type: String,
        required: true,
    },
}, { timestamps: true });

// Middleware to hash password before saving
// userSchema.pre('save', async function (next) {
//     if (!this.isModified('password')) return next();
//     try {
//         this.password = await bcrypt.hash(this.password, 10);
//         next();
//     } catch (error) {
//         next(error);
//     }
// });

// // Method to compare passwords
// userSchema.methods.comparePassword = async function (password) {
//     return bcrypt.compare(password, this.password);
// };

module.exports = mongoose.model('User', userSchema);
