import { ScanRecord, DatabaseType, DatabaseConfig, Participant } from '../types';
import {
  IBSI_SPREADSHEET_ID,
  IBSI_SHEET_TAB_NAME,
  getStoredParticipants,
  saveStoredParticipants,
} from '../data/mockData';

export interface BackendConfig {
  databaseType: DatabaseType;
  backendUrl: string;
  databaseUrl: string;
  spreadsheetId: string;
  sheetName: string;
  apiKey: string;
  authHeader: string;
  hasExternalBackend: boolean;
  builtInBackendActive: boolean;
  enabled: boolean;
  pendingSyncCount: number;
}

export interface BackendTestResult {
  success: boolean;
  status?: number;
  message: string;
  latencyMs?: number;
  response?: any;
  error?: string;
}

export interface ScanApiResponse {
  success: boolean;
  duplicate: boolean;
  fullName: string;
  bu: string;
  teamName: string;
  status: string; // "Check-in"
  timestampStr: string;
  message: string;
  rowNumber?: number;
  sheetName?: string;
  spreadsheetId?: string;
  externalBackend?: {
    configured: boolean;
    synced: boolean;
    error?: string;
    sheetName?: string;
    rowNumber?: number;
    spreadsheetId?: string;
  };
}

export const DEFAULT_GOOGLE_SHEETS_URL =
  'https://script.google.com/macros/s/AKfycbwjEbCcwwDRklQLF0L2Dymz8U9afSdZm3RlVMyULlxBK1YfV5TmHxZdYnCUsp6_xXjA/exec';

const LOCAL_CONFIG_KEY = 'ibsi_backend_config_prod';
const LOCAL_PENDING_KEY = 'ibsi_pending_scans_prod';
const LOCAL_SCANS_KEY = 'ibsi_teamfest_scans_prod';

/**
 * Intelligent QR parser for IBSI Team Fest attendee QR codes.
 * Accepts:
 *   1. JSON: {"fullName":"...", "bu":"...", "teamName":"..."} or variations
 *   2. Delimited: "Full Name, BU, Team Name" (comma, pipe, semicolon, newline, slash)
 *   3. Key-Value: "Name: ... \n BU: ... \n Team: ..."
 *   4. URL: https://.../?name=...&bu=...&team=...
 *   5. Plain text: "Full Name"
 */
