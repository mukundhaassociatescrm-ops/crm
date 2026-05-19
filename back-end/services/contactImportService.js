const csv = require('csv-parse/sync');
const XLSX = require('xlsx');
const Client = require('../models/Client');
const Group = require('../models/Group');
const { formatMobile } = require('../utils/phoneUtils');

const IMPORT_ACCEPTED_EXTENSIONS = new Set(['.csv', '.xls', '.xlsx']);
const IMPORT_ACCEPTED_MIME_TYPES = new Set([
  'text/csv',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/octet-stream',
]);

const COLUMN_ALIASES = {
  name: ['name', 'client name', 'customer name', 'contact name'],
  phone: ['mobile', 'phone', 'phone 1 - value', 'phone1', 'phone 1', 'phone number', 'primary phone'],
  alternateMobile: ['alternatemobile', 'alternate mobile', 'alt mobile', 'phone 2', 'phone 2 - value'],
  group: ['group', 'groups', 'category', 'segment'],
};

const normalizeHeaderKey = (value) => String(value || '').trim().toLowerCase().replace(/\s+/g, ' ');

const escapeRegex = (value) => String(value || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const detectFileType = (file) => {
  const originalName = String(file?.originalname || '').toLowerCase();
  const mimeType = String(file?.mimetype || '').toLowerCase();

  if (originalName.endsWith('.csv') || mimeType === 'text/csv') {
    return 'csv';
  }
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
  const columnMap = {
    nameColumn: null,
    phoneColumn: null,
    alternateMobileColumn: null,
    groupColumn: null,
  };

  normalizedHeaders.forEach((header, index) => {
    const rawHeader = headers[index];
    if (COLUMN_ALIASES.name.includes(header)) {
      columnMap.nameColumn = rawHeader;
    }
    if (COLUMN_ALIASES.phone.includes(header)) {
      columnMap.phoneColumn = rawHeader;
    }
    if (COLUMN_ALIASES.alternateMobile.includes(header)) {
      columnMap.alternateMobileColumn = rawHeader;
    }
    if (COLUMN_ALIASES.group.includes(header)) {
      columnMap.groupColumn = rawHeader;
    }
  });

  return columnMap;
};

const parseCsvBuffer = (buffer) => {
  const text = buffer.toString('utf8');
  const records = csv.parse(text, {
    columns: true,
    skip_empty_lines: true,
    trim: true,
  });

  const headers = records.length > 0 ? Object.keys(records[0]) : [];
  return { headers, rows: records, parser: 'csv-parse' };
};

const parseExcelBuffer = (buffer, fileType) => {
  const workbook = XLSX.read(buffer, { type: 'buffer', cellDates: false });
  const sheetName = workbook.SheetNames[0];
  if (!sheetName) {
    return { headers: [], rows: [], parser: fileType === 'xls' ? 'xlsx-xls' : 'xlsx' };
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
        record[header] = String(row[index] ?? '').trim();
      });
      return record;
    });

  return {
    headers,
    rows,
    parser: fileType === 'xls' ? 'xlsx-xls' : 'xlsx',
  };
};

const parseImportFile = (file) => {
  const fileType = detectFileType(file);
  console.log('[IMPORT FILE TYPE]', {
    fileType,
    originalName: file?.originalname || '',
    mimeType: file?.mimetype || '',
  });

  if (fileType === 'csv') {
    const parsed = parseCsvBuffer(file.buffer);
    console.log('[IMPORT PARSER]', { parser: parsed.parser });
    return { fileType, ...parsed };
  }

  if (fileType === 'xlsx' || fileType === 'xls') {
    const parsed = parseExcelBuffer(file.buffer, fileType);
    console.log('[IMPORT PARSER]', { parser: parsed.parser });
    return { fileType, ...parsed };
  }

  throw new Error('Unsupported import file type. Allowed: .csv, .xls, .xlsx');
};

const getCellValue = (row, columnName) => {
  if (!columnName) {
    return '';
  }

  if (row[columnName] !== undefined) {
    return String(row[columnName] || '').trim();
  }

  const target = normalizeHeaderKey(columnName);
  const matchedKey = Object.keys(row).find((key) => normalizeHeaderKey(key) === target);
  return matchedKey ? String(row[matchedKey] || '').trim() : '';
};

const validateStructure = (columnMap, rows) => {
  const issues = [];

  if (!columnMap.nameColumn) {
    issues.push('Missing name column (expected NAME or name)');
  }
  if (!columnMap.phoneColumn) {
    issues.push('Missing phone column (expected Phone 1 - Value, mobile, or phone)');
  }

  const emptyPhoneRows = rows.filter((row, index) => {
    const phone = getCellValue(row, columnMap.phoneColumn);
    return columnMap.phoneColumn && !phone;
  }).length;

  if (emptyPhoneRows > 0) {
    issues.push(`${emptyPhoneRows} row(s) have empty phone values`);
  }

  return {
    valid: issues.length === 0,
    issues,
    emptyPhoneRows,
  };
};

const findGroupByNameInsensitive = async (groupName) => {
  const normalized = String(groupName || '').trim();
  if (!normalized) {
    return null;
  }

  return Group.findOne({
    name: { $regex: new RegExp(`^${escapeRegex(normalized)}$`, 'i') },
  });
};

