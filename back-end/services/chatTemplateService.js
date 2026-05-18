const axios = require('axios');

const CACHE_TTL_MS = Math.max(30000, Number(process.env.WHATSAPP_TEMPLATE_CACHE_TTL_MS || 5 * 60 * 1000));
const cacheByLanguage = new Map();

const APPROVED_STATUSES = new Set(['approved', 'active', 'enabled', 'live', 'published', 'not rated', 'not_rated', 'sandbox', 'unrated']);
const REJECTED_OR_INACTIVE = new Set(['rejected', 'draft', 'disabled', 'inactive', 'paused', 'archived', 'failed', 'deactivated']);

const normalizeText = (value) => String(value || '').trim();

const normalizeLanguage = (value) => {
  const language = normalizeText(value).toLowerCase();
  if (!language) {
    return '';
  }

  return language.replace('_', '-');
};

const toCategoryLabel = (value) => {
  const raw = normalizeText(value);
  if (!raw) {
    return 'Utility';
  }

  const normalized = raw.toLowerCase();
  if (normalized === 'marketing') {
    return 'Marketing';
  }
  if (normalized === 'authentication') {
    return 'Authentication';
  }
  return 'Utility';
};

const extractBodyFromComponents = (components) => {
  if (!Array.isArray(components)) {
    return '';
  }

  const bodyComponent = components.find((component) => {
    const type = normalizeText(component?.type || component?.component_type).toLowerCase();
    return type === 'body';
  });

  if (!bodyComponent) {
    return '';
  }

  return normalizeText(
    bodyComponent.text
    || bodyComponent.template
    || bodyComponent.example
    || bodyComponent.value
  );
};

const extractTemplateBody = (template) => {
  return normalizeText(
    template.body
    || template.content
    || template.message
    || template.preview
    || extractBodyFromComponents(template.components)
  );
};

const extractVariables = (body) => {
  const matches = [...String(body || '').matchAll(/\{\{\s*(\d+)\s*\}\}/g)];
  const indexes = [...new Set(matches.map((match) => Number(match[1])).filter(Number.isFinite))];
  return indexes.sort((a, b) => a - b);
};

const normalizeTemplate = (rawTemplate) => {
  const id = normalizeText(rawTemplate?.id || rawTemplate?.templateId || rawTemplate?.template_id || rawTemplate?.name);
  if (!id) {
    return null;
  }

  const name = normalizeText(rawTemplate?.name || rawTemplate?.templateName || rawTemplate?.displayName || id);
  const status = normalizeText(rawTemplate?.status || rawTemplate?.state || rawTemplate?.templateStatus).toLowerCase();
  const category = toCategoryLabel(rawTemplate?.category || rawTemplate?.type || rawTemplate?.templateCategory);
  const language = normalizeLanguage(rawTemplate?.language || rawTemplate?.languageCode || rawTemplate?.locale);
  const body = extractTemplateBody(rawTemplate);
  const variables = extractVariables(body);

  return {
    id,
    name,
    status,
    category,
    language: language || 'en',
    body,
    variables,
  };
};

const toCacheKey = (language) => normalizeLanguage(language || '') || 'all';

const readCache = (language) => {
  const cacheEntry = cacheByLanguage.get(toCacheKey(language));
  if (!cacheEntry) {
    return null;
  }

  if (Date.now() > cacheEntry.expiresAt) {
    return null;
  }

  return cacheEntry.templates;
};

const writeCache = (language, templates) => {
  cacheByLanguage.set(toCacheKey(language), {
    templates,
    expiresAt: Date.now() + CACHE_TTL_MS,
  });
};

const extractTemplateList = (providerResponse) => {
  if (!providerResponse) {
    return [];
  }

  if (Array.isArray(providerResponse)) {
    return providerResponse;
  }

  if (Array.isArray(providerResponse.templates)) {
    return providerResponse.templates;
  }

  if (Array.isArray(providerResponse.data)) {
    return providerResponse.data;
  }

  if (Array.isArray(providerResponse.result)) {
    return providerResponse.result;
  }

  if (Array.isArray(providerResponse.results)) {
    return providerResponse.results;
  }

  if (Array.isArray(providerResponse.items)) {
    return providerResponse.items;
  }

  return [];
};

const readFallbackTemplatesFromEnv = () => {
  const raw = normalizeText(
    process.env.WHATSAPP_FALLBACK_TEMPLATES_JSON
    || process.env.WHATSAPP_TEMPLATE_FALLBACK_JSON
  );
  if (!raw) {
    return [];
  }

  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) {
      return [];
    }

    return parsed
      .map((item) => normalizeTemplate({
        ...item,
        status: item?.status || 'approved',
      }))
      .filter(Boolean)
      .filter((template) => APPROVED_STATUSES.has(template.status))
      .map((template) => ({
        id: template.id,
        name: template.name,
        category: template.category,
        language: template.language,
        body: template.body,
        variables: template.variables,
      }));
  } catch (error) {
    console.warn('[chatTemplateService] Failed to parse WHATSAPP_FALLBACK_TEMPLATES_JSON:', error?.message || error);
    return [];
  }
};

