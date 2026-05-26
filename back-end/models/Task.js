const mongoose = require('mongoose');

const taskSchema = new mongoose.Schema(
  {
    displayId: {
      type: String,
      trim: true,
      unique: true,
      sparse: true,
      index: true,
    },
    title: { type: String, required: [true, 'Task title is required'] },
    description: { type: String, default: '' },
    assignedTo: { type: mongoose.Schema.Types.ObjectId, ref: 'Employee', required: true },
    customerName: { type: String, default: '' },
    customerPhone: { type: String, default: '' },
    paymentReceived: { type: Boolean, default: false },
    reportSent: { type: Boolean, default: false },
    priority: { type: String, enum: ['Low', 'Medium', 'High'], default: 'Medium' },
    status: { type: String, enum: ['Pending', 'In Progress', 'Report Sent', 'Completed'], default: 'Pending' },
    dueDate: { type: Date },
    reminderEnabled: { type: Boolean, default: false },
    reminderBefore: { type: Number, default: 15, description: 'Minutes before due date to send reminder' },
    reminderTime: { type: Date, description: 'Calculated reminder trigger time' },
    reminderSent: { type: Boolean, default: false },
    reminderScheduleId: { type: String, description: 'ID of scheduled cron job for cleanup' },
    attachments: {
      type: [
        {
          url: { type: String, required: true },
          fileName: { type: String, required: true },
          mimeType: { type: String, default: '' },
          note: { type: String, default: '' },
          uploadedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
          uploadedAt: { type: Date, default: Date.now },
        },
      ],
      default: [],
    },
    adminOwner: { type: mongoose.Schema.Types.ObjectId, ref: 'User', index: true },
    createdFromChat: { type: Boolean, default: false },
    conversationId: { type: mongoose.Schema.Types.ObjectId, ref: 'Conversation', index: true },
    chatMessageId: { type: String, trim: true, index: true },
    chatPhone: { type: String, trim: true, default: '' },
    messageText: { type: String, default: '' },
  },
  { timestamps: true }
);

module.exports = mongoose.model('Task', taskSchema);
