const mongoose = require('mongoose');
const Task = require('../models/Task');
const Message = require('../models/Message');
const Employee = require('../models/Employee');
const Enquiry = require('../models/Enquiry');
const User = require('../models/User');
const { scheduleTaskReminder, rescheduleTaskReminder, sendManualReminder } = require('../services/reminderService');
const ReminderLog = require('../models/ReminderLog');
const { logActivity, resolveClientIdByPhone } = require('../services/activityHistoryService');
const { allocateTaskDisplayId, stripMutableTaskIdFields } = require('../services/taskDisplayIdService');

const isAdminUser = (user) => String(user?.role || '').toLowerCase() === 'admin';

const resolveConversationObjectId = (value) => {
  const raw = String(value || '').trim();
  if (!raw || !mongoose.Types.ObjectId.isValid(raw)) {
    return undefined;
  }

  return raw;
};

const isLegacyPrimaryAdmin = async (user) => {
  if (!isAdminUser(user)) {
    return false;
  }

  const firstAdmin = await User.findOne({ role: 'admin' }).sort({ createdAt: 1 }).select('_id');
  return Boolean(firstAdmin?._id && String(firstAdmin._id) === String(user._id));
};

const buildAdminTaskScope = async (user) => {
  if (!isAdminUser(user)) {
    return {};
  }

  const canSeeLegacyUnowned = await isLegacyPrimaryAdmin(user);
  if (canSeeLegacyUnowned) {
    return {
      $or: [
        { adminOwner: user._id },
        { adminOwner: { $exists: false } },
        { adminOwner: null },
      ],
    };
  }

  return { adminOwner: user._id };
};

const ensureAdminOwnsEmployee = async (user, employeeId) => {
  if (!user?._id || !employeeId) {
    return false;
  }

  const canSeeLegacyUnowned = await isLegacyPrimaryAdmin(user);
  const employeeQuery = canSeeLegacyUnowned
    ? {
        _id: employeeId,
        $or: [
          { adminOwner: user._id },
          { adminOwner: { $exists: false } },
          { adminOwner: null },
        ],
      }
    : { _id: employeeId, adminOwner: user._id };

  const employee = await Employee.findOne(employeeQuery).select('_id');
  return Boolean(employee?._id);
};

const parseDueDateInput = (value) => {
  if (value === undefined || value === null || value === '') {
    return undefined;
  }

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return undefined;
  }

  return parsed;
};

const resolveAssignedIdsForUser = async (user) => {
  const ids = [String(user._id)];
  const role = (user.role || '').toLowerCase();

  if (role === 'admin') {
    return ids;
  }

  const email = (user.email || '').toLowerCase().trim();
  if (email) {
    const employee = await Employee.findOne({ email }).select('_id');
    if (employee?._id) {
      ids.push(String(employee._id));
    }
  }

  return [...new Set(ids)];
};

