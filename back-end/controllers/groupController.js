const Group = require('../models/Group');
const Client = require('../models/Client');
const mongoose = require('mongoose');

const normalizeContacts = (contactsInput) => {
  let contacts = [];
  if (!contactsInput) return contacts;

  if (typeof contactsInput === 'string') {
    const parts = contactsInput.split(',').map((item) => item.trim()).filter(Boolean);
    contacts = parts.map((phone) => ({ phone }));
  } else if (Array.isArray(contactsInput)) {
    contacts = contactsInput.map((item) => {
      if (typeof item === 'string') {
        return { phone: item.trim() };
      }
      return { name: item.name?.trim(), phone: (item.phone || '').trim() };
    });
  } else if (typeof contactsInput === 'object') {
    contacts = [{ name: contactsInput.name?.trim(), phone: (contactsInput.phone || '').trim() }];
  }

  contacts = contacts.filter((c) => c.phone);
  const valid = contacts.filter((c) => /^\+?[0-9]{6,15}$/.test(c.phone));
  const unique = [];
  const seen = new Set();
  for (const c of valid) {
    const key = c.phone;
    if (!seen.has(key)) {
      seen.add(key);
      unique.push({ name: c.name || '', phone: c.phone });
    }
  }
  return unique.slice(0, 1000);
};

/**
 * Sync client groups: when assigning clients to a group,
 * also update each client's groups array
 */
const syncClientGroups = async (groupId, nextClientIds, previousClientIds = []) => {
  const oldClientIds = previousClientIds.map((id) => String(id));
  const newClientIds = nextClientIds.map((id) => String(id));

  const toAdd = newClientIds.filter((id) => !oldClientIds.includes(id));
  const toRemove = oldClientIds.filter((id) => !newClientIds.includes(id));

  // Update clients: add this group
  if (toAdd.length > 0) {
    await Client.updateMany(
      { _id: { $in: toAdd } },
      { $addToSet: { groups: groupId } }
    );
  }

  // Update clients: remove this group
  if (toRemove.length > 0) {
    await Client.updateMany(
      { _id: { $in: toRemove } },
      { $pull: { groups: groupId } }
    );
  }
};

const toObjectId = (value) => {
  if (!mongoose.Types.ObjectId.isValid(value)) {
    return null;
  }
  return new mongoose.Types.ObjectId(value);
};

const buildGroupSummary = async (group) => {
  const storedClientCount = Array.isArray(group.clients) ? group.clients.length : 0;
  const contactCount = Array.isArray(group.contacts) ? group.contacts.length : 0;
  const actualClientCount = await Client.countDocuments({ groups: group._id });

  console.log('[GROUP COUNT DEBUG]', {
    groupId: String(group._id),
    groupName: group.name,
    storedCount: storedClientCount,
    actualClientCount,
  });

  const data = typeof group.toObject === 'function' ? group.toObject() : group;
  return {
    ...data,
    clientCount: actualClientCount,
    actualClientCount,
    contactCount,
    memberCount: contactCount + actualClientCount,
  };
};

const buildGroupSummaries = async (groups) => Promise.all(groups.map((group) => buildGroupSummary(group)));

exports.createGroup = async (req, res, next) => {
  try {
    const { name, contacts, clients } = req.body;
    if (!name) {
      return res.status(400).json({ success: false, message: 'Group name is required' });
    }
    const normalized = normalizeContacts(contacts);
    const clientIds = Array.isArray(clients) ? clients.filter((id) => id) : [];

    const group = await Group.create({
      name,
      contacts: normalized,
      clients: clientIds,
      createdBy: req.user._id,
    });

    if (clientIds.length > 0) {
      await syncClientGroups(group._id, clientIds, []);
    }

    const populated = await Group.findById(group._id)
      .populate('createdBy', 'name email');

    res.status(201).json({ success: true, data: await buildGroupSummary(populated) });
  } catch (error) {
    next(error);
  }
};

exports.getGroups = async (req, res, next) => {
  try {
    const { search } = req.query;
    const query = {};
    if (search) {
      query.name = { $regex: search, $options: 'i' };
    }
    const groups = await Group.find(query)
      .populate('createdBy', 'name email')
      .sort({ createdAt: -1 });

    const data = await buildGroupSummaries(groups);
    res.status(200).json({ success: true, count: data.length, data });
  } catch (error) {
    next(error);
  }
};

exports.getGroupById = async (req, res, next) => {
  try {
    const group = await Group.findById(req.params.id)
      .populate('createdBy', 'name email');

    if (!group) {
      return res.status(404).json({ success: false, message: 'Group not found' });
    }
    res.status(200).json({ success: true, data: await buildGroupSummary(group) });
  } catch (error) {
    next(error);
  }
};

exports.updateGroup = async (req, res, next) => {
  try {
    const group = await Group.findById(req.params.id);
    if (!group) {
      return res.status(404).json({ success: false, message: 'Group not found' });
    }
    const { name, contacts, clients } = req.body;
    if (name) group.name = name;
    if (contacts !== undefined) {
      group.contacts = normalizeContacts(contacts);
    }
    if (clients !== undefined) {
      const oldClientIds = group.clients.map((id) => String(id));
      const clientIds = Array.isArray(clients) ? clients.filter((id) => id) : [];
      group.clients = clientIds;
      await group.save();
      await syncClientGroups(group._id, clientIds, oldClientIds);
    } else {
      await group.save();
    }

    const updated = await Group.findById(group._id)
      .populate('createdBy', 'name email');

    res.status(200).json({ success: true, data: await buildGroupSummary(updated) });
  } catch (error) {
    next(error);
  }
};

