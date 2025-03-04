const mongoose = require('mongoose');

const DealerScheduleSchema = new mongoose.Schema({
    code: { type: String, required: true },
    name: { type: String, required: true },
    latitude: { type: mongoose.Schema.Types.Decimal128, required: true },
    longitude: { type: mongoose.Schema.Types.Decimal128, required: true },
    status: { type: String, enum: ['done', 'pending'], required: true },
    distance: { type: String, default: null }  // ✅ NEW FIELD to store distance from employee
});

const WeeklyBeatMappingScheduleSchema = new mongoose.Schema({
    startDate: { type: Date, required: true },
    endDate: { type: Date, required: true },
    code: { type: String, required: true },
    schedule: {
        Mon: [DealerScheduleSchema],
        Tue: [DealerScheduleSchema],
        Wed: [DealerScheduleSchema],
        Thu: [DealerScheduleSchema],
        Fri: [DealerScheduleSchema],
        Sat: [DealerScheduleSchema],
        Sun: [DealerScheduleSchema]
    },
    total: { type: Number, default: 0 },
    done: { type: Number, default: 0 },
    pending: { type: Number, default: 0 }
}, { timestamps: true });

module.exports = mongoose.model('WeeklyBeatMappingSchedule', WeeklyBeatMappingScheduleSchema);
