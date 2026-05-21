const XLSX = require('xlsx');
const SmsTemplate = require('../models/SmsTemplate');

const IMPORT_ACCEPTED_EXTENSIONS = new Set(['.xls', '.xlsx']);
const IMPORT_ACCEPTED_MIME_TYPES = new Set([
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/octet-stream',
]);

const COLUMN_ALIASES = {
  dltMessageId: ['message_id', 'message id', 'dlt message id', 'fast2sms message id'],
  contentTemplateId: [
    'template_id',
    'template id',
    'content_template_id',
    'content template id',
    'dlt template id',
  ],
  entityId: ['entity_id', 'entity id', 'principal entity id'],
  templateName: ['template_name', 'template name'],
  templateContent: ['template_content', 'template content', 'content'],
  sampleContent: ['sample_content', 'sample content'],
  senderId: ['header', 'sender_id', 'sender id', 'senderid'],
  category: ['category'],
  templateType: ['template_type', 'template type', 'type'],
  verificationStatus: ['verification_status', 'verification status'],
  jioStatus: ['jio_status', 'jio status'],
  approvalDate: ['approval_date', 'approval date'],
  validTill: ['valid_till', 'valid till', 'validity', 'valid till date'],
};

const normalizeHeaderKey = (value) => String(value || '').trim().toLowerCase().replace(/\s+/g, ' ');

const detectFileType = (file) => {
  const originalName = String(file?.originalname || '').toLowerCase();
  const mimeType = String(file?.mimetype || '').toLowerCase();

  if (originalName.endsWith('.xlsx') || mimeType.includes('spreadsheetml')) {
    return 'xlsx';
  }
  if (originalName.endsWith('.xls') || mimeType === 'application/vnd.ms-excel') {
    return 'xls';
  }
  return 'unknown';
};

const resolveColumnMap = (headers = []) => {
  const normalizedHeaders = headers.map((header) => normalizeHeaderKey(header));
  const columnMap = {};

  Object.keys(COLUMN_ALIASES).forEach((field) => {
    columnMap[field] = null;
    normalizedHeaders.forEach((header, index) => {
      if (columnMap[field]) {
        return;
      }
      if (COLUMN_ALIASES[field].includes(header)) {
        columnMap[field] = headers[index];
      }
    });
  });

  return columnMap;
};

const parseExcelBuffer = (buffer, fileType) => {
  const workbook = XLSX.read(buffer, { type: 'buffer', cellDates: true });
  const sheetName = workbook.SheetNames[0];
  if (!sheetName) {
    return { headers: [], rows: [], parser: fileType };
  }

  const sheet = workbook.Sheets[sheetName];
  const matrix = XLSX.utils.sheet_to_json(sheet, {
    header: 1,
    defval: '',
    raw: false,
  });

  const headers = (matrix[0] || []).map((cell) => String(cell || '').trim());
  const rows = matrix.slice(1)
    .filter((row) => Array.isArray(row) && row.some((cell) => String(cell || '').trim()))
    .map((row) => {
      const record = {};
      headers.forEach((header, index) => {
        if (!header) {
          return;
        }
        record[header] = row[index] ?? '';
      });
      return record;
    });

  return { headers, rows, parser: fileType };
};

const getCellValue = (row, columnName) => {
  if (!columnName) {
    return '';
  }
  const value = row[columnName];
  if (value instanceof Date) {
    return value;
  }
  return String(value ?? '').trim();
};

const parseVerificationStatus = (value) => {
  const normalized = String(value ?? '').trim().toLowerCase();
  if (!normalized) {
    return false;
  }
  return ['true', 'yes', 'y', '1', 'verified', 'approved', 'active'].includes(normalized);
};

const isJioStatusActive = (value) => String(value ?? '').trim().toLowerCase() === 'active';

const parseDateValue = (value) => {
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return value;
  }
  const raw = String(value ?? '').trim();
  if (!raw) {
    return null;
  }
  const parsed = new Date(raw);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
};

const buildTemplatePayload = (row, columnMap) => {
  const dltMessageId = getCellValue(row, columnMap.dltMessageId);
  const contentTemplateId = getCellValue(row, columnMap.contentTemplateId);
  const entityId = getCellValue(row, columnMap.entityId);

  if (!contentTemplateId) {
    return null;
  }

  const crmTemplateId = contentTemplateId;

  const verificationStatus = parseVerificationStatus(getCellValue(row, columnMap.verificationStatus));
  const jioStatus = getCellValue(row, columnMap.jioStatus);
  const isActive = verificationStatus && isJioStatusActive(jioStatus);

  return {
    templateId: crmTemplateId,
    messageId: dltMessageId || '',
    dltMessageId: dltMessageId || '',
    contentTemplateId: contentTemplateId || '',
    entityId,
    templateName: getCellValue(row, columnMap.templateName),
    templateContent: getCellValue(row, columnMap.templateContent),
    sampleContent: getCellValue(row, columnMap.sampleContent),
    senderId: getCellValue(row, columnMap.senderId),
    category: getCellValue(row, columnMap.category),
    templateType: getCellValue(row, columnMap.templateType),
    verificationStatus,
    jioStatus,
    approvalDate: parseDateValue(getCellValue(row, columnMap.approvalDate)),
    validTill: parseDateValue(getCellValue(row, columnMap.validTill)),
    isActive,
  };
};