/**
 * POST /api/groups/:id/assign-clients
 * Assign clients to a group
 */
exports.assignClientsToGroup = async (req, res, next) => {
  try {
    const { clientIds } = req.body;
    const group = await Group.findById(req.params.id);
    if (!group) {
      return res.status(404).json({ success: false, message: 'Group not found' });
    }

    const validClientIds = Array.isArray(clientIds) ? clientIds.filter((id) => id) : [];

    const oldClientIds = group.clients.map((id) => String(id));
    group.clients = validClientIds;
    await group.save();

    await syncClientGroups(group._id, validClientIds, oldClientIds);

    const updated = await Group.findById(group._id)
      .populate('createdBy', 'name email');

    res.status(200).json({ success: true, data: await buildGroupSummary(updated) });
  } catch (error) {
    next(error);
  }
};

exports.getGroupMembers = async (req, res, next) => {
  try {
    const groupId = toObjectId(req.params.id);
    if (!groupId) {
      return res.status(400).json({ success: false, message: 'Invalid group ID' });
    }

    const group = await Group.findById(groupId);
    if (!group) {
      return res.status(404).json({ success: false, message: 'Group not found' });
    }

    const { search, page = '1', limit = '25' } = req.query;
    const pageNum = Math.max(1, parseInt(page, 10) || 1);
    const limitNum = Math.min(100, Math.max(1, parseInt(limit, 10) || 25));
    const skip = (pageNum - 1) * limitNum;
    const term = String(search || '').trim().toLowerCase();

    const contactMatches = (group.contacts || [])
      .map((contact, index) => ({
        id: `contact-${index}`,
        type: 'contact',
        name: contact.name || 'Manual Contact',
        phone: contact.phone,
      }))
      .filter((contact) => {
        if (!term) return true;
        return contact.name.toLowerCase().includes(term) || contact.phone.toLowerCase().includes(term);
      });

    const clientQuery = { groups: groupId };
    if (term) {
      const regex = new RegExp(term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
      clientQuery.$or = [{ name: regex }, { mobile: regex }, { alternateMobile: regex }];
    }

    const contactTotal = contactMatches.length;
    const clientTotal = await Client.countDocuments(clientQuery);
    const contactSlice = skip < contactTotal ? contactMatches.slice(skip, skip + limitNum) : [];
    const clientSkip = Math.max(0, skip - contactTotal);
    const clientLimit = limitNum - contactSlice.length;
    const clients = clientLimit > 0
      ? await Client.find(clientQuery)
        .select('name mobile alternateMobile notes updatedAt createdAt')
        .sort({ createdAt: -1 })
        .skip(clientSkip)
        .limit(clientLimit)
      : [];

    const clientRows = clients.map((client) => ({
      id: String(client._id),
      type: 'client',
      name: client.name,
      phone: client.mobile,
      alternateMobile: client.alternateMobile,
      notes: client.notes,
      updatedAt: client.updatedAt,
      createdAt: client.createdAt,
    }));

    const total = contactTotal + clientTotal;
    res.status(200).json({
      success: true,
      data: [...contactSlice, ...clientRows],
      pagination: {
        total,
        page: pageNum,
        limit: limitNum,
        totalPages: Math.ceil(total / limitNum) || 1,
      },
      stats: {
        contactCount: contactTotal,
        clientCount: clientTotal,
        memberCount: total,
      },
    });
  } catch (error) {
    next(error);
  }
};

exports.addClientsToGroup = async (req, res, next) => {
  try {
    const { clientIds } = req.body;
    const group = await Group.findById(req.params.id);
    if (!group) {
      return res.status(404).json({ success: false, message: 'Group not found' });
    }

    const validClientIds = Array.isArray(clientIds) ? clientIds.filter((id) => id) : [];
    if (!validClientIds.length) {
      return res.status(400).json({ success: false, message: 'Select at least one client' });
    }

    await Group.findByIdAndUpdate(group._id, { $addToSet: { clients: { $each: validClientIds } } });
    await Client.updateMany(
      { _id: { $in: validClientIds } },
      { $addToSet: { groups: group._id } }
    );

    const updated = await Group.findById(group._id).populate('createdBy', 'name email');
    res.status(200).json({ success: true, data: await buildGroupSummary(updated) });
  } catch (error) {
    next(error);
  }
};

exports.removeClientFromGroup = async (req, res, next) => {
  try {
    const { id, clientId } = req.params;
    const group = await Group.findById(id);
    if (!group) {
      return res.status(404).json({ success: false, message: 'Group not found' });
    }

    await Promise.all([
      Group.findByIdAndUpdate(id, { $pull: { clients: clientId } }),
      Client.findByIdAndUpdate(clientId, { $pull: { groups: id } }),
    ]);

    const updated = await Group.findById(id).populate('createdBy', 'name email');
    res.status(200).json({ success: true, data: await buildGroupSummary(updated) });
  } catch (error) {
    next(error);
  }
};

exports.deleteGroup = async (req, res, next) => {
  try {
    const group = await Group.findByIdAndDelete(req.params.id);
    if (!group) {
      return res.status(404).json({ success: false, message: 'Group not found' });
    }

    // Remove this group from all clients
    await Client.updateMany(
      { groups: group._id },
      { $pull: { groups: group._id } }
    );

    res.status(200).json({ success: true, message: 'Group deleted successfully' });
  } catch (error) {
    next(error);
  }
};
