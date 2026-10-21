const TASK_STAGES = ['active', 'payment', 'report'];

// Tasks flow through three stages: open work, completed awaiting payment, and completed + paid.
const TASK_STAGE_FILTERS = {
  active: { status: { $ne: 'Completed' } },
  payment: { status: 'Completed', paymentReceived: { $ne: true } },
  report: { status: 'Completed', paymentReceived: true },
};

/**
 * Returns the Mongo filter for a stage, undefined when no stage was requested,
 * or null when the stage value is invalid.
 */
const resolveTaskStageFilter = (stage) => {
  if (stage === undefined || stage === null || String(stage).trim() === '') {
    return undefined;
  }

  const normalized = String(stage).trim().toLowerCase();
  return TASK_STAGE_FILTERS[normalized] || null;
};

module.exports = {
  TASK_STAGES,
  resolveTaskStageFilter,
};