export function parseQrData(rawInput: string): {
  fullName: string;
  bu: string;
  teamName: string;
  token: string;
} {
  let clean = (rawInput || '').trim();
  if (!clean) {
    return {
      fullName: 'Unknown Participant',
      bu: 'General',
      teamName: 'IBSI Team',
      token: 'IBSI-' + Math.floor(100 + Math.random() * 900),
    };
  }

  // 0. Try Base64 decoding (e.g. from createSecureQRPayload_ in QRService.gs)
  if (!clean.startsWith('{') && !clean.startsWith('http') && clean.length > 12 && !clean.includes(' ')) {
    try {
      const decoded = typeof atob === 'function' 
        ? atob(clean) 
        : Buffer.from(clean, 'base64').toString('utf-8');
      if (decoded.startsWith('{') && decoded.endsWith('}')) {
        clean = decoded;
      }
    } catch (_) {}
  }

  // 1. Try URL parsing
  if (clean.startsWith('http://') || clean.startsWith('https://')) {
    try {
      const u = new URL(clean);
      const fullName =
        u.searchParams.get('fullName') ||
        u.searchParams.get('name') ||
        u.searchParams.get('fn') ||
        '';
      const bu =
        u.searchParams.get('bu') ||
        u.searchParams.get('businessUnit') ||
        u.searchParams.get('department') ||
        u.searchParams.get('dept') ||
        '';
      const teamName =
        u.searchParams.get('teamName') ||
        u.searchParams.get('team') ||
        u.searchParams.get('group') ||
        '';
      const token =
        u.searchParams.get('token') ||
        u.searchParams.get('id') ||
        u.searchParams.get('p') ||
        fullName ||
        clean;

      if (fullName) {
        return {
          fullName: fullName.trim(),
          bu: (bu || 'Technology').trim(),
          teamName: (teamName || 'IBSI Team').trim(),
          token: token.trim(),
        };
      }
    } catch (_) {}
  }

  // 2. Try JSON parsing
  if (clean.startsWith('{') && clean.endsWith('}')) {
    try {
      const obj = JSON.parse(clean);
      const fullName =
        obj.fullName ||
        obj.FullName ||
        obj['Full Name'] ||
        obj.name ||
        obj.Name ||
        obj.attendee ||
        obj.participant ||
        '';
      const bu =
        obj.bu ||
        obj.BU ||
        obj.businessUnit ||
        obj['Business Unit'] ||
        obj.department ||
        obj.office ||
        obj.dept ||
        '';
      const teamName =
        obj.teamName ||
        obj.TeamName ||
        obj['Team Name'] ||
        obj.team ||
        obj.Team ||
        obj.group ||
        '';
      const token =
        obj.token ||
        obj.id ||
        obj.participantId ||
        obj.badgeId ||
        fullName ||
        clean;

      if (fullName) {
        return {
          fullName: String(fullName).trim(),
          bu: String(bu || 'Technology').trim(),
          teamName: String(teamName || 'IBSI Team').trim(),
          token: String(token).trim(),
        };
      }
    } catch (_) {}
  }

  // 3. Try Key-Value lines (e.g., Name: John \n BU: IT \n Team: Blue)
  if (clean.includes(':') && (clean.includes('\n') || clean.includes(';') || clean.includes(','))) {
    const lines = clean.split(/[\n;,]+/);
    let parsedName = '';
    let parsedBu = '';
    let parsedTeam = '';

    for (const line of lines) {
      const parts = line.split(':');
      if (parts.length >= 2) {
        const key = parts[0].trim().toLowerCase();
        const val = parts.slice(1).join(':').trim();
        if (key.includes('name') && !key.includes('team')) parsedName = val;
        else if (key === 'bu' || key.includes('unit') || key.includes('dept') || key.includes('office')) parsedBu = val;
        else if (key.includes('team') || key.includes('group')) parsedTeam = val;
      }
    }

    if (parsedName) {
      return {
        fullName: parsedName,
        bu: parsedBu || 'Technology',
        teamName: parsedTeam || 'IBSI Team',
        token: parsedName,
      };
    }
  }

  // 4. Try Delimited text (e.g., "John Doe, IT, Blue Dragons" or "John Doe | IT | Blue Dragons")
  const delimiters = [',', '|', ';', '\n', '/'];
  for (const delim of delimiters) {
    if (clean.includes(delim)) {
      const parts = clean.split(delim).map((p) => p.trim()).filter(Boolean);
      if (parts.length >= 3) {
        return {
          fullName: parts[0],
          bu: parts[1],
          teamName: parts[2],
          token: parts[0],
        };
      } else if (parts.length === 2) {
        return {
          fullName: parts[0],
          bu: parts[1],
          teamName: 'IBSI Team',
          token: parts[0],
        };
      }
    }
  }

  // 5. Fallback: single name or token
  return {
    fullName: clean,
    bu: 'Technology',
    teamName: 'IBSI Team',
    token: clean,
  };
}

function getLocalConfig(): BackendConfig {
  try {
    const raw = localStorage.getItem(LOCAL_CONFIG_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      const pendingRaw = localStorage.getItem(LOCAL_PENDING_KEY);
      const pending = pendingRaw ? JSON.parse(pendingRaw) : [];
      const effectiveUrl = parsed.databaseUrl || parsed.backendUrl || DEFAULT_GOOGLE_SHEETS_URL;
      return {
        databaseType: parsed.databaseType || 'google_sheets',
        backendUrl: effectiveUrl,
        databaseUrl: effectiveUrl,
        spreadsheetId: parsed.spreadsheetId || IBSI_SPREADSHEET_ID,
        sheetName: parsed.sheetName || IBSI_SHEET_TAB_NAME,
        apiKey: parsed.apiKey || '',
        authHeader: parsed.authHeader || '',
        hasExternalBackend: Boolean(effectiveUrl),
        builtInBackendActive: true,
        enabled: parsed.enabled !== false,
        pendingSyncCount: pending.length,
      };
    }
  } catch (e) {}

  return {
    databaseType: 'google_sheets',
    backendUrl: DEFAULT_GOOGLE_SHEETS_URL,
    databaseUrl: DEFAULT_GOOGLE_SHEETS_URL,
    spreadsheetId: IBSI_SPREADSHEET_ID,
    sheetName: IBSI_SHEET_TAB_NAME,
    apiKey: '',
    authHeader: '',
    hasExternalBackend: Boolean(DEFAULT_GOOGLE_SHEETS_URL),
    builtInBackendActive: true,
    enabled: true,
    pendingSyncCount: 0,
  };
}

