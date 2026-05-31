const Task = require('../models/Task');

const DISPLAY_ID_PATTERN = /^TSK-(\d+)$/i;

const parseTaskDisplayNumber = (displayId) => {
  const match = String(displayId || '').trim().match(DISPLAY_ID_PATTERN);
  if (!match) {
    return 0;
  }
  const parsed = Number.parseInt(match[1], 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
};

const formatTaskDisplayId = (number) => `TSK-${number}`;

const isValidTaskDisplayId = (displayId) => DISPLAY_ID_PATTERN.test(String(displayId || '').trim());

const applyDisplayIdToTask = (task, displayId) => {
  if (!task || !displayId) {
    return;
  }
  if (typeof task.set === 'function') {
    task.set('displayId', displayId);
    return;
  }
  task.displayId = displayId;
};

const findMaxTaskDisplayNumber = async () => {
  const tasks = await Task.find({ displayId: { $exists: true, $ne: '' } })
    .select('displayId')
    .lean();

  let maxNum = 0;
  for (const task of tasks) {
    const num = parseTaskDisplayNumber(task.displayId);
    if (num > maxNum) {
      maxNum = num;
    }
  }

  return maxNum;
};

const generateNextTaskDisplayId = async () => {
  const maxNum = await findMaxTaskDisplayNumber();
  return formatTaskDisplayId(maxNum + 1);
};

const allocateTaskDisplayId = async (maxAttempts = 5) => {
  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    const displayId = await generateNextTaskDisplayId();
    const existing = await Task.findOne({ displayId }).select('_id').lean();
    if (!existing) {
      return displayId;
    }
  }

  throw new Error('Unable to allocate a unique task display ID.');
};

/**
 * Assign displayId only when the persisted task has none.
 * Always returns the authoritative value from MongoDB.
 */
const ensureTaskDisplayId = async (taskId) => {
  const id = String(taskId || '').trim();
  if (!id) {
    return '';
  }

  const persisted = await Task.findById(id).select('displayId').lean();
  const existing = String(persisted?.displayId || '').trim();
  if (isValidTaskDisplayId(existing)) {
    return existing;
  }

  const displayId = await allocateTaskDisplayId();
  const updated = await Task.findOneAndUpdate(
    { _id: id },
    { $set: { displayId } },
    { new: true, select: 'displayId', runValidators: true },
  ).lean();

  if (updated?.displayId && isValidTaskDisplayId(updated.displayId)) {
    return String(updated.displayId).trim();
  }

  const refreshed = await Task.findById(id).select('displayId').lean();
  const resolved = String(refreshed?.displayId || '').trim();
  if (isValidTaskDisplayId(resolved)) {
    return resolved;
  }

  return '';
};

const ensureTasksHaveDisplayIds = async (tasks = []) => {
  const list = Array.isArray(tasks) ? tasks : [];
  for (const task of list) {
    const resolved = await ensureTaskDisplayId(task?._id);
    applyDisplayIdToTask(task, resolved);
  }
  return list;
};

const stripMutableTaskIdFields = (body = {}) => {
  if (!body || typeof body !== 'object') {
    return body;
  }
  delete body.displayId;
  delete body.taskNumber;
  return body;
};

module.exports = {
  DISPLAY_ID_PATTERN,
  parseTaskDisplayNumber,
  formatTaskDisplayId,
  isValidTaskDisplayId,
  generateNextTaskDisplayId,
  allocateTaskDisplayId,
  ensureTaskDisplayId,
  ensureTasksHaveDisplayIds,
  stripMutableTaskIdFields,
};
