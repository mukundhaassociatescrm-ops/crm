const mongoose = require('mongoose');

const TASK_DISPLAY_ID_PATTERN = /^TSK-(\d+)$/i;

const isValidTaskDisplayId = (value) => TASK_DISPLAY_ID_PATTERN.test(String(value || '').trim());

const assertDisplayIdUpdateAllowed = (existingValue, incomingValue) => {
  const existing = String(existingValue || '').trim();
  const incoming = String(incomingValue || '').trim();

  if (!incoming) {
    return;
  }

  // Legacy record: allow one-time assignment when no valid displayId exists yet.
  if (!isValidTaskDisplayId(existing)) {
    if (isValidTaskDisplayId(incoming)) {
      return;
    }
    throw new Error('Task displayId cannot be changed after creation.');
  }

  // Existing task: only idempotent writes are allowed.
  if (existing !== incoming) {
    throw new Error('Task displayId cannot be changed after creation.');
  }
};

const taskSchema = new mongoose.Schema(
  {
    displayId: {
      type: String,
      trim: true,
      unique: true,
      sparse: true,
      index: true,
      immutable: true,
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

// Mongoose 9+: do not use next() in middleware — return or throw instead.
taskSchema.pre('save', async function protectDisplayId() {
  if (this.isNew || !this.isModified('displayId')) {
    return;
  }

  const persisted = await this.constructor.findById(this._id).select('displayId').lean();
  assertDisplayIdUpdateAllowed(persisted?.displayId, this.displayId);
});

taskSchema.pre('findOneAndUpdate', async function protectDisplayIdOnUpdate() {
  const update = this.getUpdate() || {};
  const setPayload = update.$set || update;

  if (setPayload && Object.prototype.hasOwnProperty.call(setPayload, 'taskNumber')) {
    throw new Error('Task displayId cannot be changed after creation.');
  }

  if (!setPayload || !Object.prototype.hasOwnProperty.call(setPayload, 'displayId')) {
    return;
  }

  const doc = await this.model.findOne(this.getQuery()).select('displayId').lean();
  if (!doc) {
    return;
  }

  assertDisplayIdUpdateAllowed(doc.displayId, setPayload.displayId);
});

module.exports = mongoose.model('Task', taskSchema);
