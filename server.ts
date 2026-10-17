import express from 'express';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { createServer as createViteServer } from 'vite';
import dotenv from 'dotenv';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = 3000;

app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

// Target Google Sheets ID and Tab Name
export const IBSI_SPREADSHEET_ID = '1anInd4lDcfN8xlVfKrVlvxxbC2z_72qA-L3yxi8nwrs';
export const IBSI_SHEET_TAB_NAME = 'EventDay';

// Data persistence structures for IBSI Year End Party 2026
interface ParticipantRecord {
  token: string;
  fullName: string;
  bu: string;
  teamName: string;
  status: string; // "Check-in"
  timestamp: number;
  dateTime: string;
}

interface ScanLog {
  id: string;
  timestamp: number;
  dateTime: string;
  fullName: string;
  bu: string;
  teamName: string;
  status: string; // "Check-in"
  isDuplicate: boolean;
  participantToken?: string;
  syncedToExternal?: boolean;
  syncError?: string | null;
  spreadsheetId?: string;
  sheetName?: string;
  rowNumber?: number;
}

interface DatabaseConfigData {
  databaseType: 'google_sheets' | 'rest_api' | 'webhook' | 'supabase';
  databaseUrl: string;
  spreadsheetId: string;
  sheetName: string;
  apiKey: string;
  authHeader: string;
  enabled: boolean;
  lastConnectedAt?: number;
  lastStatus?: string;
}

const DATA_DIR = path.join(process.cwd(), 'data');
const RECORDS_FILE = path.join(DATA_DIR, 'ibsi_records.json');
const CONFIG_FILE = path.join(DATA_DIR, 'db-config.json');

function ensureDataDir() {
  if (!fs.existsSync(DATA_DIR)) {
    try {
      fs.mkdirSync(DATA_DIR, { recursive: true });
    } catch (e) {}
  }
}

// Global In-Memory Stores backed by disk
const participants: Map<string, ParticipantRecord> = new Map();
let scanHistory: ScanLog[] = [];

// Production endpoints
export const ACTIVE_GOOGLE_SHEETS_URL =
  'https://script.google.com/macros/s/AKfycbwjEbCcwwDRklQLF0L2Dymz8U9afSdZm3RlVMyULlxBK1YfV5TmHxZdYnCUsp6_xXjA/exec';

let dbConfig: DatabaseConfigData = {
  databaseType: 'google_sheets',
  databaseUrl: process.env.BACKEND_WEBHOOK_URL || process.env.DATABASE_URL || ACTIVE_GOOGLE_SHEETS_URL,
  spreadsheetId: IBSI_SPREADSHEET_ID,
  sheetName: IBSI_SHEET_TAB_NAME,
  apiKey: process.env.DATABASE_API_KEY || '',
  authHeader: '',
  enabled: true,
  lastConnectedAt: undefined,
  lastStatus: '',
};

function initializeDataStore() {
  ensureDataDir();

  // Load Config
  try {
    if (fs.existsSync(CONFIG_FILE)) {
      const savedConfig = JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf-8'));
      dbConfig = { ...dbConfig, ...savedConfig };
      // Always enforce the user's specific spreadsheet ID and tab name
      dbConfig.spreadsheetId = IBSI_SPREADSHEET_ID;
      dbConfig.sheetName = IBSI_SHEET_TAB_NAME;
    }
  } catch (err) {
    console.warn('Could not read db-config.json:', err);
  }

  // Load Records
  try {
    if (fs.existsSync(RECORDS_FILE)) {
      const savedData = JSON.parse(fs.readFileSync(RECORDS_FILE, 'utf-8'));
      if (Array.isArray(savedData.participants)) {
        for (const p of savedData.participants) {
          participants.set(p.token || p.fullName, p);
        }
      }
      if (Array.isArray(savedData.scans)) {
        scanHistory = savedData.scans;
      }
      console.log(`Loaded ${participants.size} participants and ${scanHistory.length} scans from storage.`);
    }
  } catch (err) {
    console.warn('Could not read ibsi_records.json:', err);
  }
}