exports.createTask = async (req, res, next) => {
  try {
    stripMutableTaskIdFields(req.body);
    const {
      title,
      description,
      assignedTo,
      customerName,
      customerPhone,
      paymentReceived,
      reportSent,
      priority,
      status,
      dueDate,
      reminderEnabled,
      reminderBefore,
      createdFromChat,
      conversationId,
      chatMessageId,
      chatPhone,
      chatId,
      messageText,
      messageId,
    } = req.body;
    if (!title || !assignedTo) {
      return res.status(400).json({ success: false, message: 'Title and assignedTo are required.' });
    }

    if (isAdminUser(req.user)) {
      const ownsEmployee = await ensureAdminOwnsEmployee(req.user, assignedTo);
      if (!ownsEmployee) {
        return res.status(403).json({ success: false, message: 'Cannot assign task to another admin\'s employee.' });
      }
    }

    const resolvedChatMessageId = String(chatMessageId || messageId || '').trim();
    const resolvedChatPhone = String(chatPhone || chatId || customerPhone || '').trim();
    const resolvedMessageText = String(messageText || description || '').trim();
    const isFromChat = Boolean(createdFromChat && resolvedChatMessageId);
    const displayId = await allocateTaskDisplayId();

    const task = await Task.create({
      displayId,
      title,
      description,
      assignedTo,
      customerName: customerName || '',
      customerPhone: customerPhone || '',
      paymentReceived: !!paymentReceived,
      reportSent: status === 'Report Sent' ? true : !!reportSent,
      priority: priority || 'Medium',
      status: status || 'Pending',
      dueDate: parseDueDateInput(dueDate),
      reminderEnabled: reminderEnabled ?? false,
      reminderBefore: reminderBefore || 15,
      createdFromChat: isFromChat,
      conversationId: resolveConversationObjectId(conversationId),
      chatMessageId: resolvedChatMessageId || undefined,
      chatPhone: resolvedChatPhone,
      messageText: resolvedMessageText,
      ...(isAdminUser(req.user) ? { adminOwner: req.user._id } : {}),
    });

    if (isFromChat && resolvedChatMessageId) {
      try {
        await Message.findOneAndUpdate(
          { messageId: resolvedChatMessageId },
          { $set: { linkedTaskId: task._id } },
        );
      } catch (_) {
        // Keep task creation resilient if message link update fails.
      }
    }

    const populated = await Task.findById(task._id).populate('assignedTo', 'fullName email phone');

    try {
      const resolvedClientId = await resolveClientIdByPhone(task.customerPhone || '');

      await logActivity({
        type: 'task',
        title: 'Task Created',
        referenceId: String(task._id),
        taskId: task._id,
        clientId: resolvedClientId,
        employeeId: task.assignedTo,
        description: task.title,
        metadata: {
          status: task.status,
          priority: task.priority,
        },
        adminOwner: task.adminOwner,
      });

      await logActivity({
        type: 'assignment',
        title: 'Task Assigned',
        referenceId: String(task._id),
        taskId: task._id,
        clientId: resolvedClientId,
        employeeId: task.assignedTo,
        description: `Task assigned: ${task.title}`,
        metadata: {
          assignedTo: String(task.assignedTo || ''),
        },
        adminOwner: task.adminOwner,
      });
    } catch (_) {
      // Keep task creation resilient if history logging fails.
    }
    
    if (task.reminderEnabled && task.dueDate) {
      await scheduleTaskReminder(task);
    }

    res.status(201).json({ success: true, data: populated });
  } catch (error) {
    next(error);
  }
};

exports.getTasks = async (req, res, next) => {
  try {
    const { search, status, priority, assignedTo, fromDate, toDate } = req.query;
    const query = { ...(await buildAdminTaskScope(req.user)) };

    if (!isAdminUser(req.user)) {
      const assignedIds = await resolveAssignedIdsForUser(req.user);
      query.assignedTo = { $in: assignedIds };
    } else if (assignedTo) {
      query.assignedTo = assignedTo;
    }

    if (search) {
      query.$or = [
        { title: { $regex: search, $options: 'i' } },
        { description: { $regex: search, $options: 'i' } },
        { customerName: { $regex: search, $options: 'i' } },
        { customerPhone: { $regex: search, $options: 'i' } },
      ];
    }
    if (status) {
      query.status = status;
    }
    if (priority) {
      query.priority = priority;
    }
    if (fromDate || toDate) {
      query.dueDate = {};
      if (fromDate) query.dueDate.$gte = new Date(fromDate);
      if (toDate) query.dueDate.$lte = new Date(toDate);
    }

    const tasks = await Task.find(query).populate('assignedTo', 'fullName email phone').sort({ dueDate: 1, createdAt: -1 });
    res.status(200).json({ success: true, count: tasks.length, data: tasks });
  } catch (error) {
    next(error);
  }
};

