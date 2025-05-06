const mongoose = require('mongoose');
const Schema = mongoose.Schema;

const activitySchema = new Schema({
    username: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true
    },
    distance: {
        type: Number,
        required: true
    },
    pace: {
        type: Number,
        required: true
    },
    date: {
        type: Date,
        required: true
    }
}, {timestamps: true});

const Activity = mongoose.model('Activity', activitySchema);

module.exports = Activity;