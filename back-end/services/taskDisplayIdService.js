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

const ensureTaskDisplayId = async (taskDoc) => {
  const existing = String(taskDoc?.displayId || '').trim();
  if (DISPLAY_ID_PATTERN.test(existing)) {
    return existing;
  }

  const displayId = await allocateTaskDisplayId();
  await Task.updateOne(
    {
      _id: taskDoc._id,
      $or: [{ displayId: { $exists: false } }, { displayId: null }, { displayId: '' }],
    },
    { $set: { displayId } },
  );
  return displayId;
};

const ensureTasksHaveDisplayIds = async (tasks = []) => {
  const list = Array.isArray(tasks) ? tasks : [];
  const missing = list.filter((task) => !parseTaskDisplayNumber(task?.displayId));
  if (!missing.length) {
    return list;
  }

  for (const task of missing) {
    task.displayId = await ensureTaskDisplayId(task);
  }

  return list;
};

module.exports = {
  DISPLAY_ID_PATTERN,
  parseTaskDisplayNumber,
  formatTaskDisplayId,
  generateNextTaskDisplayId,
  allocateTaskDisplayId,
  ensureTaskDisplayId,
  ensureTasksHaveDisplayIds,
};