const TRACKED_FIELDS = [
  'dltMessageId',
  'contentTemplateId',
  'entityId',
  'templateName',
  'templateContent',
  'sampleContent',
  'senderId',
  'category',
  'templateType',
  'verificationStatus',
  'jioStatus',
  'approvalDate',
  'validTill',
  'isActive',
];

const hasTemplateChanged = (existing, nextPayload) => TRACKED_FIELDS.some((field) => {
  if (field === 'approvalDate' || field === 'validTill') {
    const existingTime = existing[field] ? new Date(existing[field]).getTime() : null;
    const nextTime = nextPayload[field] ? new Date(nextPayload[field]).getTime() : null;
    return existingTime !== nextTime;
  }
  return String(existing[field] ?? '') !== String(nextPayload[field] ?? '');
});

const buildExistingLookup = (payload) => {
  const clauses = [{ templateId: payload.templateId }];

  if (payload.dltMessageId) {
    clauses.push({ dltMessageId: payload.dltMessageId });
  }
  if (payload.contentTemplateId) {
    clauses.push({ contentTemplateId: payload.contentTemplateId });
  }

  return { $or: clauses };
};

const importSmsTemplatesFromFile = async (file) => {
  console.log('[SMS TEMPLATE IMPORT START]', {
    fileName: file?.originalname || '',
    mimeType: file?.mimetype || '',
    size: file?.size || 0,
  });

  if (!file?.buffer) {
    throw new Error('No import file provided.');
  }

  const fileType = detectFileType(file);
  if (!IMPORT_ACCEPTED_EXTENSIONS.has(`.${fileType}`) && fileType === 'unknown') {
    throw new Error('Unsupported file type. Allowed: .xls, .xlsx');
  }

  const { headers, rows, parser } = parseExcelBuffer(file.buffer, fileType);
  const columnMap = resolveColumnMap(headers);

  console.log('[SMS TEMPLATE COLUMN MAP]', {
    headers,
    columnMap,
    note: 'Fast2SMS route dlt uses MESSAGE_ID -> dltMessageId, not TEMPLATE_ID',
  });

  if (!columnMap.contentTemplateId) {
    throw new Error('Excel must include TEMPLATE_ID column.');
  }

  const summary = {
    parsed: 0,
    created: 0,
    updated: 0,
    skipped: 0,
    inactive: 0,
    errors: 0,
    missingMessageId: 0,
  };

  for (const row of rows) {
    summary.parsed += 1;

    console.log('[SMS TEMPLATE RAW IMPORT]', {
      rowNumber: summary.parsed,
      rowData: row,
    });

    const payload = buildTemplatePayload(row, columnMap);

    if (!payload) {
      summary.skipped += 1;
      console.log('[SMS TEMPLATE SKIPPED]', {
        reason: 'missing_ids',
        rowNumber: summary.parsed,
      });
      continue;
    }

    if (!payload.dltMessageId) {
      summary.missingMessageId += 1;
    }

    console.log('[SMS TEMPLATE ROW PARSED]', {
      templateId: payload.templateId,
      dltMessageId: payload.dltMessageId || '(missing)',
      contentTemplateId: payload.contentTemplateId || '(missing)',
      entityId: payload.entityId || '(missing)',
      templateName: payload.templateName,
      verificationStatus: payload.verificationStatus,
      jioStatus: payload.jioStatus,
      isActive: payload.isActive,
    });

    if (!payload.isActive) {
      summary.inactive += 1;
    }

    try {
      const existing = await SmsTemplate.findOne(buildExistingLookup(payload));

      if (!existing) {
        await SmsTemplate.create(payload);
        summary.created += 1;
        console.log('[SMS TEMPLATE SAVED]', {
          templateId: payload.templateId,
          dltMessageId: payload.dltMessageId,
          action: 'created',
          isActive: payload.isActive,
        });
        continue;
      }

      if (!hasTemplateChanged(existing, payload)) {
        summary.skipped += 1;
        console.log('[SMS TEMPLATE SKIPPED]', {
          templateId: payload.templateId,
          reason: 'duplicate_unchanged',
        });
        continue;
      }

      TRACKED_FIELDS.forEach((field) => {
        if (field === 'dltMessageId') {
          if (payload.dltMessageId) {
            existing.dltMessageId = payload.dltMessageId;
            existing.messageId = payload.dltMessageId;
          }
          return;
        }
        existing[field] = payload[field];
      });
      existing.templateId = payload.templateId;
      await existing.save();
      summary.updated += 1;
      console.log('[SMS TEMPLATE SAVED]', {
        templateId: payload.templateId,
        dltMessageId: payload.dltMessageId,
        action: 'updated',
        isActive: payload.isActive,
      });
    } catch (error) {
      summary.errors += 1;
      console.log('[SMS TEMPLATE SKIPPED]', {
        templateId: payload.templateId,
        reason: 'save_error',
        message: error?.message || String(error),
      });
    }
  }

  console.log('[SMS TEMPLATE IMPORT SUMMARY]', {
    parser,
    headersFound: headers.length,
    ...summary,
  });

  return summary;
};

module.exports = {
  IMPORT_ACCEPTED_EXTENSIONS,
  IMPORT_ACCEPTED_MIME_TYPES,
  importSmsTemplatesFromFile,
};
