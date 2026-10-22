const assert = require('node:assert/strict');
const { after, test } = require('node:test');

// Exercise the real route permission chains without a database, uploads or sends.
const originals = new Map();
const replaceModule = (path, exports) => {
  const id = require.resolve(path);
  originals.set(id, require.cache[id]);
  require.cache[id] = { id, filename: id, loaded: true, exports };
};

replaceModule('../middleware/authMiddleware', {
  protect(req, res, next) {
    if (!req.user) return res.status(401).json({ success: false });
    next();
  },
});

for (const controller of ['client', 'group', 'sms', 'smsTemplate', 'whatsappCampaign', 'message', 'poster']) {
  replaceModule(`../controllers/${controller}Controller`, new Proxy({}, {
    get(_target, name) {
      if (name === 'csvUpload' || name === 'templateUpload') return (_req, _res, next) => next();
      return (_req, res) => res.json({ success: true, handler: name });
    },
  }));
}
replaceModule('../middleware/posterUpload', {
  posterImageUploadMiddleware: (_req, _res, next) => next(),
});

const routers = Object.fromEntries(
  ['client', 'group', 'sms', 'whatsappCampaign', 'message', 'poster']
    .map((name) => [name, require(`../routes/${name}Routes`)]),
);

after(() => {
  for (const [id, original] of originals) {
    if (original) require.cache[id] = original;
    else delete require.cache[id];
  }
});

const invoke = (name, method, path, role) => {
  const route = routers[name].stack.find((layer) =>
    layer.route?.path === path && layer.route.methods[method],
  )?.route;
  assert.ok(route, `${name} ${method} ${path} exists`);
  const handlers = route.stack.filter((layer) => layer.method === method);
  const req = { user: role ? { _id: 'staff-1', role } : undefined };
  const res = {
    statusCode: 200,
    body: null,
    status(code) { this.statusCode = code; return this; },
    json(body) { this.body = body; return this; },
  };
  let index = 0;
  const next = (error) => {
    if (error) throw error;
    const handler = handlers[index++];
    if (handler) handler.handle(req, res, next);
  };
  next();
  return res;
};

const sharedRoutes = [
  ['client', 'get', '/', 'getClients'],
  ['client', 'post', '/', 'createClient'],
  ['client', 'post', '/bulk-upload', 'bulkUpload'],
  ['client', 'put', '/:id', 'updateClient'],
  ['client', 'delete', '/:id', 'deleteClient'],
  ['client', 'get', '/:id/chats', 'getClientChats'],
  ['client', 'post', '/:id/assign-groups', 'assignGroupsToClient'],
  ['group', 'post', '/', 'createGroup'],
  ['group', 'get', '/', 'getGroups'],
  ['group', 'get', '/:id', 'getGroupById'],
  ['group', 'get', '/:id/members', 'getGroupMembers'],
  ['group', 'post', '/:id/clients', 'addClientsToGroup'],
  ['group', 'delete', '/:id/clients/:clientId', 'removeClientFromGroup'],
  ['group', 'put', '/:id', 'updateGroup'],
  ['group', 'delete', '/:id', 'deleteGroup'],
  ['group', 'post', '/:id/assign-clients', 'assignClientsToGroup'],
  ['sms', 'post', '/send-single', 'sendSingleSms'],
  ['sms', 'post', '/send', 'sendSingleSms'],
  ['sms', 'post', '/send-bulk-dlt', 'sendBulkDltSms'],
  ['sms', 'get', '/templates/live', 'listLiveSmsTemplates'],
  ['sms', 'get', '/templates', 'listSmsTemplates'],
  ['whatsappCampaign', 'get', '/settings', 'getCampaignSettings'],
  ['whatsappCampaign', 'get', '/analyze/:groupId', 'analyzeAudience'],
  ['whatsappCampaign', 'post', '/', 'createCampaign'],
  ['whatsappCampaign', 'get', '/', 'listCampaigns'],
  ['whatsappCampaign', 'get', '/:id', 'getCampaign'],
  ['whatsappCampaign', 'get', '/:id/recipients', 'getCampaignRecipients'],
  ['whatsappCampaign', 'post', '/:id/pause', 'pauseCampaign'],
  ['whatsappCampaign', 'post', '/:id/resume', 'resumeCampaign'],
  ['whatsappCampaign', 'post', '/:id/retry-failed', 'retryFailed'],
  ['message', 'post', '/bulk', 'sendBulkMessage'],
  ['message', 'post', '/send-bulk', 'sendBulkMessage'],
  ['message', 'post', '/send', 'sendMessage'],
  ['message', 'get', '/', 'getMessages'],
  ['poster', 'get', '/active', 'listActivePosters'],
];

for (const role of ['user', 'employee', 'admin']) {
  test(`${role} can use selected communication and customer APIs`, () => {
    for (const [name, method, path, handler] of sharedRoutes) {
      const res = invoke(name, method, path, role);
      assert.equal(res.statusCode, 200, `${name} ${method} ${path}`);
      assert.equal(res.body?.handler, handler, `${name} ${method} ${path} reached controller`);
    }
  });
}

test('shared APIs still require authentication', () => {
  for (const [name, method, path] of sharedRoutes) {
    assert.equal(invoke(name, method, path).statusCode, 401, `${name} ${method} ${path}`);
  }
});

test('SMS administration, campaign limit settings and poster management stay admin-only', () => {
  const restrictedRoutes = [
    ['sms', 'get', '/wallet-balance'],
    ['sms', 'get', '/templates/debug'],
    ['sms', 'post', '/templates/sync'],
    ['sms', 'post', '/templates/import'],
    ['sms', 'put', '/templates/:id/message-id'],
    ['sms', 'patch', '/templates/:id/active'],
    ['whatsappCampaign', 'put', '/settings'],
    ['poster', 'get', '/'],
    ['poster', 'get', '/categories'],
    ['poster', 'get', '/:id'],
    ['poster', 'post', '/'],
    ['poster', 'put', '/:id'],
    ['poster', 'patch', '/:id/status'],
    ['poster', 'delete', '/:id'],
  ];
  for (const [name, method, path] of restrictedRoutes) {
    for (const role of ['user', 'employee']) {
      assert.equal(invoke(name, method, path, role).statusCode, 403, `${role} ${name} ${method} ${path}`);
    }
    const adminResult = invoke(name, method, path, 'admin');
    assert.equal(adminResult.statusCode, 200);
    assert.equal(adminResult.body?.success, true);
  }
});
