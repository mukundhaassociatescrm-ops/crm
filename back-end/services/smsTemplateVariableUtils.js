const DLT_HASH_VAR_PATTERN = /\{#\s*([^#]+?)\s*#\}/g;
const NUMERIC_VAR_PATTERN = /\{\{\s*(\d+)\s*\}\}/g;

const extractSmsTemplateVariableSlots = (content) => {
  const body = String(content || '');
  const matches = [];

  for (const match of body.matchAll(DLT_HASH_VAR_PATTERN)) {
    if (match.index === undefined) {
      continue;
    }
    matches.push({
      position: match.index,
      label: String(match[1] || '').trim() || `var${matches.length + 1}`,
    });
  }

  for (const match of body.matchAll(NUMERIC_VAR_PATTERN)) {
    if (match.index === undefined) {
      continue;
    }
    matches.push({
      position: match.index,
      label: String(match[1] || '').trim(),
    });
  }

  matches.sort((a, b) => a.position - b.position);

  return matches.map((item, index) => ({
    index,
    label: item.label,
  }));
};

const buildVariablesValues = (slots, variables = []) => {
  if (!slots.length) {
    return '';
  }

  return slots
    .map((slot) => String(variables[slot.index] ?? variables[slot.label] ?? '').trim())
    .join('|');
};

module.exports = {
  extractSmsTemplateVariableSlots,
  buildVariablesValues,
};