function persistRecords() {
  try {
    ensureDataDir();
    const data = {
      participants: Array.from(participants.values()),
      scans: scanHistory,
      lastUpdated: new Date().toISOString(),
    };
    fs.writeFileSync(RECORDS_FILE, JSON.stringify(data, null, 2), 'utf-8');
  } catch (err) {
    console.warn('Could not persist ibsi_records.json:', err);
  }
}

function persistConfig() {
  try {
    ensureDataDir();
    fs.writeFileSync(CONFIG_FILE, JSON.stringify(dbConfig, null, 2), 'utf-8');
  } catch (err) {
    console.warn('Could not persist db-config.json:', err);
  }
}

initializeDataStore();

// Forward check-in payload to Google Sheets Apps Script or Webhook
async function sendToGoogleSheets(payload: any, targetUrl?: string) {
  const url = (targetUrl || dbConfig.databaseUrl || '').trim();
  if (!url || !dbConfig.enabled) {
    return { synced: false, error: 'Google Sheets link not configured or disabled' };
  }

  const headers: Record<string, string> = {
    'Content-Type': 'text/plain;charset=utf-8',
    'Accept': 'application/json',
  };

  if (dbConfig.apiKey) {
    headers['apikey'] = dbConfig.apiKey;
    headers['Authorization'] = `Bearer ${dbConfig.apiKey}`;
  }
  if (dbConfig.authHeader) {
    headers['Authorization'] = dbConfig.authHeader;
  }

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 12000);

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers,
      body: JSON.stringify(payload),
      signal: controller.signal,
      redirect: 'follow',
    });
    clearTimeout(timeoutId);

    const text = await response.text();
    let data: any = null;
    try {
      data = JSON.parse(text);
    } catch (e) {
      data = { rawText: text };
    }

    const isHtml = text.trim().startsWith('<!DOCTYPE') || text.includes('<html') || text.includes('ServiceLogin');
    if (isHtml) {
      const errMsg = text.includes('ServiceLogin') || text.includes('Sign in')
        ? 'Google requires login. In Google Apps Script deployment, ensure "Who has access" is set to "Anyone".'
        : 'Google returned an HTML page. Verify that the Web App URL is from an active deployment.';
      dbConfig.lastStatus = errMsg;
      return {
        synced: false,
        status: response.status,
        error: errMsg,
      };
    }

    const isSuccess = response.ok && typeof data === 'object' && (data.success || data.ok || data.action === 'ibsi_checkin' || data.status === 'LIVE_CONNECTED' || data.status === 'ONLINE' || typeof data.rowNumber === 'number');

    if (isSuccess) {
      dbConfig.lastConnectedAt = Date.now();
      dbConfig.lastStatus = `OK ${response.status}`;
      return {
        synced: true,
        status: response.status,
        data,
      };
    } else {
      const errMsg = (data && typeof data === 'object' && (data.error || data.message))
        ? (data.error || data.message)
        : `Google Sheets returned status ${response.status}`;
      dbConfig.lastStatus = errMsg;
      return {
        synced: false,
        status: response.status,
        error: errMsg,
        data,
      };
    }
  } catch (err: any) {
    clearTimeout(timeoutId);
    const errMsg = err.name === 'AbortError' ? 'Google Sheets request timed out (12s limit)' : (err.message || 'Network unreachable');
    dbConfig.lastStatus = errMsg;
    return {
      synced: false,
      error: errMsg,
    };
  }
}