exports.getUpcomingReminders = async (req, res, next) => {
  try {
    const query = {
      reminderEnabled: true,
      reminderTime: { $ne: null },
      status: { $ne: 'Completed' },
      ...(await buildAdminTaskScope(req.user)),
    };

    const isAdmin = isAdminUser(req.user);
    if (!isAdmin) {
      const assignedIds = await resolveAssignedIdsForUser(req.user);
      query.assignedTo = { $in: assignedIds };
    }

    const tasks = await Task.find(query)
      .populate('assignedTo', 'fullName email phone')
      .sort({ reminderTime: 1, dueDate: 1, createdAt: -1 });

    const now = new Date();
    const taskReminders = tasks.map((task) => {
      const assignedUser = task.assignedTo && typeof task.assignedTo === 'object'
        ? task.assignedTo.fullName || task.assignedTo.email || 'Unassigned'
        : String(task.assignedTo || 'Unassigned');

      const isOverdue = !task.reminderSent && task.reminderTime && new Date(task.reminderTime) < now;
      const reminderStatus = task.reminderSent ? 'sent' : isOverdue ? 'overdue' : 'upcoming';

      return {
        taskId: `task-${task._id}`,
        kind: 'task',
        taskName: task.title,
        assignedUser,
        reminderTime: task.reminderTime,
        dueDate: task.dueDate,
        taskStatus: task.status,
        priority: task.priority,
        reminderStatus,
        reminderSent: task.reminderSent,
        overdue: isOverdue,
      };
    });

    let enquiryReminders = [];
    if (isAdmin) {
      const enquiries = await Enquiry.find({ status: { $ne: 'Closed' } })
        .sort({ createdAt: -1 })
        .limit(20);

      enquiryReminders = enquiries.map((enquiry) => ({
        taskId: `enquiry-${enquiry._id}`,
        kind: 'enquiry',
        taskName: `New Enquiry: ${enquiry.name}`,
        assignedUser: enquiry.phone,
        reminderTime: enquiry.createdAt,
        dueDate: enquiry.createdAt,
        taskStatus: enquiry.status,
        priority: 'Medium',
        reminderStatus: 'upcoming',
        reminderSent: false,
        overdue: false,
      }));
    }

    const reminders = [...enquiryReminders, ...taskReminders].sort(
      (a, b) => new Date(b.reminderTime).getTime() - new Date(a.reminderTime).getTime()
    );

    res.status(200).json({ success: true, count: reminders.length, data: reminders });
  } catch (error) {
    next(error);
  }
};

exports.getTaskById = async (req, res, next) => {
  try {
    const task = await Task.findOne({ _id: req.params.id, ...(await buildAdminTaskScope(req.user)) })
      .populate('assignedTo', 'fullName email phone');
    if (!task) {
      return res.status(404).json({ success: false, message: 'Task not found' });
    }

    if (!isAdminUser(req.user)) {
      const assignedIds = await resolveAssignedIdsForUser(req.user);
      const taskAssignedId = task.assignedTo?._id ? String(task.assignedTo._id) : String(task.assignedTo || '');
      if (!assignedIds.includes(taskAssignedId)) {
        return res.status(403).json({ success: false, message: 'Forbidden: not assigned to this task' });
      }
    }
    res.status(200).json({ success: true, data: task });
  } catch (error) {
    next(error);
  }
};

