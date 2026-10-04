const assert = require('node:assert/strict');
const { afterEach, test } = require('node:test');
const Task = require('../models/Task');
const taskDisplayIdService = require('../services/taskDisplayIdService');
const activityHistoryService = require('../services/activityHistoryService');
const reminderService = require('../services/reminderService');

const originalAllocateTaskDisplayId = taskDisplayIdService.allocateTaskDisplayId;
const originalEnsureTasksHaveDisplayIds = taskDisplayIdService.ensureTasksHaveDisplayIds;
const originalResolveClientIdByPhone = activityHistoryService.resolveClientIdByPhone;
const originalLogActivity = activityHistoryService.logActivity;
const originalScheduleTaskReminder = reminderService.scheduleTaskReminder;

// Keep controller tests isolated from MongoDB and reminder/activity side effects.
taskDisplayIdService.allocateTaskDisplayId = async () => 'TSK-1';
taskDisplayIdService.ensureTasksHaveDisplayIds = async (tasks) => tasks;
activityHistoryService.resolveClientIdByPhone = async () => null;
activityHistoryService.logActivity = async () => {};
reminderService.scheduleTaskReminder = async () => {};

const { createTask, getTasks } = require('../controllers/taskController');

const originalTaskMethods = {};

afterEach(() => {
  for (const [method, implementation] of Object.entries(originalTaskMethods)) {
    Task[method] = implementation;
    delete originalTaskMethods[method];
  }
});

require('node:test').after(() => {
  taskDisplayIdService.allocateTaskDisplayId = originalAllocateTaskDisplayId;
  taskDisplayIdService.ensureTasksHaveDisplayIds = originalEnsureTasksHaveDisplayIds;
  activityHistoryService.resolveClientIdByPhone = originalResolveClientIdByPhone;
  activityHistoryService.logActivity = originalLogActivity;
  reminderService.scheduleTaskReminder = originalScheduleTaskReminder;
});

const mockResponse = () => ({
  statusCode: 200,
  body: null,
  status(code) {
    this.statusCode = code;
    return this;
  },
  json(body) {
    this.body = body;
    return this;
  },
});

const callController = async (handler, req, res = mockResponse()) => {
  await handler(req, res, (error) => {
    throw error;
  });
  return res;
};

const makeTaskBody = (overrides = {}) => ({
  title: 'Call customer',
  assignedTo: '64a2f1f2de0edc1234d56789',
  description: 'Discuss next steps',
  ...overrides,
});

test('CRM task creation defaults createdFrom to CRM and preserves existing task fields', async () => {
  let savedTask;
  originalTaskMethods.create = Task.create;
  originalTaskMethods.findById = Task.findById;
  Task.create = async (payload) => {
    savedTask = payload;
    return { _id: 'task-1', ...payload };
  };
  Task.findById = () => ({ populate: async () => ({ _id: 'task-1', ...savedTask }) });

  const response = await callController(createTask, {
    body: makeTaskBody(),
    user: { _id: 'user-1', role: 'user', email: '' },
  });

  assert.equal(response.statusCode, 201);
  assert.equal(response.body.success, true);
  assert.equal(savedTask.createdFrom, 'CRM');
  assert.equal(savedTask.title, 'Call customer');
  assert.equal(savedTask.assignedTo, '64a2f1f2de0edc1234d56789');
  assert.equal(savedTask.description, 'Discuss next steps');
  const crmModel = new Task(makeTaskBody());
  assert.equal(crmModel.createdFrom, 'CRM');
  assert.equal(crmModel.validateSync(), undefined);
});

test('Call Tracker task creation stores CALL_TRACKER', async () => {
  let savedTask;
  originalTaskMethods.create = Task.create;
  originalTaskMethods.findById = Task.findById;
  Task.create = async (payload) => {
    savedTask = payload;
    return { _id: 'task-2', ...payload };
  };
  Task.findById = () => ({ populate: async () => ({ _id: 'task-2', ...savedTask }) });

  const response = await callController(createTask, {
    body: makeTaskBody({ createdFrom: 'CALL_TRACKER' }),
    user: { _id: 'user-1', role: 'user', email: '' },
  });

  assert.equal(response.statusCode, 201);
  assert.equal(savedTask.createdFrom, 'CALL_TRACKER');
  assert.equal(response.body.data.createdFrom, 'CALL_TRACKER');

  const callTrackerModel = new Task(makeTaskBody({ createdFrom: 'CALL_TRACKER' }));
  assert.equal(callTrackerModel.validateSync(), undefined);
});

test('invalid createdFrom is rejected before task storage', async () => {
  let createCalled = false;
  originalTaskMethods.create = Task.create;
  Task.create = async () => {
    createCalled = true;
  };

  const response = await callController(createTask, {
    body: makeTaskBody({ createdFrom: 'ANDROID' }),
    user: { _id: 'user-1', role: 'user', email: '' },
  });

  assert.equal(response.statusCode, 400);
  assert.equal(response.body.success, false);
  assert.equal(createCalled, false);

  const invalidModel = new Task(makeTaskBody({ createdFrom: 'ANDROID' }));
  assert.equal(invalidModel.validateSync().errors.createdFrom.kind, 'enum');
});

test('GET task listing filters to CALL_TRACKER without dropping existing scope', async () => {
  let capturedQuery;
  originalTaskMethods.find = Task.find;
  Task.find = (query) => {
    capturedQuery = query;
    return {
      populate() { return this; },
      sort() { return this; },
      lean: async () => [
        { _id: 'crm-task', createdFrom: 'CRM' },
        { _id: 'tracker-task', createdFrom: 'CALL_TRACKER' },
      ].filter((task) => task.createdFrom === query.createdFrom),
    };
  };

  const response = await callController(getTasks, {
    query: { createdFrom: 'CALL_TRACKER' },
    user: { _id: 'employee-1', role: 'user', email: '' },
  });

  assert.equal(response.statusCode, 200);
  assert.equal(capturedQuery.createdFrom, 'CALL_TRACKER');
  assert.deepEqual(capturedQuery.assignedTo, { $in: ['employee-1'] });
  assert.deepEqual(response.body.data.map((task) => task._id), ['tracker-task']);
});
