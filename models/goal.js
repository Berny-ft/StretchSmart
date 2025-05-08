const mongoose = require('mongoose');
const Schema = mongoose.Schema;

const goalSchema = new Schema({
    distance: {
        type: Number,
        required: true
    },
    pace: {
        type: Number,
        required: true
    },
    startDate: {
        type: Date,
        required: true
    },
    endDate: {
        type: Date,
        required: true
    }
}, { _id: false});

module.exports = goalSchema;