// Helper to parse participant data from raw QR input
function parseParticipantData(body: any) {
  let fullName = (body.fullName || body.name || '').trim();
  let bu = (body.bu || body.businessUnit || body.office || body.department || '').trim();
  let teamName = (body.teamName || body.team || '').trim();
  let rawQrData = (body.rawQrData || body.participantToken || body.token || '').trim();

  // 0. Try Base64 decoding (e.g. from createSecureQRPayload_ in QRService.gs)
  if (rawQrData && !rawQrData.startsWith('{') && !rawQrData.startsWith('http') && rawQrData.length > 12 && !rawQrData.includes(' ')) {
    try {
      const decoded = Buffer.from(rawQrData, 'base64').toString('utf-8');
      if (decoded.startsWith('{') && decoded.endsWith('}')) {
        rawQrData = decoded;
      }
    } catch (_) {}
  }

  // Check if fullName itself or rawQrData contains multi-line or colon format
  const sourceText = (fullName.includes('\n') || fullName.includes(':'))
    ? fullName
    : (rawQrData || fullName);

  // 1. Try URL parsing
  if (sourceText.startsWith('http://') || sourceText.startsWith('https://')) {
    try {
      const u = new URL(sourceText);
      fullName = u.searchParams.get('fullName') || u.searchParams.get('name') || fullName;
      bu = u.searchParams.get('bu') || u.searchParams.get('dept') || bu;
      teamName = u.searchParams.get('teamName') || u.searchParams.get('team') || teamName;
    } catch (_) {}
  }

  // 2. Try JSON parsing
  if (sourceText.startsWith('{') && sourceText.endsWith('}')) {
    try {
      const parsed = JSON.parse(sourceText);
      fullName = parsed.fullName || parsed.name || parsed['Full Name'] || fullName;
      bu = parsed.bu || parsed.BU || parsed.businessUnit || parsed.department || parsed.office || bu;
      teamName = parsed.teamName || parsed.team || parsed['Team Name'] || teamName;
    } catch (_) {}
  }

  // 3. Try Multi-line Key-Value lines (Handles Full Name:, Business Unit:, Team:)
  const lines = sourceText.split(/\r?\n|\\n/);
  let parsedName = '';
  let parsedBu = '';
  let parsedTeam = '';

  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line) continue;
    const colonIdx = line.indexOf(':');
    if (colonIdx !== -1) {
      const k = line.slice(0, colonIdx).trim().toLowerCase();
      const v = line.slice(colonIdx + 1).trim();

      if (
        k === 'full name' ||
        k === 'fullname' ||
        k === 'name' ||
        k === 'attendee' ||
        k === 'participant' ||
        (k.includes('name') && !k.includes('team') && !k.includes('company'))
      ) {
        if (v) parsedName = v;
      } else if (
        k === 'business unit' ||
        k === 'businessunit' ||
        k === 'bu' ||
        k === 'department' ||
        k === 'dept' ||
        k === 'division' ||
        k === 'office' ||
        k.includes('business') ||
        k.includes('unit')
      ) {
        if (v) parsedBu = v;
      } else if (
        k === 'team' ||
        k === 'team name' ||
        k === 'teamname' ||
        k === 'group' ||
        k === 'house' ||
        k.includes('team')
      ) {
        if (v) parsedTeam = v;
      }
    }
  }

  if (parsedName) {
    fullName = parsedName;
    bu = parsedBu || bu || 'Technology & Digital';
    teamName = parsedTeam || teamName || 'IBSI Team';
  } else if (!fullName || fullName.includes('\n')) {
    // 4. Positional fallback filtering out event titles like "IBSI YEP 2026"
    const nonHeaderLines = lines
      .map((l) => l.trim())
      .filter((l) => {
        if (!l) return false;
        const lower = l.toLowerCase();
        if (lower.startsWith('ibsi yep') || lower.startsWith('ibsi year end') || lower.startsWith('year end party')) return false;
        return true;
      });

    if (nonHeaderLines.length >= 3) {
      fullName = nonHeaderLines[0].replace(/^full\s*name\s*[:=-]\s*/i, '').trim();
      bu = nonHeaderLines[1].replace(/^(business\s*unit|bu|dept|department)\s*[:=-]\s*/i, '').trim();
      teamName = nonHeaderLines[2].replace(/^(team\s*name|team)\s*[:=-]\s*/i, '').trim();
    } else if (nonHeaderLines.length === 2) {
      fullName = nonHeaderLines[0].replace(/^full\s*name\s*[:=-]\s*/i, '').trim();
      bu = nonHeaderLines[1].replace(/^(business\s*unit|bu|dept|department)\s*[:=-]\s*/i, '').trim();
      teamName = teamName || 'IBSI Team';
    } else if (nonHeaderLines.length === 1) {
      fullName = nonHeaderLines[0].replace(/^full\s*name\s*[:=-]\s*/i, '').trim();
    } else {
      fullName = sourceText.replace(/^ibsi\s+yep[^\n]*\n?/i, '').trim();
    }
  }

  return {
    fullName: fullName || 'Participant',
    bu: bu || 'Technology & Digital',
    teamName: teamName || 'IBSI Team',
    token: fullName || rawQrData || 'Participant',
  };
}