function saveLocalConfig(cfg: Partial<BackendConfig>): BackendConfig {
  try {
    const current = getLocalConfig();
    const updated: BackendConfig = {
      ...current,
      ...cfg,
      backendUrl: cfg.databaseUrl || cfg.backendUrl || current.databaseUrl,
      databaseUrl: cfg.databaseUrl || cfg.backendUrl || current.databaseUrl,
      spreadsheetId: cfg.spreadsheetId || current.spreadsheetId || IBSI_SPREADSHEET_ID,
      sheetName: cfg.sheetName || current.sheetName || IBSI_SHEET_TAB_NAME,
    };
    localStorage.setItem(LOCAL_CONFIG_KEY, JSON.stringify(updated));
    return updated;
  } catch (e) {
    console.error('Failed to save local config', e);
    return getLocalConfig();
  }
}

export async function getBackendConfig(): Promise<BackendConfig> {
  try {
    const res = await fetch('/api/backend/config');
    if (res.ok) {
      const ct = res.headers.get('content-type') || '';
      if (ct.includes('application/json')) {
        const serverCfg = await res.json();
        return saveLocalConfig(serverCfg);
      }
    }
  } catch (e) {}

  return getLocalConfig();
}

export async function saveBackendConfig(
  configOrUrl: string | Partial<DatabaseConfig>
): Promise<BackendConfig> {
  const payload =
    typeof configOrUrl === 'string'
      ? {
          backendUrl: configOrUrl,
          databaseUrl: configOrUrl,
          databaseType: 'google_sheets' as DatabaseType,
          spreadsheetId: IBSI_SPREADSHEET_ID,
          sheetName: IBSI_SHEET_TAB_NAME,
        }
      : {
          backendUrl: configOrUrl.databaseUrl || (configOrUrl as any).backendUrl || '',
          databaseUrl: configOrUrl.databaseUrl || (configOrUrl as any).backendUrl || '',
          databaseType: configOrUrl.databaseType || 'google_sheets',
          spreadsheetId: configOrUrl.spreadsheetId || IBSI_SPREADSHEET_ID,
          sheetName: configOrUrl.sheetName || IBSI_SHEET_TAB_NAME,
          apiKey: configOrUrl.apiKey || '',
          authHeader: configOrUrl.authHeader || '',
          enabled: configOrUrl.enabled !== false,
        };

  const localSaved = saveLocalConfig(payload);

  try {
    const res = await fetch('/api/backend/config', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    if (res.ok) {
      const ct = res.headers.get('content-type') || '';
      if (ct.includes('application/json')) {
        return await res.json();
      }
    }
  } catch (e) {}

  return localSaved;
}

export async function sendTestRowToSheets(
  targetUrl?: string,
  attendee?: { fullName?: string; bu?: string; teamName?: string }
): Promise<{ success: boolean; rowNumber?: number; message: string; error?: string }> {
  try {
    const res = await fetch('/api/backend/send-test-row', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        databaseUrl: targetUrl,
        ...attendee,
      }),
    });
    if (res.ok) {
      return await res.json();
    }
  } catch (e) {}

  const cfg = getLocalConfig();
  const url = (targetUrl || cfg.databaseUrl || cfg.backendUrl || '').trim();
  if (!url) {
    return { success: false, message: 'Please enter your Google Sheets Web App URL first.' };
  }

  const now = new Date();
  const testName = attendee?.fullName || 'Test Attendee';
  const testBu = attendee?.bu || 'Business Unit';
  const testTeam = attendee?.teamName || 'Team';

  const testPayload = {
    action: 'ibsi_checkin',
    event: 'PORTAL_TEST_ROW',
    spreadsheetId: IBSI_SPREADSHEET_ID,
    sheetName: IBSI_SHEET_TAB_NAME,
    timestamp: now.toLocaleString(),
    timestampIso: now.toISOString(),
    fullName: testName,
    name: testName,
    participantName: testName,
    bu: testBu,
    department: testBu,
    teamName: testTeam,
    team: testTeam,
    status: 'Check-in',
    highlightColor: '#4ade80',
    participantId: 'TEST-' + Math.floor(1000 + Math.random() * 9000),
    row: [now.toLocaleString(), testName, testBu, testTeam, 'Check-in'],
  };

  try {
    const directRes = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify(testPayload),
    });
    const text = await directRes.text();
    let json: any = null;
    try { json = JSON.parse(text); } catch {}

    if (directRes.ok && json && (json.success || json.ok || json.action === 'ibsi_checkin')) {
      const rowNum = json.rowNumber ? ` (Row ${json.rowNumber})` : '';
      return {
        success: true,
        rowNumber: json.rowNumber,
        message: `🎉 Test row logged to Google Sheet tab [${IBSI_SHEET_TAB_NAME}]${rowNum} with green highlight!`,
      };
    }

    if (text.includes('ServiceLogin') || text.includes('Sign in')) {
      return {
        success: false,
        message: '⚠️ Google returned a sign-in screen. In Apps Script, set "Who has access" to "Anyone" and redeploy.',
      };
    }

    return {
      success: false,
      message: `Google Sheets returned: ${json?.error || json?.message || text.slice(0, 150)}`,
    };
  } catch (err: any) {
    return { success: false, message: err?.message || 'Network connection failed.' };
  }
}

