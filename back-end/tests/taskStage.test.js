const assert = require('node:assert/strict');
const { after, afterEach, test } = require('node:test');
const Task = require('../models/Task');
const User = require('../models/User');
const taskDisplayIdService = require('../services/taskDisplayIdService');
const activityHistoryService = require('../services/activityHistoryService');

const originalEnsureTasksHaveDisplayIds = taskDisplayIdService.ensureTasksHaveDisplayIds;
const originalStripMutableTaskIdFields = taskDisplayIdService.stripMutableTaskIdFields;
const originalResolveClientIdByPhone = activityHistoryService.resolveClientIdByPhone;
const originalLogActivity = activityHistoryService.logActivity;

const loggedActivities = [];
taskDisplayIdService.ensureTasksHaveDisplayIds = async (tasks) => tasks;
taskDisplayIdService.stripMutableTaskIdFields = () => {};
activityHistoryService.resolveClientIdByPhone = async () => null;
activityHistoryService.logActivity = async (entry) => {
  loggedActivities.push(entry);
};

const { getTasks, updateTask } = require('../controllers/taskController');
const { resolveTaskStageFilter } = require('../utils/taskStage');

const originalMethods = [];
const stub = (target, method, implementation) => {
  originalMethods.push([target, method, target[method]]);
  target[method] = implementation;
};

afterEach(() => {
  while (originalMethods.length) {
    const [target, method, implementation] = originalMethods.pop();
    target[method] = implementation;
  }
  loggedActivities.length = 0;
});

after(() => {
  taskDisplayIdService.ensureTasksHaveDisplayIds = originalEnsureTasksHaveDisplayIds;
  taskDisplayIdService.stripMutableTaskIdFields = originalStripMutableTaskIdFields;
  activityHistoryService.resolveClientIdByPhone = originalResolveClientIdByPhone;
  activityHistoryService.logActivity = originalLogActivity;
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

const callController = async (handler, req) => {
  const res = mockResponse();
  await handler(req, res, (error) => {
    throw error;
  });
  return res;
};

const adminUser = { _id: 'admin-1', role: 'admin', email: '' };

const stubTaskFind = () => {
  let capturedQuery;
  stub(Task, 'find', (query) => {
    capturedQuery = query;
    return {
      populate() { return this; },
      sort() { return this; },
      lean: async () => [],
    };
  });
  return () => capturedQuery;
};

const stubAdminScope = () => {
  stub(User, 'findOne', () => ({ sort() { return this; }, select: async () => ({ _id: 'admin-1' }) }));
};

const makeCompletedTask = (overrides = {}) => {
  const task = {
    _id: 'task-1',
    title: 'Audit report',
    status: 'Completed',
    paymentReceived: false,
    reportSent: true,
    assignedTo: 'employee-1',
    customerPhone: '',
    adminOwner: 'admin-1',
    saveCount: 0,
    async save() {
      this.saveCount += 1;
    },
    ...overrides,
  };
  return task;
};

const stubTaskLookup = (task) => {
  stub(Task, 'findOne', async () => task);
  stub(Task, 'findById', () => ({ populate: async () => ({ ...task }) }));
};

test('stage filters map tasks to Tasks, Payment and Report', () => {
  assert.equal(resolveTaskStageFilter(undefined), undefined);
  assert.equal(resolveTaskStageFilter(''), undefined);
  assert.deepEqual(resolveTaskStageFilter('active'), { status: { $ne: 'Completed' } });
  assert.deepEqual(resolveTaskStageFilter('Payment'), { status: 'Completed', paymentReceived: { $ne: true } });
  assert.deepEqual(resolveTaskStageFilter('report'), { status: 'Completed', paymentReceived: true });
  assert.equal(resolveTaskStageFilter('archived'), null);
});

test('GET tasks applies the stage filter without replacing the admin scope or search', async () => {
  stubAdminScope();
  const getQuery = stubTaskFind();

  const response = await callController(getTasks, {
    query: { stage: 'payment', search: 'audit' },
    user: adminUser,
  });

  assert.equal(response.statusCode, 200);
  const query = getQuery();
  assert.ok(Array.isArray(query.$or), 'search filter is preserved');
  assert.deepEqual(query.$and, [{ status: 'Completed', paymentReceived: { $ne: true } }]);
});

test('GET tasks rejects an unknown stage', async () => {
  let findCalled = false;
  stub(Task, 'find', () => {
    findCalled = true;
  });

  const response = await callController(getTasks, {
    query: { stage: 'archived' },
    user: adminUser,
  });

  assert.equal(response.statusCode, 400);
  assert.equal(findCalled, false);
});

test('admin can reopen a completed unpaid task back to active tasks', async () => {
  stubAdminScope();
  const task = makeCompletedTask();
  stubTaskLookup(task);

  const response = await callController(updateTask, {
    params: { id: 'task-1' },
    body: { status: 'In Progress' },
    user: adminUser,
  });

  assert.equal(response.statusCode, 200);
  assert.equal(task.status, 'In Progress');
  assert.equal(task.reportSent, true);
  assert.equal(task.saveCount, 1);
  assert.equal(loggedActivities[0].title, 'Task Reopened');
});

test('paid tasks cannot be reopened until moved back to payment', async () => {
  stubAdminScope();
  const task = makeCompletedTask({ paymentReceived: true });
  stubTaskLookup(task);

  const response = await callController(updateTask, {
    params: { id: 'task-1' },
    body: { status: 'In Progress' },
    user: adminUser,
  });

  assert.equal(response.statusCode, 400);
  assert.equal(task.status, 'Completed');
  assert.equal(task.saveCount, 0);
});

test('reopen does not allow editing other locked fields', async () => {
  stubAdminScope();
  const task = makeCompletedTask();
  stubTaskLookup(task);

  const response = await callController(updateTask, {
    params: { id: 'task-1' },
    body: { status: 'In Progress', title: 'Changed title' },
    user: adminUser,
  });

  assert.equal(response.statusCode, 400);
  assert.match(response.body.message, /title/);
  assert.equal(task.status, 'Completed');
  assert.equal(task.saveCount, 0);
});

test('report tasks move back to payment by clearing paymentReceived', async () => {
  stubAdminScope();
  const task = makeCompletedTask({ paymentReceived: true });
  stubTaskLookup(task);

  const response = await callController(updateTask, {
    params: { id: 'task-1' },
    body: { paymentReceived: false },
    user: adminUser,
  });

  assert.equal(response.statusCode, 200);
  assert.equal(task.paymentReceived, false);
  assert.equal(task.status, 'Completed');
});
