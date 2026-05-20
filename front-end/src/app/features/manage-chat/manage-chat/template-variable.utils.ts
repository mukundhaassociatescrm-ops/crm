import { WhatsAppTemplateOption } from './chat.service';

const TEMPLATE_VARIABLE_PATTERN = /\{\{\s*(\d+)\s*\}\}/g;

/** Extract `{{1}}`, `{{2}}`, … placeholders from template body (1-based indexes). */
export const extractTemplateVariableIndexes = (body: string): number[] => {
  const indexes = new Set<number>();
  const normalizedBody = String(body || '');
  const matches = normalizedBody.matchAll(TEMPLATE_VARIABLE_PATTERN);

  for (const match of matches) {
    const index = Number(match[1]);
    if (Number.isFinite(index) && index > 0) {
      indexes.add(index);
    }
  }

  return Array.from(indexes).sort((a, b) => a - b);
};

/** Prefer body placeholders; merge API `variables` when present. */
export const resolveTemplateVariableIndexes = (
  template: WhatsAppTemplateOption | null | undefined,
): number[] => {
  const fromBody = extractTemplateVariableIndexes(template?.body || '');
  const fromApi = Array.isArray(template?.variables)
    ? template.variables.filter((value) => Number.isFinite(value) && value > 0)
    : [];
  const merged = new Set<number>([...fromBody, ...fromApi]);
  return Array.from(merged).sort((a, b) => a - b);
};

export const getTemplateVariableCount = (
  template: WhatsAppTemplateOption | null | undefined,
): number => resolveTemplateVariableIndexes(template).length;
