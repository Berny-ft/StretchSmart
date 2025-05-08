const mongoose = require('mongoose');
const Schema = mongoose.Schema;

    const activitySchema = new Schema({ // assume that all users have a single
    username: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true
    },
    /*
    distance: {
        type: Number,
        required: true
    },

     */
    pace: [{
        time: {
            type: Number, // in seconds
            required: true
        },
        date: {
            type: Date,
            required: true
        }
    }],
    targetPace:{
      type : Number,
      required: false,
    },
    endDate: { // the end date of the challenge
        type: Date,
        required: false
    },
    startDate: {
        type : Date,
        required:false
    },
    stretchNumb: {
        type : Number,
        required: false,
    },
    warmNumb: {
        type : Number,
        required: true,
    }

}, {timestamps: true});

const Activity = mongoose.model('Activity', activitySchema);

module.exports = Activity;