const ensureGroupByName = async (groupName, createdBy, cache, summary) => {
  const normalized = String(groupName || '').trim();
  if (!normalized) {
    return null;
  }

  const cacheKey = normalized.toLowerCase();
  if (cache.has(cacheKey)) {
    return cache.get(cacheKey);
  }

  let group = await findGroupByNameInsensitive(normalized);
  if (!group) {
    group = await Group.create({
      name: normalized,
      contacts: [],
      clients: [],
      createdBy,
    });
    summary.groupsCreated += 1;
    console.log('[IMPORT GROUP CREATED]', { groupName: normalized, groupId: String(group._id) });
  } else {
    console.log('[IMPORT GROUP MATCHED]', { groupName: normalized, groupId: String(group._id) });
  }

  cache.set(cacheKey, group);
  return group;
};

const assignClientToGroup = async (client, group) => {
  if (!client?._id || !group?._id) {
    return;
  }

  await Client.findByIdAndUpdate(client._id, { $addToSet: { groups: group._id } });
  await Group.findByIdAndUpdate(group._id, { $addToSet: { clients: client._id } });
};

const importContactsFromFile = async (file, { createdBy } = {}) => {
  console.log('[IMPORT FLOW START]');

  if (!file?.buffer) {
    throw new Error('No import file provided.');
  }

  console.log('[IMPORT FILE RECEIVED]', {
    originalName: file.originalname || '',
    mimeType: file.mimetype || '',
    sizeBytes: file.size || file.buffer.length,
  });

  const parsedFile = parseImportFile(file);
  const columnMap = resolveColumnMap(parsedFile.headers);

  console.log('[IMPORT HEADERS]', parsedFile.headers);
  console.log('[IMPORT ROW COUNT]', parsedFile.rows.length);
  console.log('[EXCEL COLUMN MAP]', columnMap);

  const structure = validateStructure(columnMap, parsedFile.rows);
  if (!structure.valid) {
    console.log('[IMPORT STRUCTURE INVALID]', structure.issues);
    const error = new Error(structure.issues.join('; '));
    error.statusCode = 400;
    throw error;
  }

  const summary = {
    totalRows: parsedFile.rows.length,
    imported: 0,
    duplicates: 0,
    invalid: 0,
    groupsCreated: 0,
    skipped: 0,
    groupAssignments: 0,
    errors: [],
  };

  const seenPhones = new Set();
  const groupCache = new Map();

  for (let index = 0; index < parsedFile.rows.length; index += 1) {
    const row = parsedFile.rows[index];
    const rowIndex = index + 2;
    const name = getCellValue(row, columnMap.nameColumn);
    const rawPhone = getCellValue(row, columnMap.phoneColumn);
    const rawAlt = getCellValue(row, columnMap.alternateMobileColumn);
    const rawGroup = getCellValue(row, columnMap.groupColumn);
    const normalizedPhone = formatMobile(rawPhone);
    const valid = Boolean(name && normalizedPhone);

    console.log('[IMPORT ROW PARSED]', {
      rowIndex,
      name,
      phone: rawPhone,
      group: rawGroup,
      normalizedPhone: normalizedPhone || '',
      valid,
    });

    if (!name) {
      summary.invalid += 1;
      summary.skipped += 1;
      summary.errors.push({ row: rawPhone || `row-${rowIndex}`, reason: 'Missing name' });
      continue;
    }

    if (!normalizedPhone) {
      summary.invalid += 1;
      summary.skipped += 1;
      summary.errors.push({ row: rawPhone || `row-${rowIndex}`, reason: 'Invalid phone number' });
      continue;
    }

    if (seenPhones.has(normalizedPhone)) {
      summary.duplicates += 1;
      summary.skipped += 1;
      summary.errors.push({ row: rawPhone, reason: 'Duplicate phone in file' });
      continue;
    }
    seenPhones.add(normalizedPhone);

    let groupDoc = null;
    if (rawGroup) {
      try {
        groupDoc = await ensureGroupByName(rawGroup, createdBy, groupCache, summary);
      } catch (groupError) {
        summary.invalid += 1;
        summary.skipped += 1;
        summary.errors.push({ row: rawPhone, reason: `Invalid group: ${rawGroup}` });
        console.log('[IMPORT ROW GROUP ERROR]', { rowIndex, group: rawGroup, message: groupError.message });
        continue;
      }
    }

    const existing = await Client.findOne({ mobile: normalizedPhone });
    if (existing) {
      summary.duplicates += 1;
      summary.skipped += 1;

      if (groupDoc) {
        await assignClientToGroup(existing, groupDoc);
        summary.groupAssignments += 1;
      }

      continue;
    }

    try {
      const client = await Client.create({
        name,
        mobile: normalizedPhone,
        alternateMobile: rawAlt ? (formatMobile(rawAlt) || rawAlt) : '',
        whatsappOptIn: true,
        groups: groupDoc ? [groupDoc._id] : [],
      });

      if (groupDoc) {
        await assignClientToGroup(client, groupDoc);
        summary.groupAssignments += 1;
      }

      summary.imported += 1;
    } catch (err) {
      if (err.code === 11000) {
        summary.duplicates += 1;
        summary.skipped += 1;
      } else {
        summary.invalid += 1;
        summary.skipped += 1;
        summary.errors.push({ row: rawPhone, reason: err.message });
      }
    }
  }

  console.log('[IMPORT SUMMARY]', summary);
  return {
    fileType: parsedFile.fileType,
    parser: parsedFile.parser,
    columnMap,
    summary,
  };
};

module.exports = {
  IMPORT_ACCEPTED_EXTENSIONS,
  IMPORT_ACCEPTED_MIME_TYPES,
  detectFileType,
  resolveColumnMap,
  parseImportFile,
  importContactsFromFile,
};
