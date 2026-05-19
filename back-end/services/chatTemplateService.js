const axios = require('axios');

const GUPSHUP_WA_API_BASE = 'https://api.gupshup.io/wa/app';
const TEMPLATE_REQUEST_TIMEOUT_MS = 20000;

const CACHE_TTL_MS = Math.max(30000, Number(process.env.WHATSAPP_TEMPLATE_CACHE_TTL_MS || 5 * 60 * 1000));
const cacheByLanguage = new Map();

const APPROVED_STATUSES = new Set([
  'approved',
  'active',
  'enabled',
  'live',
  'published',
  'not rated',
  'not_rated',
  'sandbox',
  'unrated',
]);
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

const resolveGupshupAppId = () => normalizeText(process.env.GUPSHUP_APP_ID);

const resolveGupshupApiKey = () => normalizeText(process.env.GUPSHUP_API_KEY || process.env.GUPSHUP_APIKEY);

const buildWhatsappTemplatesUrl = (appId) => (
  `${GUPSHUP_WA_API_BASE}/${encodeURIComponent(appId)}/template`
);

const parseTemplateDataBody = (data) => {
  if (!data) {
    return '';
  }

  if (typeof data === 'string') {
    const trimmed = data.trim();
    if (!trimmed) {
      return '';
    }
    if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
      try {
        const parsed = JSON.parse(trimmed);
        return extractTemplateBody(parsed) || trimmed;
      } catch (_error) {
        return trimmed;
      }
    }
    return trimmed;
  }

  return extractTemplateBody(data) || normalizeText(data);
};

const mapGupshupWaTemplate = (rawTemplate) => {
  const body = parseTemplateDataBody(rawTemplate?.data);
  const id = normalizeText(rawTemplate?.id);
  if (!id) {
    return null;
  }

  const name = normalizeText(rawTemplate?.elementName || rawTemplate?.name || id);
  const language = normalizeLanguage(rawTemplate?.languageCode || rawTemplate?.language) || 'en';

  return {
    id,
    name,
    body,
    status: normalizeText(rawTemplate?.status).toLowerCase() || 'approved',
    category: toCategoryLabel(rawTemplate?.category),
    language,
    variables: extractVariables(body),
  };
};