exports.updateTask = async (req, res, next) => {
  try {
    stripMutableTaskIdFields(req.body);
    const task = await Task.findOne({ _id: req.params.id, ...(await buildAdminTaskScope(req.user)) });
    if (!task) {
      return res.status(404).json({ success: false, message: 'Task not found' });
    }
    const isAdmin = isAdminUser(req.user);

    if (!isAdmin) {
      const assignedIds = await resolveAssignedIdsForUser(req.user);
      const taskAssignedId = String(task.assignedTo || '');
      if (!assignedIds.includes(taskAssignedId)) {
        return res.status(403).json({ success: false, message: 'Forbidden: not assigned to this task' });
      }
    }

    const {
      title,
      description,
      assignedTo,
      customerName,
      customerPhone,
      paymentReceived,
      reportSent,
      priority,
      status,
      dueDate,
      reminderEnabled,
      reminderBefore,
    } = req.body;

    if (isAdmin && assignedTo !== undefined) {
      const ownsEmployee = await ensureAdminOwnsEmployee(req.user, assignedTo);
      if (!ownsEmployee) {
        return res.status(403).json({ success: false, message: 'Cannot assign task to another admin\'s employee.' });
      }
    }

    // Employees can only change their own task status.
    if (!isAdmin) {
      if (!status || !['Pending', 'In Progress', 'Report Sent', 'Completed'].includes(status)) {
        return res.status(400).json({ success: false, message: 'Valid status is required.' });
      }

      const previousStatus = String(task.status || '');
      const previousReportSent = !!task.reportSent;
      const nextReportSent = status === 'Report Sent' ? true : (reportSent !== undefined ? !!reportSent : !!task.reportSent);
      if (status === 'Completed' && !nextReportSent) {
        return res.status(400).json({ success: false, message: 'Mark report as sent before completing the task.' });
      }

      task.status = status;
      task.reportSent = nextReportSent;
      if (paymentReceived !== undefined) {
        task.paymentReceived = !!paymentReceived;
      }
      await task.save();
      const updated = await Task.findById(task._id).populate('assignedTo', 'fullName email phone');

      try {
        const resolvedClientId = await resolveClientIdByPhone(task.customerPhone || '');

        if (String(task.status || '') === 'In Progress') {
          await logActivity({
            type: 'task',
            title: 'Task Picked',
            referenceId: String(task._id),
            taskId: task._id,
            clientId: resolvedClientId,
            employeeId: task.assignedTo,
            description: `Task started: ${task.title}`,
            metadata: { status: task.status },
            adminOwner: task.adminOwner,
          });
        }

        const reportJustSubmitted =
          (previousStatus !== 'Report Sent' && String(task.status || '') === 'Report Sent')
          || (!previousReportSent && !!task.reportSent);

        if (reportJustSubmitted) {
          await logActivity({
            type: 'report',
            title: 'Report Send',
            referenceId: String(task._id),
            taskId: task._id,
            clientId: resolvedClientId,
            employeeId: task.assignedTo,
            description: `Report send for task: ${task.title}`,
            metadata: {
              status: task.status,
              reportSent: !!task.reportSent,
            },
            adminOwner: task.adminOwner,
          });
        }
      } catch (_) {
        // Keep employee update flow resilient if history logging fails.
      }

      return res.status(200).json({ success: true, data: updated });
    }
    
    const previousAssignedTo = String(task.assignedTo || '');
    const previousStatus = String(task.status || '');
    const previousReportSent = !!task.reportSent;
    const dueDateChanged = dueDate && task.dueDate?.getTime() !== new Date(dueDate).getTime();
    const reminderChanged = reminderEnabled !== undefined || reminderBefore !== undefined;

    task.title = title ?? task.title;
    task.description = description ?? task.description;
    task.assignedTo = assignedTo ? assignedTo : task.assignedTo;
    task.customerName = customerName ?? task.customerName;
    task.customerPhone = customerPhone ?? task.customerPhone;
    if (paymentReceived !== undefined) task.paymentReceived = !!paymentReceived;
    if (reportSent !== undefined) task.reportSent = !!reportSent;
    task.priority = priority ?? task.priority;
    task.status = status ?? task.status;
    if (task.status === 'Report Sent') {
      task.reportSent = true;
    }
    if (task.status === 'Completed' && !task.reportSent) {
      return res.status(400).json({ success: false, message: 'Mark report as sent before completing the task.' });
    }
    const parsedDueDate = parseDueDateInput(dueDate);
    if (parsedDueDate) {
      task.dueDate = parsedDueDate;
    }
    if (reminderEnabled !== undefined) task.reminderEnabled = reminderEnabled;
    if (reminderBefore !== undefined) task.reminderBefore = reminderBefore;

    await task.save();
    const updated = await Task.findById(task._id).populate('assignedTo', 'fullName email phone');

    try {
      const nextAssignedTo = String(task.assignedTo || '');
      const nextStatus = String(task.status || '');
      const resolvedClientId = await resolveClientIdByPhone(task.customerPhone || '');

      if (previousAssignedTo !== nextAssignedTo) {
        await logActivity({
          type: 'assignment',
          title: 'Task Assigned',
          referenceId: String(task._id),
          taskId: task._id,
          clientId: resolvedClientId,
          employeeId: task.assignedTo,
          description: `Task reassigned: ${task.title}`,
          metadata: {
            previousAssignedTo,
            nextAssignedTo,
          },
          adminOwner: task.adminOwner,
        });
      }

      if (previousStatus !== 'In Progress' && nextStatus === 'In Progress') {
        await logActivity({
          type: 'task',
          title: 'Task Picked',
          referenceId: String(task._id),
          taskId: task._id,
          clientId: resolvedClientId,
          employeeId: task.assignedTo,
          description: `Task started: ${task.title}`,
          metadata: { previousStatus, nextStatus },
          adminOwner: task.adminOwner,
        });
      }

      const reportJustSubmitted =
        (previousStatus !== 'Report Sent' && nextStatus === 'Report Sent')
        || (!previousReportSent && !!task.reportSent);

      if (reportJustSubmitted) {
        await logActivity({
          type: 'report',
          title: 'Report Send',
          referenceId: String(task._id),
          taskId: task._id,
          clientId: resolvedClientId,
          employeeId: task.assignedTo,
          description: `Report send for task: ${task.title}`,
          metadata: {
            status: nextStatus,
            reportSent: !!task.reportSent,
          },
          adminOwner: task.adminOwner,
        });
      }
    } catch (_) {
      // Keep task update resilient if history logging fails.
    }

    if ((dueDateChanged || reminderChanged) && task.reminderEnabled) {
      await rescheduleTaskReminder(updated);
    }

    res.status(200).json({ success: true, data: updated });
  } catch (error) {
    next(error);
  }
};