// ----------------- API ROUTES ----------------- //

app.get('/api/health', (req, res) => {
  const pendingSyncs = scanHistory.filter((s) => s.syncedToExternal === false).length;
  res.json({
    status: 'ok',
    app: 'IBSI Team Fest Committee Scanner',
    spreadsheetId: IBSI_SPREADSHEET_ID,
    sheetName: IBSI_SHEET_TAB_NAME,
    timestamp: Date.now(),
    participantsCount: participants.size,
    scansCount: scanHistory.length,
    pendingSyncCount: pendingSyncs,
    liveDatabaseConfigured: !!dbConfig.databaseUrl,
  });
});

// Track in-flight requests to prevent rapid duplicate bursts
const inFlightCheckins = new Map<string, number>();

// Record Check-in for IBSI Team Fest (Logs Timestamp, Full Name, BU, Team Name, Status with green highlight)
// STRICT: Only logs ONE entry per attendee to Google Sheets
async function handleCheckIn(req: express.Request, res: express.Response) {
  try {
    const { fullName, bu, teamName, token } = parseParticipantData(req.body);

    const now = new Date();
    const timestampStr = now.toLocaleString();
    const timestampNum = now.getTime();

    const cleanName = fullName.trim().toLowerCase();

    // 0. Immediate skip if request already marked duplicate
    if (req.body.isDuplicate === true) {
      return res.json({
        success: true,
        ok: true,
        duplicate: true,
        fullName,
        bu,
        teamName,
        status: 'Check-in',
        timestampStr,
        sheetName: IBSI_SHEET_TAB_NAME,
        spreadsheetId: IBSI_SPREADSHEET_ID,
        message: `⚠️ Attendee ${fullName} is already checked in. Duplicate submission skipped.`,
        externalBackend: {
          configured: true,
          synced: true,
          sheetName: IBSI_SHEET_TAB_NAME,
          spreadsheetId: IBSI_SPREADSHEET_ID,
          error: null,
        },
      });
    }

    // 1. In-flight Lock: Prevent rapid burst / identical scans within 15 seconds
    const lastAttempt = inFlightCheckins.get(cleanName);
    if (lastAttempt && now.getTime() - lastAttempt < 15000) {
      console.log(`[DEBOUNCE] Blocked rapid repeat check-in burst for: ${fullName}`);
      return res.json({
        success: true,
        ok: true,
        duplicate: true,
        fullName,
        bu,
        teamName,
        status: 'Check-in',
        timestampStr,
        sheetName: IBSI_SHEET_TAB_NAME,
        spreadsheetId: IBSI_SPREADSHEET_ID,
        message: `⚠️ Scan ignored: ${fullName} was just recorded. Please scan the next attendee.`,
        externalBackend: {
          configured: true,
          synced: true,
          sheetName: IBSI_SHEET_TAB_NAME,
          spreadsheetId: IBSI_SPREADSHEET_ID,
          error: null,
        },
      });
    }
    inFlightCheckins.set(cleanName, now.getTime());

    // 2. Duplicate Check: Search across all stored participants
    const existing = Array.from(participants.values()).find(
      (p) =>
        p.fullName.trim().toLowerCase() === cleanName ||
        (token && p.token === token && token.length > 5)
    );

    // If ALREADY CHECKED IN: DO NOT call Google Sheets! Return duplicate notice immediately.
    if (existing) {
      console.log(`[DUPLICATE BLOCKED] Attendee ${fullName} is already recorded in EventDay.`);
      return res.json({
        success: true,
        ok: true,
        duplicate: true,
        fullName: existing.fullName,
        bu: existing.bu,
        teamName: existing.teamName,
        status: 'Check-in',
        timestampStr: existing.dateTime || timestampStr,
        rowNumber: (existing as any).rowNumber,
        sheetName: IBSI_SHEET_TAB_NAME,
        spreadsheetId: IBSI_SPREADSHEET_ID,
        message: `⚠️ Attendee ${existing.fullName} is ALREADY checked in. Duplicate row skipped.`,
        externalBackend: {
          configured: true,
          synced: true,
          sheetName: IBSI_SHEET_TAB_NAME,
          spreadsheetId: IBSI_SPREADSHEET_ID,
          error: null,
        },
      });
    }

    // 3. Brand New Attendee: Record participant and forward ONE row to Google Sheets
    const participantRecord: ParticipantRecord = {
      token,
      fullName,
      bu,
      teamName,
      status: 'Check-in',
      timestamp: timestampNum,
      dateTime: timestampStr,
    };

    const participantKey = `${cleanName}__${bu.toLowerCase()}`;
    participants.set(participantKey, participantRecord);

    // Payload for Google Sheets (EventDay tab)
    // Columns: Timestamp, Full Name, BU, Team Name, Status (with green highlight)
    const sheetsPayload = {
      action: 'ibsi_checkin',
      event: 'TEAM_FEST_CHECKIN',
      spreadsheetId: IBSI_SPREADSHEET_ID,
      sheetName: IBSI_SHEET_TAB_NAME,
      timestamp: timestampStr,
      timestampIso: now.toISOString(),
      fullName,
      name: fullName,
      participantName: fullName,
      bu,
      department: bu,
      teamName,
      team: teamName,
      status: 'Check-in',
      highlightColor: '#4ade80', // Vibrant green highlight
      isDuplicate: false,
      participantId: token,
      participantToken: token,
      token,
      row: [timestampStr, fullName, bu, teamName, 'Check-in'],
    };

    // Forward to user's live database / Apps Script
    const syncResult = await sendToGoogleSheets(sheetsPayload);

    let rowNumber: number | undefined = undefined;
    if (syncResult.synced && syncResult.data) {
      const d = syncResult.data;
      if (typeof d.rowNumber === 'number') rowNumber = d.rowNumber;
    }

    if (rowNumber) {
      (participantRecord as any).rowNumber = rowNumber;
    }

    // Record persistent scan log
    const scanLog: ScanLog = {
      id: `scan-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
      timestamp: timestampNum,
      dateTime: timestampStr,
      fullName,
      bu,
      teamName,
      status: 'Check-in',
      isDuplicate: false,
      participantToken: token,
      syncedToExternal: syncResult.synced,
      syncError: syncResult.error || null,
      spreadsheetId: IBSI_SPREADSHEET_ID,
      sheetName: IBSI_SHEET_TAB_NAME,
      rowNumber,
    };

    scanHistory.unshift(scanLog);
    persistRecords();

    const successMessage = `Checked in: ${fullName} [${bu} · ${teamName}] recorded to Google Sheets [${IBSI_SHEET_TAB_NAME}].`;

    res.json({
      success: true,
      ok: true,
      duplicate: false,
      fullName,
      bu,
      teamName,
      status: 'Check-in',
      timestampStr,
      rowNumber,
      sheetName: IBSI_SHEET_TAB_NAME,
      spreadsheetId: IBSI_SPREADSHEET_ID,
      message: successMessage,
      externalBackend: dbConfig.databaseUrl
        ? {
            configured: true,
            synced: syncResult.synced,
            url: dbConfig.databaseUrl,
            sheetName: IBSI_SHEET_TAB_NAME,
            spreadsheetId: IBSI_SPREADSHEET_ID,
            rowNumber,
            error: syncResult.error || null,
          }
        : null,
    });
  } catch (error: any) {
    console.error('Check-in processing error:', error);
    res.status(500).json({ success: false, message: error?.message || 'Server error processing check-in.' });
  }
}

app.post('/api/checkin', handleCheckIn);
app.post('/api/scan', handleCheckIn);
app.post('/api/vendor/scan', handleCheckIn); // Backwards compatibility

// Get Check-in Scan History
app.get(['/api/scans', '/api/vendor/scans'], (req, res) => {
  res.json({ scans: scanHistory, total: scanHistory.length });
});

// Clear Scan History
app.all(['/api/scans/clear', '/api/vendor/scans/clear'], (req, res) => {
  scanHistory = [];
  participants.clear();
  persistRecords();
  res.json({ success: true, message: 'All check-in logs and records cleared.' });
});

app.delete(['/api/scans', '/api/vendor/scans'], (req, res) => {
  scanHistory = [];
  participants.clear();
  persistRecords();
  res.json({ success: true, message: 'Check-in history cleared.' });
});

// Participants Directory
app.get(['/api/participants', '/api/vendor/participants'], (req, res) => {
  res.json({ participants: Array.from(participants.values()) });
});

// Retry Syncing Pending Check-ins to Google Sheets
app.post(['/api/sync-pending', '/api/vendor/sync-pending'], async (req, res) => {
  if (!dbConfig.databaseUrl) {
    res.status(400).json({ success: false, message: 'No Google Sheet URL configured.' });
    return;
  }

  const pending = scanHistory.filter((s) => s.syncedToExternal === false);
  let syncedCount = 0;
  let failCount = 0;

  for (const scan of pending) {
    const payload = {
      action: 'ibsi_checkin',
      event: 'RETRY_SYNC',
      spreadsheetId: IBSI_SPREADSHEET_ID,
      sheetName: IBSI_SHEET_TAB_NAME,
      timestamp: scan.dateTime,
      fullName: scan.fullName,
      bu: scan.bu,
      teamName: scan.teamName,
      status: 'Check-in',
      highlightColor: '#4ade80',
      isDuplicate: scan.isDuplicate,
      row: [scan.dateTime, scan.fullName, scan.bu, scan.teamName, 'Check-in'],
    };

    const resSync = await sendToGoogleSheets(payload);
    if (resSync.synced) {
      scan.syncedToExternal = true;
      scan.syncError = null;
      syncedCount++;
    } else {
      scan.syncError = resSync.error || 'Retry failed';
      failCount++;
    }
  }

  persistRecords();
  res.json({
    success: true,
    synced: syncedCount,
    failed: failCount,
    message: `Processed ${pending.length} pending check-in(s). (${syncedCount} synced, ${failCount} failed)`,
  });
});

app.post('/api/scans/clear', (req, res) => {
  participants.clear();
  scanHistory = [];
  persistRecords();
  res.json({ success: true, message: 'All check-in records and participants cleared.' });
});

// Google Sheets Live Database Configuration
app.get('/api/backend/config', (req, res) => {
  const pendingCount = scanHistory.filter((s) => s.syncedToExternal === false).length;
  res.json({
    backendUrl: dbConfig.databaseUrl,
    databaseUrl: dbConfig.databaseUrl,
    databaseType: dbConfig.databaseType,
    spreadsheetId: IBSI_SPREADSHEET_ID,
    sheetName: IBSI_SHEET_TAB_NAME,
    apiKey: dbConfig.apiKey,
    authHeader: dbConfig.authHeader,
    enabled: dbConfig.enabled,
    hasExternalBackend: !!dbConfig.databaseUrl,
    builtInBackendActive: true,
    lastConnectedAt: dbConfig.lastConnectedAt,
    lastStatus: dbConfig.lastStatus,
    pendingSyncCount: pendingCount,
  });
});

app.post('/api/backend/config', (req, res) => {
  const { backendUrl, databaseUrl, databaseType, apiKey, authHeader, enabled } = req.body;

  const resolvedUrl = typeof databaseUrl === 'string' ? databaseUrl.trim() : (typeof backendUrl === 'string' ? backendUrl.trim() : dbConfig.databaseUrl);

  dbConfig.databaseUrl = resolvedUrl;
  if (databaseType) dbConfig.databaseType = databaseType;
  if (apiKey !== undefined) dbConfig.apiKey = apiKey.trim();
  if (authHeader !== undefined) dbConfig.authHeader = authHeader.trim();
  if (enabled !== undefined) dbConfig.enabled = !!enabled;
  dbConfig.spreadsheetId = IBSI_SPREADSHEET_ID;
  dbConfig.sheetName = IBSI_SHEET_TAB_NAME;

  persistConfig();

  const pendingCount = scanHistory.filter((s) => s.syncedToExternal === false).length;
  res.json({
    success: true,
    backendUrl: dbConfig.databaseUrl,
    databaseUrl: dbConfig.databaseUrl,
    databaseType: dbConfig.databaseType,
    spreadsheetId: IBSI_SPREADSHEET_ID,
    sheetName: IBSI_SHEET_TAB_NAME,
    hasExternalBackend: !!dbConfig.databaseUrl,
    enabled: dbConfig.enabled,
    pendingSyncCount: pendingCount,
  });
});

// Test Connection to Google Sheets
app.post('/api/backend/test', async (req, res) => {
  const targetUrl = (req.body.databaseUrl || req.body.backendUrl || dbConfig.databaseUrl || '').trim();
  if (!targetUrl) {
    res.status(400).json({ success: false, message: 'Please provide a Google Sheets Web App URL link.' });
    return;
  }

  const apiKey = req.body.apiKey !== undefined ? req.body.apiKey : dbConfig.apiKey;
  const authHeader = req.body.authHeader !== undefined ? req.body.authHeader : dbConfig.authHeader;

  try {
    const startTime = Date.now();
    const testPayload = {
      action: 'validateConnection',
      event: 'HANDSHAKE_TEST',
      spreadsheetId: IBSI_SPREADSHEET_ID,
      sheetName: IBSI_SHEET_TAB_NAME,
      ping: 'test-handshake',
      timestamp: new Date().toISOString(),
      source: 'IBSI Team Fest Committee Scanner',
    };

    const headers: Record<string, string> = {
      'Content-Type': 'text/plain;charset=utf-8',
      'Accept': 'application/json',
    };

    if (apiKey) {
      headers['apikey'] = apiKey;
      headers['Authorization'] = `Bearer ${apiKey}`;
    }
    if (authHeader) {
      headers['Authorization'] = authHeader;
    }

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 12000);

    const response = await fetch(targetUrl, {
      method: 'POST',
      headers,
      body: JSON.stringify(testPayload),
      signal: controller.signal,
      redirect: 'follow',
    });
    clearTimeout(timeoutId);

    const elapsed = Date.now() - startTime;
    const responseText = await response.text();
    let parsed: any = null;
    try {
      parsed = JSON.parse(responseText);
    } catch (e) {
      parsed = responseText.slice(0, 400);
    }

    const isHtml = responseText.trim().startsWith('<!DOCTYPE') || responseText.includes('<html') || responseText.includes('ServiceLogin');

    if (isHtml) {
      const isLogin = responseText.includes('ServiceLogin') || responseText.includes('Sign in') || responseText.includes('accounts.google.com');
      const isNotFound = responseText.includes('Page not found') || responseText.includes('unable to open');
      
      const helpfulMsg = isLogin
        ? '⚠️ Google returned a Sign-in page. In Google Apps Script, click Deploy > Manage deployments > Edit > Set "Who has access" to "Anyone" (not "Only myself"). Then save and try again.'
        : isNotFound
        ? '⚠️ Google returned "Page not found". Check if the Web App URL was copied completely or if the deployment is active.'
        : `Google Sheets returned an HTML page instead of JSON API response.`;

      res.json({
        success: false,
        status: response.status,
        latencyMs: elapsed,
        isHtml: true,
        message: helpfulMsg,
        spreadsheetId: IBSI_SPREADSHEET_ID,
        sheetName: IBSI_SHEET_TAB_NAME,
      });
      return;
    }

    const isSuccess = response.ok && typeof parsed === 'object' && (parsed.success || parsed.ok || parsed.status === 'LIVE_CONNECTED' || parsed.status === 'ONLINE' || parsed.action === 'ibsi_checkin');

    res.json({
      success: isSuccess,
      status: response.status,
      latencyMs: elapsed,
      response: parsed,
      spreadsheetId: IBSI_SPREADSHEET_ID,
      sheetName: IBSI_SHEET_TAB_NAME,
      message: isSuccess
        ? `✅ Successfully connected to Google Sheet [${IBSI_SHEET_TAB_NAME}] in ${elapsed}ms!`
        : `Google Sheets returned: ${typeof parsed === 'object' && (parsed.error || parsed.message) ? (parsed.error || parsed.message) : `HTTP ${response.status}`}`,
    });
  } catch (err: any) {
    res.status(502).json({
      success: false,
      message: err.name === 'AbortError' ? 'Connection timed out after 12s' : `Failed connecting to Google Sheets: ${err.message || 'Network unreachable'}`,
    });
  }
});

// Direct Test Row: Send a sample check-in directly to the EventDay tab
app.post('/api/backend/send-test-row', async (req, res) => {
  const targetUrl = (req.body.databaseUrl || req.body.backendUrl || dbConfig.databaseUrl || '').trim();
  if (!targetUrl) {
    res.status(400).json({ success: false, message: 'Please provide a Google Sheets Web App URL link.' });
    return;
  }

  const now = new Date();
  const testSamplePayload = {
    action: 'ibsi_checkin',
    event: 'PORTAL_TEST_ROW',
    spreadsheetId: IBSI_SPREADSHEET_ID,
    sheetName: IBSI_SHEET_TAB_NAME,
    timestamp: now.toLocaleString(),
    timestampIso: now.toISOString(),
    fullName: req.body.fullName || 'Test Attendee',
    name: req.body.fullName || 'Test Attendee',
    participantName: req.body.fullName || 'Test Attendee',
    bu: req.body.bu || 'Business Unit',
    department: req.body.bu || 'Business Unit',
    teamName: req.body.teamName || 'Team',
    team: req.body.teamName || 'Team',
    status: 'Check-in',
    highlightColor: '#4ade80',
    participantId: 'TEST-' + Math.floor(1000 + Math.random() * 9000),
    participantToken: 'TEST-' + Math.floor(1000 + Math.random() * 9000),
    token: 'TEST-' + Math.floor(1000 + Math.random() * 9000),
    row: [now.toLocaleString(), req.body.fullName || 'Test Attendee', req.body.bu || 'Business Unit', req.body.teamName || 'Team', 'Check-in'],
  };

  const syncResult = await sendToGoogleSheets(testSamplePayload, targetUrl);

  if (syncResult.synced) {
    const rowNum = syncResult.data?.rowNumber ? ` (Row ${syncResult.data.rowNumber})` : '';
    res.json({
      success: true,
      rowNumber: syncResult.data?.rowNumber,
      message: `🎉 Test row logged to Google Sheet tab [${IBSI_SHEET_TAB_NAME}]${rowNum} with green highlight!`,
      data: syncResult.data,
    });
  } else {
    res.json({
      success: false,
      error: syncResult.error,
      message: `❌ Failed writing test row: ${syncResult.error}`,
      data: syncResult.data,
    });
  }
});

// Explicitly serve public assets
app.use(express.static(path.join(process.cwd(), 'public'), {
  maxAge: '1d',
  immutable: true,
}));

// ----------------- VITE MIDDLEWARE SETUP ----------------- //

async function startServer() {
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`IBSI Team Fest Committee Scanner Server running on http://0.0.0.0:${PORT}`);
  });
}

startServer();