export async function testBackendConnection(
  params?: string | { databaseUrl?: string; databaseType?: string; apiKey?: string; authHeader?: string }
): Promise<BackendTestResult> {
  const body =
    typeof params === 'string'
      ? { backendUrl: params, databaseUrl: params }
      : params || {};

  const targetUrl = (body.databaseUrl || (body as any).backendUrl || '').trim();

  // 1. Try Express server test
  try {
    const res = await fetch('/api/backend/test', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    if (res.ok) {
      const ct = res.headers.get('content-type') || '';
      if (ct.includes('application/json')) {
        return await res.json();
      }
    }
  } catch (e) {}

  // 2. Direct browser test
  if (!targetUrl) {
    return {
      success: false,
      message: 'Please enter a valid Google Sheets Web App URL.',
    };
  }

  const start = Date.now();
  try {
    const directRes = await fetch(targetUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify({
        action: 'validateConnection',
        ping: 'test-handshake',
        spreadsheetId: IBSI_SPREADSHEET_ID,
        sheetName: IBSI_SHEET_TAB_NAME,
        timestamp: new Date().toISOString(),
        client: 'IBSI-Team-Fest-Committee-Scanner',
      }),
    });

    const latency = Date.now() - start;
    const text = await directRes.text();
    let json: any = null;
    try {
      json = JSON.parse(text);
    } catch {}

    if (text.includes('<!DOCTYPE') || text.includes('ServiceLogin') || text.includes('Sign in')) {
      return {
        success: false,
        status: directRes.status,
        message: '⚠️ Google returned a sign-in screen. In Apps Script, set "Who has access" to "Anyone" and redeploy.',
        latencyMs: latency,
      };
    }

    if (json && (json.success || json.ok || json.status === 'LIVE_CONNECTED' || json.status === 'ONLINE')) {
      return {
        success: true,
        status: directRes.status,
        message: `Connected to Google Sheets (${IBSI_SHEET_TAB_NAME} tab) successfully!`,
        latencyMs: latency,
        response: json,
      };
    }

    if (directRes.ok && json) {
      return {
        success: true,
        status: directRes.status,
        message: `Endpoint responded with HTTP 200 OK. Ready to log into tab "${IBSI_SHEET_TAB_NAME}".`,
        latencyMs: latency,
        response: json,
      };
    }

    return {
      success: false,
      status: directRes.status,
      message: `Google Sheets returned: ${json?.error || json?.message || text.slice(0, 150)}`,
      latencyMs: latency,
      response: json || text,
    };
  } catch (err: any) {
    return {
      success: false,
      message: `Connection error: ${err?.message || 'Network error'}. Check deployment access.`,
      latencyMs: Date.now() - start,
      error: String(err),
    };
  }
}

const clientInFlight = new Map<string, number>();

/**
 * Record a check-in scan for IBSI Team Fest.
 * Sends: Timestamp, Full Name, BU, Team Name, Status ("Check-in") with green highlight.
 */