const normalizeTemplate = (rawTemplate) => {
  const id = normalizeText(rawTemplate?.id || rawTemplate?.templateId || rawTemplate?.template_id || rawTemplate?.name);
  if (!id) {
    return null;
  }

  const name = normalizeText(
    rawTemplate?.elementName
    || rawTemplate?.name
    || rawTemplate?.templateName
    || rawTemplate?.displayName
    || id,
  );
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

const logEnvCheck = () => {
  const appId = resolveGupshupAppId();
  const apiKey = resolveGupshupApiKey();

  console.log('[ENV CHECK]', {
    hasAppId: Boolean(appId),
    hasApiKey: Boolean(apiKey),
    appId: appId || '(missing)',
    apiKeyLength: apiKey ? apiKey.length : 0,
  });

  return { appId, apiKey };
};

const logParsedTemplateSummary = (rawTemplates, parsedTemplates) => {
  const rawList = Array.isArray(rawTemplates) ? rawTemplates : [];
  const parsedList = Array.isArray(parsedTemplates) ? parsedTemplates : [];

  console.log('[PARSED TEMPLATE SUMMARY]', {
    templateCount: parsedList.length,
    rawTemplateCount: rawList.length,
    templateNames: parsedList.map((template) => template.name || template.id),
    approvedCount: parsedList.filter((template) => (
      APPROVED_STATUSES.has(String(template.status || '').toLowerCase())
    )).length,
    rawStatuses: rawList.map((template) => template?.status || template?.templateStatus || 'unknown'),
    rawElementNames: rawList.map((template) => template?.elementName || template?.name || ''),
  });
};

const fetchTemplatesFromProvider = async () => {
  console.log('[TEMPLATE FETCH START]');

  const { appId, apiKey } = logEnvCheck();

  if (!appId) {
    throw new Error('GUPSHUP_APP_ID is missing');
  }
  if (!apiKey) {
    throw new Error('GUPSHUP_API_KEY is missing');
  }

  const finalTemplateUrl = buildWhatsappTemplatesUrl(appId);
  const requestUrl = `${finalTemplateUrl}?templateStatus=APPROVED`;

  console.log('[FINAL TEMPLATE URL]', requestUrl);

  const requestConfig = {
    method: 'GET',
    headers: {
      apikey: apiKey,
      Accept: 'application/json',
    },
    params: {
      templateStatus: 'APPROVED',
    },
    timeout: TEMPLATE_REQUEST_TIMEOUT_MS,
  };

  console.log('[TEMPLATE REQUEST CONFIG]', {
    method: requestConfig.method,
    headers: {
      apikey: apiKey ? 'present' : 'missing',
      Accept: requestConfig.headers.Accept,
    },
    timeout: requestConfig.timeout,
    params: requestConfig.params,
  });

  try {
    const response = await axios.get(finalTemplateUrl, {
      headers: requestConfig.headers,
      params: requestConfig.params,
      timeout: requestConfig.timeout,
    });

    console.log('[RAW GUPSHUP TEMPLATE RESPONSE]', {
      status: response.status,
      statusText: response.statusText,
      data: response.data,
    });

    const responseStatus = String(response.data?.status || '').toLowerCase();
    if (responseStatus !== 'success') {
      console.log('[API FAILURE] Gupshup returned non-success status field', {
        responseStatus: response.data?.status,
      });
      throw new Error(`Gupshup templates API returned status: ${response.data?.status || 'unknown'}`);
    }

    if (!Array.isArray(response.data?.templates)) {
      console.log('[API FAILURE] Gupshup response missing templates array', {
        dataKeys: Object.keys(response.data || {}),
      });
      throw new Error('Gupshup templates API response missing templates array');
    }

    const rawTemplates = response.data.templates;
    const templates = rawTemplates
      .map((item) => mapGupshupWaTemplate(item))
      .filter(Boolean);

    logParsedTemplateSummary(rawTemplates, templates);

    if (!rawTemplates.length) {
      console.log('[NO TEMPLATES RETURNED FROM GUPSHUP]', {
        reason: 'templates_array_empty',
        appId,
        requestUrl,
      });
    } else if (!templates.length) {
      console.log('[NO TEMPLATES RETURNED FROM GUPSHUP]', {
        reason: 'all_templates_failed_mapping_or_filter',
        rawCount: rawTemplates.length,
        appId,
        requestUrl,
      });
    } else {
      console.log('[API SUCCESS] Gupshup returned mapped templates', {
        count: templates.length,
        source: 'API',
      });
    }

    return {
      success: true,
      templates,
      source: 'API',
    };
  } catch (error) {
    console.log('[TEMPLATE FETCH ERROR]', {
      message: error.message,
      status: error.response?.status,
      responseData: error.response?.data,
      url: requestUrl,
    });
    throw error;
  }
};

const loadFallbackTemplates = (language = '') => {
  const normalizedLanguage = normalizeLanguage(language);
  const fallbackTemplates = readFallbackTemplatesFromEnv();
  if (!normalizedLanguage) {
    return fallbackTemplates;
  }
  return fallbackTemplates.filter((template) => template.language === normalizedLanguage);
};

const getApprovedTemplates = async ({ language, forceRefresh = false } = {}) => {
  const normalizedLanguage = normalizeLanguage(language);

  console.log('[getApprovedTemplates] start', {
    language: normalizedLanguage || 'all',
    forceRefresh,
  });

  if (!forceRefresh) {
    const cached = readCache(normalizedLanguage);
    if (cached) {
      console.log('[TEMPLATE CACHE HIT]', {
        source: 'CACHE',
        templateCount: cached.length,
        templateNames: cached.map((template) => template.name || template.id),
      });
      return { success: true, templates: cached, source: 'CACHE' };
    }
  }

  try {
    const providerResult = await fetchTemplatesFromProvider();
    const beforeFilterCount = (providerResult.templates || []).length;
    let normalizedTemplates = (providerResult.templates || [])
      .filter((template) => !template.status || APPROVED_STATUSES.has(template.status));

    const afterStatusFilterCount = normalizedTemplates.length;

    if (normalizedLanguage) {
      normalizedTemplates = normalizedTemplates.filter(
        (template) => template.language === normalizedLanguage,
      );
    }

    if (beforeFilterCount > 0 && normalizedTemplates.length === 0) {
      console.log('[NO TEMPLATES AFTER FILTER]', {
        beforeFilterCount,
        afterStatusFilterCount,
        languageFilter: normalizedLanguage || 'none',
        hint: 'Templates returned from Gupshup but removed by status/language filters',
      });
    }

    writeCache(normalizedLanguage, normalizedTemplates);

    if (!normalizedTemplates.length) {
      console.log('[API EMPTY] Gupshup call succeeded but no templates available for UI', {
        source: 'API',
        language: normalizedLanguage || 'all',
      });
    } else {
      console.log('[API SUCCESS] Returning templates from Gupshup', {
        success: true,
        source: 'API',
        templateCount: normalizedTemplates.length,
      });
    }

    return { success: true, templates: normalizedTemplates, source: 'API' };
  } catch (error) {
    console.log('[TEMPLATE FETCH ERROR]', {
      message: error.message,
      status: error.response?.status,
      responseData: error.response?.data,
      url: error.config?.url || buildWhatsappTemplatesUrl(resolveGupshupAppId()),
    });

    const staleCache = cacheByLanguage.get(toCacheKey(normalizedLanguage));
    if (staleCache?.templates?.length) {
      console.log('[FALLBACK TEMPLATE USED]', {
        mode: 'stale_cache',
        source: 'CACHE',
        templateCount: staleCache.templates.length,
      });
      return { success: true, templates: staleCache.templates, source: 'CACHE' };
    }

    const filteredFallback = loadFallbackTemplates(normalizedLanguage);
    console.log('[FALLBACK TEMPLATE USED]', {
      mode: 'WHATSAPP_FALLBACK_TEMPLATES_JSON',
      source: 'FALLBACK',
      templateCount: filteredFallback.length,
      templateNames: filteredFallback.map((template) => template.name || template.id),
    });

    if (!filteredFallback.length) {
      console.log('[API FAILURE] No fallback templates configured — returning empty list', {
        success: true,
        source: 'FALLBACK',
      });
    }

    writeCache(normalizedLanguage, filteredFallback);
    return { success: true, templates: filteredFallback, source: 'FALLBACK' };
  }
};

const unwrapTemplateResult = (result) => {
  if (Array.isArray(result)) {
    return { success: true, templates: result, source: 'API' };
  }

  const source = result?.source === 'HARDCODED' ? 'FALLBACK' : (result?.source || 'API');
  return {
    success: result?.success !== false,
    templates: Array.isArray(result?.templates) ? result.templates : [],
    source,
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
