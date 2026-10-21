const assert = require('node:assert/strict');
const { afterEach, test } = require('node:test');
const Task = require('../models/Task');
const taskController = require('../controllers/taskController');
const taskRoutes = require('../routes/taskRoutes');
const { protect } = require('../middleware/authMiddleware');
const { isAllowedUploadMimeType } = require('../controllers/fileController');

const originalTaskMethods = {};

afterEach(() => {
  for (const [method, implementation] of Object.entries(originalTaskMethods)) {
    Task[method] = implementation;
    delete originalTaskMethods[method];
  }
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

const baseTask = (overrides = {}) => ({
  _id: 'task-1',
  assignedTo: 'employee-1',
  attachments: [{ url: 'https://files/invoice.pdf', fileName: 'invoice.pdf', mimeType: 'application/pdf' }],
  voiceNote: undefined,
  save: async function save() {},
  ...overrides,
});

const baseRequest = (body = {}, user = { _id: 'employee-1', role: 'user', email: '' }) => ({
  params: { id: 'task-1' },
  body: {
    url: 'https://files.example.com/task_voice.m4a',
    fileName: 'task_voice.m4a',
    mimeType: 'audio/mp4',
    durationSeconds: 25,
    ...body,
  },
  user,
});

const stubTaskQueries = (task) => {
  originalTaskMethods.findOne = Task.findOne;
  originalTaskMethods.findById = Task.findById;
  Task.findOne = async () => task;
  Task.findById = () => ({ populate: async () => task });
};

test('Task can be created without a voice note and voiceNote is optional', () => {
  const task = new Task({ title: 'Task without recording', assignedTo: '64a2f1f2de0edc1234d56789' });
  assert.equal(task.voiceNote, undefined);
  assert.equal(task.validateSync(), undefined);
});

test('Task schema accepts a valid audio/mp4 voice note', () => {
  const task = new Task({
    title: 'Task with recording',
    assignedTo: '64a2f1f2de0edc1234d56789',
    voiceNote: {
      url: 'https://files.example.com/task_voice.m4a',
      fileName: 'task_voice.m4a',
      mimeType: 'audio/mp4',
      durationSeconds: 25,
    },
  });

  assert.equal(task.validateSync(), undefined);
  assert.equal(task.voiceNote.durationSeconds, 25);
});

test('voice-note endpoint stores metadata separately and preserves normal attachments', async () => {
  const task = baseTask();
  stubTaskQueries(task);

  const response = await callController(taskController.addTaskVoiceNote, baseRequest());

  assert.equal(response.statusCode, 200);
  assert.deepEqual(task.voiceNote, {
    url: 'https://files.example.com/task_voice.m4a',
    fileName: 'task_voice.m4a',
    mimeType: 'audio/mp4',
    durationSeconds: 25,
  });
  assert.equal(task.attachments.length, 1);
  assert.equal(response.body.data.voiceNote.fileName, 'task_voice.m4a');
});

test('calling voice-note endpoint again replaces the existing voice note', async () => {
  const task = baseTask({
    voiceNote: {
      url: 'https://files.example.com/old.m4a',
      fileName: 'old.m4a',
      mimeType: 'audio/mp4',
      durationSeconds: 5,
    },
  });
  stubTaskQueries(task);

  const response = await callController(taskController.addTaskVoiceNote, baseRequest({
    url: 'https://files.example.com/new.m4a',
    fileName: 'new.m4a',
    durationSeconds: 40,
  }));

  assert.equal(response.statusCode, 200);
  assert.equal(task.voiceNote.url, 'https://files.example.com/new.m4a');
  assert.equal(task.voiceNote.fileName, 'new.m4a');
  assert.equal(task.voiceNote.durationSeconds, 40);
  assert.equal(task.attachments.length, 1);
});

test('voice-note endpoint rejects missing/invalid URL, filename, and negative duration', async (t) => {
  const cases = [
    { body: { url: '' }, message: 'A valid voice note URL is required.' },
    { body: { url: 'not-a-url' }, message: 'A valid voice note URL is required.' },
    { body: { fileName: '' }, message: 'fileName is required.' },
    { body: { durationSeconds: -1 }, message: 'durationSeconds must be a non-negative number.' },
  ];

  for (const testCase of cases) {
    await t.test(testCase.message, async () => {
      const response = await callController(
        taskController.addTaskVoiceNote,
        baseRequest(testCase.body)
      );
      assert.equal(response.statusCode, 400);
      assert.equal(response.body.message, testCase.message);
    });
  }
});

test('voice-note endpoint rejects an invalid MIME type', async () => {
  const response = await callController(
    taskController.addTaskVoiceNote,
    baseRequest({ mimeType: 'application/pdf' })
  );

  assert.equal(response.statusCode, 400);
  assert.match(response.body.message, /audio\/mp4/);
});

test('unassigned user cannot attach a voice note to another employee task', async () => {
  const task = baseTask({ assignedTo: 'different-employee' });
  stubTaskQueries(task);

  const response = await callController(
    taskController.addTaskVoiceNote,
    baseRequest({}, { _id: 'employee-1', role: 'user', email: '' })
  );

  assert.equal(response.statusCode, 403);
  assert.equal(response.body.success, false);
});

test('voice-note route requires the existing authentication middleware', () => {
  const layer = taskRoutes.stack.find((entry) => entry.route?.path === '/:id/voice-note');
  assert.ok(layer, 'voice-note route exists');
  assert.equal(layer.route.stack[0].handle, protect);
  assert.equal(layer.route.stack[1].handle, taskController.addTaskVoiceNote);
});

test('existing normal upload allowlist accepts audio/mp4 without widening other audio types', () => {
  assert.equal(isAllowedUploadMimeType('audio/mp4'), true);
  assert.equal(isAllowedUploadMimeType('audio/mpeg'), false);
  assert.equal(isAllowedUploadMimeType('application/pdf'), true);
});
