const Client = require('../models/Client');
const Employee = require('../models/Employee');
const Task = require('../models/Task');
const Conversation = require('../models/Conversation');
const MessageLog = require('../models/MessageLog');
const Message = require('../models/Message');
const WhatsAppCampaign = require('../models/WhatsAppCampaign');
const ActivityHistory = require('../models/ActivityHistory');
const Poster = require('../models/Poster');
const { resolveAdminScopeForRead } = require('../services/activityHistoryService');

const OUTBOUND_DIRECTIONS = ['out', 'outgoing'];
const ACTIVE_CAMPAIGN_STATUSES = ['queued', 'processing', 'paused'];

const getStartOfToday = () => {
  const date = new Date();
  date.setHours(0, 0, 0, 0);
  return date;
};

exports.getOverview = async (req, res, next) => {
  try {
    const today = getStartOfToday();
    const historyScope = await resolveAdminScopeForRead(req.user);

    const [
      totalClients,
      activeEmployees,
      taskAgg,
      unreadAgg,
      smsAgg,
      whatsappChatAgg,
      activeCampaigns,
      historyItems,
      recentClients,
      recentCampaigns,
      topPosters,
    ] = await Promise.all([
      Client.countDocuments({}),
      Employee.countDocuments({ status: true }),
      Task.aggregate([
        {
          $group: {
            _id: '$status',
            count: { $sum: 1 },
          },
        },
      ]),
      Conversation.aggregate([
        { $group: { _id: null, total: { $sum: '$unreadCount' } } },
      ]),
      MessageLog.aggregate([
        { $match: { channel: 'sms', createdAt: { $gte: today } } },
        { $group: { _id: null, total: { $sum: '$successCount' } } },
      ]),
      Message.countDocuments({
        direction: { $in: OUTBOUND_DIRECTIONS },
        deleted: { $ne: true },
        $or: [{ timestamp: { $gte: today } }, { createdAt: { $gte: today } }],
      }),
      WhatsAppCampaign.countDocuments({ status: { $in: ACTIVE_CAMPAIGN_STATUSES } }),
      ActivityHistory.find({
        ...historyScope,
        title: { $in: ['Task Created', 'Task Assigned', 'Task Picked', 'Report Send', 'Payment Received'] },
      })
        .populate('clientId', 'name mobile')
        .populate('taskId', 'title')
        .populate('employeeId', 'fullName email')
        .sort({ createdAt: -1 })
        .limit(12),
      Client.find({ createdAt: { $gte: today } })
        .sort({ createdAt: -1 })
        .limit(8)
        .select('name mobile createdAt'),
      WhatsAppCampaign.find({ createdAt: { $gte: today } })
        .sort({ createdAt: -1 })
        .limit(8)
        .select('name label groupName status stats createdAt startedAt'),
      Poster.find({ viewCount: { $gt: 0 } })
        .sort({ updatedAt: -1 })
        .limit(5)
        .select('title slug viewCount updatedAt'),
    ]);

    const taskCounts = {
      total: 0,
      pending: 0,
      inProgress: 0,
      completed: 0,
    };

    taskAgg.forEach((row) => {
      const count = Number(row.count) || 0;
      taskCounts.total += count;
      if (row._id === 'Pending') {
        taskCounts.pending = count;
      } else if (row._id === 'In Progress') {
        taskCounts.inProgress = count;
      } else if (row._id === 'Completed') {
        taskCounts.completed = count;
      }
    });

    const whatsappCampaignToday = recentCampaigns.reduce((sum, campaign) => {
      const stats = campaign.stats || {};
      return sum + Number(stats.delivered || 0) + Number(stats.sessionSent || 0);
    }, 0);

    const activity = [];

    historyItems.forEach((item) => {
      activity.push({
        id: `history-${item._id}`,
        kind: mapHistoryKind(item),
        title: item.title,
        subtitle: buildHistorySubtitle(item),
        createdAt: item.createdAt,
      });
    });

    recentClients.forEach((client) => {
      activity.push({
        id: `client-${client._id}`,
        kind: 'client-added',
        title: 'Client added',
        subtitle: `${client.name || 'Client'} · ${client.mobile || ''}`.trim(),
        createdAt: client.createdAt,
      });
    });

    recentCampaigns.forEach((campaign) => {
      activity.push({
        id: `campaign-${campaign._id}`,
        kind: 'campaign-sent',
        title: 'Campaign sent',
        subtitle: campaign.label || campaign.name || campaign.groupName || 'WhatsApp campaign',
        createdAt: campaign.startedAt || campaign.createdAt,
      });
    });

    topPosters.forEach((poster) => {
      activity.push({
        id: `poster-${poster._id}`,
        kind: 'poster-viewed',
        title: 'Poster viewed',
        subtitle: `${poster.title || poster.slug} · ${Number(poster.viewCount) || 0} views`,
        createdAt: poster.updatedAt,
      });
    });

    activity.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

    return res.status(200).json({
      success: true,
      data: {
        kpis: {
          totalClients,
          activeEmployees,
          totalTasks: taskCounts.total,
          pendingTasks: taskCounts.pending,
          inProgressTasks: taskCounts.inProgress,
          completedTasks: taskCounts.completed,
          unreadChats: unreadAgg[0]?.total || 0,
          whatsappMessagesToday: whatsappChatAgg + whatsappCampaignToday,
          smsSentToday: smsAgg[0]?.total || 0,
          activeCampaigns,
        },
        activity: activity.slice(0, 12),
      },
    });
  } catch (error) {
    next(error);
  }
};

const mapHistoryKind = (item) => {
  const title = String(item.title || '').toLowerCase();
  if (title.includes('created')) {
    return 'task-created';
  }
  if (title.includes('completed') || title.includes('picked')) {
    return 'task-completed';
  }
  if (title.includes('report')) {
    return 'report-sent';
  }
  if (title.includes('payment')) {
    return 'payment-received';
  }
  if (title.includes('assigned')) {
    return 'task-assigned';
  }
  return 'task-updated';
};

const buildHistorySubtitle = (item) => {
  const taskTitle = typeof item.taskId === 'object' && item.taskId?.title
    ? item.taskId.title
    : '';
  const clientName = typeof item.clientId === 'object' && item.clientId?.name
    ? item.clientId.name
    : '';
  const employeeName = typeof item.employeeId === 'object' && item.employeeId?.fullName
    ? item.employeeId.fullName
    : '';

  const parts = [taskTitle, clientName, employeeName, item.description].filter(Boolean);
  return parts[0] || 'Activity recorded';
};
