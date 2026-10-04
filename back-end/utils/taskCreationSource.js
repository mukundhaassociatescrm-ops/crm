const TASK_CREATION_SOURCES = Object.freeze(['CRM', 'CALL_TRACKER']);
const TASK_CREATION_SOURCE_SET = new Set(TASK_CREATION_SOURCES);

const resolveTaskCreationSource = (value) => {
  if (value === undefined) {
    return 'CRM';
  }

  return TASK_CREATION_SOURCE_SET.has(value) ? value : null;
};

const applyTaskCreationSourceFilter = (query, value) => {
  if (value === undefined) {
    return true;
  }

  if (!TASK_CREATION_SOURCE_SET.has(value)) {
    return false;
  }

  query.createdFrom = value;
  return true;
};

module.exports = {
  TASK_CREATION_SOURCES,
  resolveTaskCreationSource,
  applyTaskCreationSourceFilter,
};