const fetchTemplatesFromProvider = async () => {
  const templatesUrl = normalizeText(process.env.GUPSHUP_TEMPLATES_URL || process.env.WHATSAPP_PROVIDER_TEMPLATES_URL);
  if (!templatesUrl) {
    throw new Error('GUPSHUP_TEMPLATES_URL is not configured.');
  }

  const apiKey = normalizeText(process.env.GUPSHUP_API_KEY || process.env.GUPSHUP_APIKEY);
  const authToken = normalizeText(process.env.WHATSAPP_PROVIDER_AUTH_TOKEN);
  const sourceName = normalizeText(process.env.GUPSHUP_SRC_NAME);

  const headers = {
    Accept: 'application/json',
  };

  if (apiKey) {
    headers.apikey = apiKey;
  }
  if (authToken) {
    headers.Authorization = authToken.startsWith('Bearer ') ? authToken : `Bearer ${authToken}`;
  }

  const response = await axios.get(templatesUrl, {
    headers,
    params: sourceName ? { appName: sourceName } : undefined,
    timeout: 20000,
  });

  return extractTemplateList(response.data);
};

const getApprovedTemplates = async ({ language, forceRefresh = false } = {}) => {
  const normalizedLanguage = normalizeLanguage(language);

  if (!forceRefresh) {
    const cached = readCache(normalizedLanguage);
    if (cached) {
      console.log('[TEMPLATE SOURCE]', { source: 'CACHE', count: cached.length });
      return { templates: cached, source: 'CACHE' };
    }
  }

  try {
    console.log('[BACKEND TEMPLATE FETCH CALLED]', {
      url: process.env.GUPSHUP_TEMPLATES_URL || process.env.WHATSAPP_PROVIDER_TEMPLATES_URL || '',
    });
    const rawTemplates = await fetchTemplatesFromProvider();
    const normalizedTemplates = rawTemplates
      .map(normalizeTemplate)
      .filter(Boolean)
      .filter((template) => {
        // Only include templates that are explicitly in the approved set.
        // Templates with missing/unknown status are treated as not approved.
        if (!template.status || !APPROVED_STATUSES.has(template.status)) {
          return false;
        }

        return true;
      })
      .filter((template) => {
        if (!normalizedLanguage) {
          return true;
        }

        return template.language === normalizedLanguage;
      })
      .map((template) => ({
        id: template.id,
        name: template.name,
        category: template.category,
        language: template.language,
        body: template.body,
        variables: template.variables,
      }));

    writeCache(normalizedLanguage, normalizedTemplates);
    console.log('[TEMPLATE SOURCE]', { source: 'API', count: normalizedTemplates.length });
    return { templates: normalizedTemplates, source: 'API' };
  } catch (error) {
    if (String(error?.message || '').includes('GUPSHUP_TEMPLATES_URL is not configured.')) {
      const fallbackTemplates = readFallbackTemplatesFromEnv();
      const filteredFallback = normalizedLanguage
        ? fallbackTemplates.filter((template) => template.language === normalizedLanguage)
        : fallbackTemplates;

      if (filteredFallback.length) {
        console.warn('[chatTemplateService] Provider URL missing. Using fallback templates from env.');
      } else {
        console.warn('[chatTemplateService] Template provider URL is not configured. Returning empty template list.');
      }

      writeCache(normalizedLanguage, filteredFallback);
      console.log('[TEMPLATE SOURCE]', { source: 'HARDCODED', count: filteredFallback.length });
      return { templates: filteredFallback, source: 'HARDCODED' };
    }

    const fallback = cacheByLanguage.get(toCacheKey(normalizedLanguage));
    if (fallback?.templates?.length) {
      console.warn('[chatTemplateService] Using cached template fallback due to provider fetch error:', error?.message || error);
      console.log('[TEMPLATE SOURCE]', { source: 'CACHE', count: fallback.templates.length });
      return { templates: fallback.templates, source: 'CACHE' };
    }

    throw error;
  }
};

const unwrapTemplateResult = (result) => {
  if (Array.isArray(result)) {
    return { templates: result, source: 'API' };
  }
  return {
    templates: Array.isArray(result?.templates) ? result.templates : [],
    source: result?.source || 'API',
  };
};

const invalidateTemplateCache = () => {
  cacheByLanguage.clear();
};

module.exports = {
  getApprovedTemplates,
  unwrapTemplateResult,
  invalidateTemplateCache,
};
