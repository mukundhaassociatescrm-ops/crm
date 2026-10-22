const assert = require('node:assert/strict');
const { afterEach, test, mock } = require('node:test');
const Message = require('../models/Message');
const Conversation = require('../models/Conversation');
const Task = require('../models/Task');
const { softDeleteMessage } = require('../services/chatMessageStore');

afterEach(() => mock.restoreAll());

for (const role of ['user', 'employee', 'admin']) {
  test(`${role} can remove an incoming chat message`, async () => {
    const message = {
      messageId: 'message-1',
      conversationId: 'conversation-1',
      direction: 'incoming',
      deleted: false,
      save: async () => {},
    };
    mock.method(Message, 'findOne', async () => message);
    mock.method(Conversation, 'findById', () => ({
      lean: async () => ({ phoneNumber: '919876543210' }),
    }));
    mock.method(Task, 'find', () => ({
      select() { return this; },
      populate() { return this; },
      lean: async () => [],
    }));

    const result = await softDeleteMessage({ messageId: 'message-1', user: { _id: 'staff-1', role } });
    assert.equal(result.ok, true);
    assert.equal(message.deleted, true);
    assert.equal(message.deletedBy, 'staff-1');
  });
}

test('removing messages still requires an authenticated user', async () => {
  const result = await softDeleteMessage({ messageId: 'message-1' });
  assert.equal(result.ok, false);
  assert.equal(result.status, 400);
});
