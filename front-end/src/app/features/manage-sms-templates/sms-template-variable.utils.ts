import { SmsTemplate } from './sms-template.service';

export interface SmsTemplateVariableSlot {
  index: number;
  label: string;
}

const DLT_HASH_VAR_PATTERN = /\{#\s*([^#]+?)\s*#\}/g;
const NUMERIC_VAR_PATTERN = /\{\{\s*(\d+)\s*\}\}/g;

/** Ordered placeholders from DLT template body ({#var#} or {{1}}). */
export const extractSmsTemplateVariableSlots = (content: string): SmsTemplateVariableSlot[] => {
  const body = String(content || '');
  const matches: Array<{ position: number; label: string }> = [];

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

export const resolveSmsTemplateVariableSlots = (
  template: SmsTemplate | null | undefined,
): SmsTemplateVariableSlot[] => extractSmsTemplateVariableSlots(template?.content || template?.templateContent || '');

export const renderSmsTemplatePreview = (
  content: string,
  variableValues: Record<number, string>,
): string => {
  const body = String(content || '');
  if (!body) {
    return '';
  }

  let slotIndex = 0;
  const withDltVars = body.replace(DLT_HASH_VAR_PATTERN, () => {
    const value = String(variableValues[slotIndex] ?? '').trim();
    slotIndex += 1;
    return value || '{#var#}';
  });

  return withDltVars.replace(NUMERIC_VAR_PATTERN, (_match, rawIndex) => {
    const key = Number(rawIndex) - 1;
    const value = String(variableValues[key] ?? variableValues[Number(rawIndex)] ?? '').trim();
    return value || `{{${rawIndex}}}`;
  });
};

export const buildSmsVariablesArray = (
  slots: SmsTemplateVariableSlot[],
  variableValues: Record<number, string>,
): string[] => slots.map((slot) => String(variableValues[slot.index] ?? '').trim());