exports.deleteTask = async (req, res, next) => {
  try {
    const task = await Task.findOneAndDelete({ _id: req.params.id, ...(await buildAdminTaskScope(req.user)) });
    if (!task) {
      return res.status(404).json({ success: false, message: 'Task not found' });
    }
    res.status(200).json({ success: true, message: 'Task deleted successfully' });
  } catch (error) {
    next(error);
  }
};

exports.sendTaskReminder = async (req, res, next) => {
  try {
    const { id } = req.params;
    const task = await Task.findOne({ _id: id, ...(await buildAdminTaskScope(req.user)) }).select('_id');
    if (!task) {
      return res.status(404).json({ success: false, message: 'Task not found' });
    }

    const reminderLog = await sendManualReminder(id);
    res.status(200).json({ success: true, data: reminderLog });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.getTaskReminderLogs = async (req, res, next) => {
  try {
    const { taskId } = req.params;
    const task = await Task.findOne({ _id: taskId, ...(await buildAdminTaskScope(req.user)) }).select('_id');
    if (!task) {
      return res.status(404).json({ success: false, message: 'Task not found' });
    }

    const logs = await ReminderLog.find({ taskId })
      .populate('assignedTo', 'fullName email phone')
      .sort({ createdAt: -1 });
    res.status(200).json({ success: true, data: logs, count: logs.length });
  } catch (error) {
    next(error);
  }
};

exports.addTaskAttachment = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { url, fileName, mimeType, note } = req.body;

    if (!url || !fileName) {
      return res.status(400).json({ success: false, message: 'url and fileName are required.' });
    }

    const task = await Task.findOne({ _id: id, ...(await buildAdminTaskScope(req.user)) });
    if (!task) {
      return res.status(404).json({ success: false, message: 'Task not found' });
    }

    if (!isAdminUser(req.user)) {
      const assignedIds = await resolveAssignedIdsForUser(req.user);
      const taskAssignedId = String(task.assignedTo || '');
      if (!assignedIds.includes(taskAssignedId)) {
        return res.status(403).json({ success: false, message: 'Forbidden: not assigned to this task' });
      }
    }

    task.attachments.push({
      url,
      fileName,
      mimeType: mimeType || '',
      note: note || '',
      uploadedBy: req.user?._id,
      uploadedAt: new Date(),
    });

    await task.save();
    const updatedTask = await Task.findById(task._id).populate('assignedTo', 'fullName email phone');

    return res.status(200).json({ success: true, data: updatedTask });
  } catch (error) {
    next(error);
  }
};