export async function recordCheckIn(rawQrText: string): Promise<ScanApiResponse> {
  const parsed = parseQrData(rawQrText);
  const now = new Date();
  const timestampStr = now.toLocaleString();
  const timestampNum = now.getTime();

  // 1. Try Express backend API first
  try {
    const res = await fetch('/api/checkin', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: JSON.stringify({
        rawQrData: rawQrText,
        fullName: parsed.fullName,
        bu: parsed.bu,
        teamName: parsed.teamName,
        status: 'Check-in',
        spreadsheetId: IBSI_SPREADSHEET_ID,
        sheetName: IBSI_SHEET_TAB_NAME,
      }),
    });

    if (res.ok) {
      const ct = res.headers.get('content-type') || '';
      if (ct.includes('application/json')) {
        const data = await res.json();
        return data;
      }
    }
  } catch (err) {}

  // 2. Client-side local processing fallback
  const cleanNameLower = parsed.fullName.trim().toLowerCase();

  // Debounce check
  const lastClientScan = clientInFlight.get(cleanNameLower);
  if (lastClientScan && Date.now() - lastClientScan < 15000) {
    return {
      success: true,
      duplicate: true,
      fullName: parsed.fullName,
      bu: parsed.bu,
      teamName: parsed.teamName,
      status: 'Check-in',
      timestampStr,
      sheetName: IBSI_SHEET_TAB_NAME,
      spreadsheetId: IBSI_SPREADSHEET_ID,
      message: `⚠️ Attendee ${parsed.fullName} was just checked in. Scan next attendee.`,
      externalBackend: { configured: true, synced: true, sheetName: IBSI_SHEET_TAB_NAME, spreadsheetId: IBSI_SPREADSHEET_ID },
    };
  }
  clientInFlight.set(cleanNameLower, Date.now());

  const participants = getStoredParticipants();

  // Check if duplicate attendee (same name)
  const existingParticipant = participants.find(
    (p) =>
      p.fullName.trim().toLowerCase() === cleanNameLower ||
      (parsed.token && p.token === parsed.token && parsed.token.length > 5)
  );

  const isDuplicate = Boolean(existingParticipant);

  const currentParticipant: Participant = existingParticipant || {
    token: parsed.token,
    fullName: parsed.fullName,
    bu: parsed.bu,
    teamName: parsed.teamName,
    status: 'Check-in',
    timestamp: timestampNum,
    timestampStr,
  };

  if (!existingParticipant) {
    saveStoredParticipants([currentParticipant, ...participants]);
  }

  // 3. Sync to Google Sheets ONLY if NOT duplicate
  const cfg = getLocalConfig();
  const dbUrl = cfg.databaseUrl || cfg.backendUrl;
  let externalSynced = false;
  let rowNumber: number | undefined;
  let syncError: string | undefined;

  const livePayload = {
    action: 'ibsi_checkin',
    event: 'TEAM_FEST_CHECKIN',
    spreadsheetId: IBSI_SPREADSHEET_ID,
    sheetName: IBSI_SHEET_TAB_NAME,
    timestamp: timestampStr,
    timestampIso: now.toISOString(),
    fullName: parsed.fullName,
    name: parsed.fullName,
    participantName: parsed.fullName,
    bu: parsed.bu,
    department: parsed.bu,
    teamName: parsed.teamName,
    team: parsed.teamName,
    status: 'Check-in',
    highlightColor: '#4ade80', // Green highlight
    isDuplicate: false,
    participantId: parsed.token,
    participantToken: parsed.token,
    token: parsed.token,
    row: [timestampStr, parsed.fullName, parsed.bu, parsed.teamName, 'Check-in'],
  };

  if (!isDuplicate && dbUrl && cfg.enabled) {
    try {
      const extRes = await fetch(dbUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain;charset=utf-8' },
        body: JSON.stringify(livePayload),
      });

      if (extRes.ok) {
        externalSynced = true;
        try {
          const extData = await extRes.json();
          if (extData.rowNumber) rowNumber = extData.rowNumber;
        } catch {}
      } else {
        syncError = `HTTP ${extRes.status}`;
      }
    } catch (e: any) {
      syncError = e?.message || 'Network sync error';
    }

    if (!externalSynced) {
      try {
        const pendingRaw = localStorage.getItem(LOCAL_PENDING_KEY);
        const pendingList = pendingRaw ? JSON.parse(pendingRaw) : [];
        pendingList.push({ payload: livePayload, timestamp: Date.now() });
        localStorage.setItem(LOCAL_PENDING_KEY, JSON.stringify(pendingList));
      } catch {}
    }
  } else if (isDuplicate) {
    externalSynced = true;
  }

  // Save scan record locally
  try {
    const rawScans = localStorage.getItem(LOCAL_SCANS_KEY);
    const scanList: ScanRecord[] = rawScans ? JSON.parse(rawScans) : [];
    const record: ScanRecord = {
      id: `scan-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
      timestamp: timestampNum,
      dateTime: timestampStr,
      fullName: parsed.fullName,
      bu: parsed.bu,
      teamName: parsed.teamName,
      status: 'Check-in',
      isDuplicate,
      participantToken: parsed.token,
      syncedToExternal: externalSynced,
      syncError: syncError || null,
      spreadsheetId: IBSI_SPREADSHEET_ID,
      sheetName: IBSI_SHEET_TAB_NAME,
      rowNumber,
    };
    localStorage.setItem(LOCAL_SCANS_KEY, JSON.stringify([record, ...scanList]));
  } catch {}

  const resultMsg = isDuplicate
    ? `⚠️ Attendee ${parsed.fullName} (${parsed.bu}) was already checked in.`
    : `✅ Checked in: ${parsed.fullName} [${parsed.bu} · ${parsed.teamName}]`;

  return {
    success: true,
    duplicate: isDuplicate,
    fullName: parsed.fullName,
    bu: parsed.bu,
    teamName: parsed.teamName,
    status: 'Check-in',
    timestampStr,
    rowNumber,
    sheetName: IBSI_SHEET_TAB_NAME,
    spreadsheetId: IBSI_SPREADSHEET_ID,
    message: resultMsg,
    externalBackend: {
      configured: Boolean(dbUrl),
      synced: externalSynced,
      error: syncError,
      sheetName: IBSI_SHEET_TAB_NAME,
      rowNumber,
      spreadsheetId: IBSI_SPREADSHEET_ID,
    },
  };
}

export async function fetchServerScans(): Promise<ScanRecord[]> {
  try {
    const res = await fetch('/api/scans');
    if (res.ok) {
      const ct = res.headers.get('content-type') || '';
      if (ct.includes('application/json')) {
        const data = await res.json();
        return data.scans || [];
      }
    }
  } catch (e) {}

  try {
    const raw = localStorage.getItem(LOCAL_SCANS_KEY);
    if (raw) {
      return JSON.parse(raw);
    }
  } catch {}
  return [];
}

export async function clearServerScans() {
  try {
    await fetch('/api/scans', { method: 'DELETE' });
  } catch {}
  localStorage.removeItem(LOCAL_SCANS_KEY);
}

export async function syncPendingScans(): Promise<{ synced: number; failed: number; message: string }> {
  try {
    const res = await fetch('/api/sync-pending', { method: 'POST' });
    if (res.ok) {
      const ct = res.headers.get('content-type') || '';
      if (ct.includes('application/json')) {
        return await res.json();
      }
    }
  } catch {}

  const cfg = getLocalConfig();
  const dbUrl = cfg.databaseUrl || cfg.backendUrl;
  if (!dbUrl) {
    return { synced: 0, failed: 0, message: 'No Google Sheet URL configured.' };
  }

  const raw = localStorage.getItem(LOCAL_PENDING_KEY);
  const pending: Array<{ payload: any; timestamp: number }> = raw ? JSON.parse(raw) : [];
  if (pending.length === 0) {
    return { synced: 0, failed: 0, message: 'No pending scans in queue.' };
  }

  let synced = 0;
  const remaining: typeof pending = [];

  for (const item of pending) {
    try {
      const r = await fetch(dbUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain;charset=utf-8' },
        body: JSON.stringify(item.payload),
      });
      if (r.ok) synced++;
      else remaining.push(item);
    } catch {
      remaining.push(item);
    }
  }

  localStorage.setItem(LOCAL_PENDING_KEY, JSON.stringify(remaining));
  return {
    synced,
    failed: remaining.length,
    message: `Synced ${synced} record(s) to Google Sheets [${IBSI_SHEET_TAB_NAME}]. ${remaining.length} remaining.`,
  };
}
