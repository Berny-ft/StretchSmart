const mongoose = require('mongoose');
const activitySchema = require('./activity');
const goalSchema = require('./goal');
const Schema = mongoose.Schema;

const userSchema = new Schema({
    username: {
        type: String,
        required: true,
        unique: true
    },
    password: {
        type: String,
        required: true
    },
    warmups: {
        type: Number,
        required: true
    },
    stretches: {
        type: Number,
        required: true
    },
    activities: [activitySchema],
    goals: [goalSchema]
}, { timestamps: true });

const User = mongoose.model('User', userSchema);

module.exports = User;