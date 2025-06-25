const mongoose = require('mongoose');

const leaveSchema = new mongoose.Schema({
  code: {
    type: String,
    required: true
  },
  leaveType: {
    type: String,
    enum: ['casual', 'sick', 'earned', 'maternity', 'paternity', 'other'],
    required: true
  },
  fromDate: {
    type: Date,
    required: true
  },
  toDate: {
    type: Date,
    required: true
  },
  totalDays: {
    type: Number,
    required: true
  },
  isHalfDay: {
    type: Boolean,
    default: false
  },
  halfDaySession: {
    type: String,
    enum: ['morning', 'afternoon'],
    required: function () { return this.isHalfDay; }
  },
  reason: {
    type: String,
    required: true
  },
  status: {
    type: String,
    enum: ['pending', 'approved', 'rejected', 'cancelled'],
    default: 'pending'
  },
  approverId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },
  approvalHistory: [
    {
      approverId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User'
      },
      action: {
        type: String,
        enum: ['approved', 'rejected'],
        required: true
      },
      comment: {
        type: String
      },
      date: {
        type: Date,
        default: Date.now
      }
    }
  ],
  attachmentUrl: {
    type: String
  },
  appliedAt: {
    type: Date,
    default: Date.now
  },
  updatedAt: {
    type: Date,
    default: Date.now
  }
}, { strict: false, timestamps: true });

module.exports = mongoose.model('Leave', leaveSchema);
