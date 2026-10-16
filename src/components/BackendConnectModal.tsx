import React, { useState } from 'react';
import {
  Link2,
  CheckCircle2,
  AlertTriangle,
  Play,
  Copy,
  Check,
  ExternalLink,
  X,
  Code,
  RefreshCw,
  Columns,
  Sparkles,
  Wifi,
  FileSpreadsheet,
  Send,
  HelpCircle,
  ShieldCheck,
} from 'lucide-react';
import {
  BackendConfig,
  BackendTestResult,
  syncPendingScans,
  sendTestRowToSheets,
  DEFAULT_GOOGLE_SHEETS_URL,
} from '../utils/api';
import { DatabaseType, DatabaseConfig } from '../types';
import { IBSI_SPREADSHEET_ID, IBSI_SHEET_TAB_NAME } from '../data/mockData';

interface BackendConnectModalProps {
  isOpen: boolean;
  onClose: () => void;
  config: BackendConfig;
  onSaveConfig: (cfg: Partial<DatabaseConfig> | string) => Promise<void>;
  onTestConnection: (params?: any) => Promise<BackendTestResult>;
}

export const BackendConnectModal: React.FC<BackendConnectModalProps> = ({
  isOpen,
  onClose,
  config,
  onSaveConfig,
  onTestConnection,
}) => {
  const [dbType, setDbType] = useState<DatabaseType>(config.databaseType || 'google_sheets');
  const [urlInput, setUrlInput] = useState(
    config.databaseUrl || config.backendUrl || DEFAULT_GOOGLE_SHEETS_URL
  );
  const [syncEnabled, setSyncEnabled] = useState(config.enabled !== false);

  const [isSaving, setIsSaving] = useState(false);
  const [isTesting, setIsTesting] = useState(false);
  const [isSendingTestRow, setIsSendingTestRow] = useState(false);
  const [testRowResult, setTestRowResult] = useState<{ success: boolean; message: string } | null>(null);
  const [isSyncingPending, setIsSyncingPending] = useState(false);
  const [syncMessage, setSyncMessage] = useState<string | null>(null);
  const [testResult, setTestResult] = useState<BackendTestResult | null>(null);
  const [copiedCode, setCopiedCode] = useState(false);
  const [activeTab, setActiveTab] = useState<'settings' | 'script' | 'sheet_preview' | 'troubleshoot' | 'logs'>('settings');

  if (!isOpen) return null;

  const sheetsUrl = `https://docs.google.com/spreadsheets/d/${IBSI_SPREADSHEET_ID}/edit#gid=0`;

  const handleSave = async () => {
    setIsSaving(true);
    try {
      await onSaveConfig({
        databaseUrl: urlInput.trim(),
        databaseType: dbType,
        spreadsheetId: IBSI_SPREADSHEET_ID,
        sheetName: IBSI_SHEET_TAB_NAME,
        enabled: syncEnabled,
      });
      setTestResult({
        success: true,
        message: 'Web App URL saved successfully! You can now test the connection or send a test row.',
      });
    } catch (e: any) {
      alert(e?.message || 'Failed saving database configuration');
    } finally {
      setIsSaving(false);
    }
  };

  const handleTest = async () => {
    if (!urlInput.trim()) {
      alert('Please enter your Google Sheets Web App URL first.');
      return;
    }
    setIsTesting(true);
    setTestResult(null);
    setTestRowResult(null);
    try {
      const result = await onTestConnection({
        databaseUrl: urlInput.trim(),
        databaseType: dbType,
      });
      setTestResult(result);
    } catch (e: any) {
      setTestResult({
        success: false,
        message: e?.message || 'Network error communicating with Google Sheets.',
      });
    } finally {
      setIsTesting(false);
    }
  };

  const handleSendTestRow = async () => {
    if (!urlInput.trim()) {
      alert('Please enter your Google Sheets Web App URL first.');
      return;
    }
    setIsSendingTestRow(true);
    setTestRowResult(null);
    try {
      const res = await sendTestRowToSheets(urlInput.trim(), {
        fullName: 'Committee Test Attendee',
        bu: 'Digital Platforms',
        teamName: 'IBSI Team',
      });
      setTestRowResult(res);
    } catch (e: any) {
      setTestRowResult({
        success: false,
        message: e?.message || 'Failed sending test row to Google Sheets.',
      });
    } finally {
      setIsSendingTestRow(false);
    }
  };

  const handleSyncPending = async () => {
    setIsSyncingPending(true);
    setSyncMessage(null);
    try {
      const res = await syncPendingScans();
      setSyncMessage(res.message);
    } catch (e: any) {
      setSyncMessage(e?.message || 'Failed to sync pending records.');
    } finally {
      setIsSyncingPending(false);
    }
  };

  // Turnkey Google Apps Script tailored specifically to IBSI Year End Party 2026 and Tab "EventDay"
  const sampleAppsScriptCode = `// ============================================================================
// IBSI YEAR END PARTY 2026 COMMITTEE SCANNER - GOOGLE APPS SCRIPT CONNECTOR (webhook.gs)
// Target Spreadsheet ID: ${IBSI_SPREADSHEET_ID}
// Target Sheet Tab: "${IBSI_SHEET_TAB_NAME}"
// Columns: Timestamp | Full Name | BU | Team Name | Status (Green Highlight)
// ============================================================================

var SPREADSHEET_ID = "${IBSI_SPREADSHEET_ID}";
var TARGET_TAB = "${IBSI_SHEET_TAB_NAME}";

// 1. GET Request Handler (Browser visits, Ping test, or GET-based check-in)
function doGet(e) {
  try {
    var ss = getSpreadsheet();
    var sheet = getTargetSheet(ss);

    // If query parameters were provided (e.g. ?fullName=John+Doe&bu=IT&teamName=Dragons)
    if (e && e.parameter && (e.parameter.fullName || e.parameter.name || e.parameter.rawQrData)) {
      return logCheckIn(ss, sheet, e.parameter);
    }

    return ContentService.createTextOutput(JSON.stringify({
      success: true,
      status: "ONLINE",
      app: "IBSI Year End Party 2026 Committee Scanner",
      spreadsheetName: ss ? ss.getName() : "Active Sheet",
      tabName: sheet.getName(),
      totalRows: sheet.getLastRow(),
      message: "Webhook is LIVE and ready to receive check-ins!",
      timestamp: new Date().toISOString()
    })).setMimeType(ContentService.MimeType.JSON);
  } catch (err) {
    return ContentService.createTextOutput(JSON.stringify({
      success: false,
      error: err.toString()
    })).setMimeType(ContentService.MimeType.JSON);
  }
}

// 2. POST Request Handler (Main scanner check-in endpoint)
function doPost(e) {
  var lock = LockService.getScriptLock();
  var hasLock = false;
  try {
    hasLock = lock.tryLock(10000);
  } catch (e) {}

  try {
    // Parse incoming JSON or Form Data payload
    var data = {};
    if (e && e.postData && e.postData.contents) {
      try {
        data = JSON.parse(e.postData.contents);
      } catch (jsonErr) {
        try {
          var qs = e.postData.contents.split("&");
          for (var q = 0; q < qs.length; q++) {
            var pair = qs[q].split("=");
            if (pair.length === 2) {
              data[decodeURIComponent(pair[0])] = decodeURIComponent(pair[1]);
            }
          }
        } catch (_) {}
      }
    }
    if ((!data || Object.keys(data).length === 0) && e && e.parameter) {
      data = e.parameter;
    }

    var ss = getSpreadsheet(data.spreadsheetId);
    var sheet = getTargetSheet(ss, data.sheetName);

    // Connection validation / handshake ping
    if (data.action === "validateConnection" || data.ping === "test-handshake") {
      return ContentService.createTextOutput(JSON.stringify({
        success: true,
        status: "LIVE_CONNECTED",
        spreadsheetTitle: ss.getName(),
        tabName: sheet.getName(),
        totalRows: sheet.getLastRow(),
        message: "Connected to Google Sheet successfully! Ready for check-ins.",
        timestamp: new Date().toISOString()
      })).setMimeType(ContentService.MimeType.JSON);
    }

    // Process attendee check-in
    return logCheckIn(ss, sheet, data);

  } catch (err) {
    return ContentService.createTextOutput(JSON.stringify({
      success: false,
      error: err.toString()
    })).setMimeType(ContentService.MimeType.JSON);
  } finally {
    if (hasLock) {
      try { lock.releaseLock(); } catch (e) {}
    }
  }
}

// Resolves the spreadsheet:
// 1. Opens the target scanner spreadsheet by ID (1anInd4lDcfN8xlVfKrVlvxxbC2z_72qA-L3yxi8nwrs)!
// 2. Falls back to active sheet only if openById fails
function getSpreadsheet(overrideId) {
  var id = overrideId || SPREADSHEET_ID;
  if (id) {
    try {
      return SpreadsheetApp.openById(id);
    } catch (err) {
      Logger.log("openById failed for " + id + ": " + err.message);
    }
  }

  try {
    var active = SpreadsheetApp.getActiveSpreadsheet();
    if (active) return active;
  } catch (e) {}

  throw new Error("Could not open spreadsheet with ID: " + id);
}

// Resolves the target sheet / tab:
// Strictly targets 'EventDay'. Inserts the 'EventDay' tab if it doesn't exist!
function getTargetSheet(ss, overrideTab) {
  var tabName = overrideTab || TARGET_TAB;
  var sheet = ss.getSheetByName(tabName);
  
  if (!sheet) {
    sheet = ss.insertSheet(tabName);
  }

  // Ensure headers exist on row 1
  if (sheet.getLastRow() === 0) {
    sheet.appendRow(["Timestamp", "Full Name", "BU", "Team Name", "Status"]);
    var headerRange = sheet.getRange("A1:E1");
    headerRange.setFontWeight("bold");
    headerRange.setBackground("#0f172a");
    headerRange.setFontColor("#38bdf8");
    headerRange.setHorizontalAlignment("center");
    sheet.setFrozenRows(1);
  }
  return sheet;
}

// Core Single Check-in Logger:
// Ensures exactly ONE row is added per attendee
function logCheckIn(ss, sheet, data) {
  var now = new Date();
  var timeString = data.timestamp || Utilities.formatDate(now, Session.getScriptTimeZone() || "GMT+8", "yyyy-MM-dd HH:mm:ss");

  // Extract attendee fields from payload
  var fullName = String(data.fullName || data.name || data.participantName || "").trim();
  var bu = String(data.bu || data.department || data.businessUnit || data.office || data.dept || "Technology").trim();
  var teamName = String(data.teamName || data.team || "IBSI Team").trim();
  var status = "Check-in";

  // Parse raw QR if fullName was not provided directly
  if (!fullName && (data.rawQrData || data.token || data.raw || data.qrPayload)) {
    var raw = String(data.rawQrData || data.token || data.raw || data.qrPayload).trim();

    // 0. Base64 decode check (handles createSecureQRPayload_ from QRService.gs)
    if (!raw.startsWith("{") && !raw.startsWith("http") && raw.length > 12 && !raw.includes(" ")) {
      try {
        var decodedBytes = Utilities.base64Decode(raw);
        var decodedStr = Utilities.newBlob(decodedBytes).getDataAsString();
        if (decodedStr.startsWith("{") && decodedStr.endsWith("}")) {
          raw = decodedStr;
        }
      } catch (b64Err) {}
    }

    if (raw.startsWith("{") && raw.endsWith("}")) {
      try {
        var obj = JSON.parse(raw);
        fullName = obj.fullName || obj.name || obj["Full Name"] || "";
        bu = obj.bu || obj.businessUnit || obj.department || bu;
        teamName = obj.teamName || obj.team || obj["TEAM NAME"] || teamName;
      } catch(_) {}
    }
    if (!fullName) {
      var parts = raw.split(/[,|;\\n\\/]+/);
      if (parts.length >= 2) {
        fullName = parts[0].trim();
        bu = parts[1].trim();
        if (parts.length >= 3) teamName = parts[2].trim();
      } else {
        fullName = raw;
      }
    }
  }

  if (!fullName) {
    fullName = "Attendee";
  }

  // 1. REJECT CLIENT-FLAGGED DUPLICATES
  if (data.isDuplicate === true) {
    return ContentService.createTextOutput(JSON.stringify({
      success: true,
      ok: true,
      duplicate: true,
      fullName: fullName,
      bu: bu,
      teamName: teamName,
      status: status,
      message: "Attendee already checked in (duplicate skipped)."
    })).setMimeType(ContentService.MimeType.JSON);
  }

  // 2. CHECK SHEET FOR EXISTING ATTENDEE (Strict Single Entry Rule)
  var lastRow = sheet.getLastRow();
  if (lastRow > 1) {
    var existingNames = sheet.getRange(2, 2, lastRow - 1, 1).getValues();
    var targetName = fullName.toLowerCase();
    for (var i = 0; i < existingNames.length; i++) {
      var rowName = String(existingNames[i][0]).trim().toLowerCase();
      if (rowName === targetName && rowName.length > 0) {
        return ContentService.createTextOutput(JSON.stringify({
          success: true,
          ok: true,
          duplicate: true,
          fullName: fullName,
          bu: bu,
          teamName: teamName,
          status: status,
          rowNumber: i + 2,
          sheetName: sheet.getName(),
          message: "⚠️ " + fullName + " is already recorded on row " + (i + 2) + ". Duplicate entry prevented."
        })).setMimeType(ContentService.MimeType.JSON);
      }
    }
  }

  // 3. APPEND EXACTLY ONE ROW
  sheet.appendRow([timeString, fullName, bu, teamName, status]);
  SpreadsheetApp.flush(); // Commit write immediately
  var newRowNumber = sheet.getLastRow();

  // 4. FORMAT GREEN HIGHLIGHT ON STATUS CELL (#4ade80)
  var statusCell = sheet.getRange(newRowNumber, 5); // Column 5 = Status
  statusCell.setBackground("#4ade80");              // Green background
  statusCell.setFontColor("#064e3b");               // Dark emerald green text
  statusCell.setFontWeight("bold");
  statusCell.setHorizontalAlignment("center");

  // Format Timestamp & Full Name columns
  sheet.getRange(newRowNumber, 1).setHorizontalAlignment("center");
  sheet.getRange(newRowNumber, 2).setFontWeight("bold");

  return ContentService.createTextOutput(JSON.stringify({
    success: true,
    ok: true,
    action: "ibsi_checkin",
    fullName: fullName,
    bu: bu,
    teamName: teamName,
    status: status,
    rowNumber: newRowNumber,
    sheetName: sheet.getName(),
    message: "Successfully logged " + fullName + " (" + bu + ") to row " + newRowNumber + " with green highlight!"
  })).setMimeType(ContentService.MimeType.JSON);
}

// 5. Direct Test Runner (You can select and run this function inside the Apps Script editor to test!)
function testCheckIn() {
  var ss = getSpreadsheet();
  var sheet = getTargetSheet(ss);
  var testPayload = {
    fullName: "Committee Test Check-in (" + new Date().toLocaleTimeString() + ")",
    bu: "Digital Platforms",
    teamName: "IBSI Team",
    status: "Check-in"
  };
  var res = logCheckIn(ss, sheet, testPayload);
  Logger.log(res.getContent());
}`;

  const copyScript = () => {
    navigator.clipboard.writeText(sampleAppsScriptCode);
    setCopiedCode(true);
    setTimeout(() => setCopiedCode(false), 2000);
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-2 sm:p-4 bg-black/85 backdrop-blur-md animate-fade-in"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="relative w-full max-w-2xl bg-[#0F172A] border border-[#1E293B] rounded-2xl shadow-[0_24px_70px_rgba(0,0,0,0.85)] overflow-hidden text-white animate-scale-up max-h-[94vh] sm:max-h-[92vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-3.5 sm:px-6 py-3 sm:py-4 border-b border-[#1E293B] bg-[#0A101D]">
          <div className="flex items-center gap-2.5 sm:gap-3 min-w-0">
            <div className="w-9 h-9 sm:w-10 sm:h-10 rounded-xl bg-gradient-to-br from-emerald-500/25 to-cyan-500/25 border border-emerald-500/40 flex items-center justify-center text-emerald-400 shadow-inner shrink-0">
              <FileSpreadsheet className="w-4 h-4 sm:w-5 sm:h-5 text-emerald-400" />
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-1.5 sm:gap-2 flex-wrap">
                <h3 className="text-sm sm:text-base font-bold text-white tracking-tight truncate">
                  Google Sheets Check-in Logger
                </h3>
                <span className="px-1.5 sm:px-2 py-0.5 rounded-full text-[9px] sm:text-[10px] font-bold bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 whitespace-nowrap">
                  TAB: {IBSI_SHEET_TAB_NAME}
                </span>
              </div>
              <p className="text-[10px] sm:text-xs text-[#8E9BB5] truncate">
                Target Sheet ID: <span className="font-mono text-cyan-300">{IBSI_SPREADSHEET_ID}</span>
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-lg bg-transparent hover:bg-[#1E293B] text-[#8E9BB5] hover:text-white flex items-center justify-center transition-colors cursor-pointer shrink-0 ml-2"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Tab Navigation */}
        <div className="flex items-center gap-1.5 sm:gap-2 px-3 sm:px-6 pt-2 sm:pt-3 border-b border-[#1E293B] bg-[#0C1222] text-[11px] sm:text-xs font-semibold overflow-x-auto whitespace-nowrap scrollbar-none">
          <button
            onClick={() => setActiveTab('settings')}
            className={`pb-2 sm:pb-2.5 px-2.5 sm:px-3 border-b-2 transition-colors cursor-pointer shrink-0 ${
              activeTab === 'settings'
                ? 'border-emerald-400 text-emerald-300 font-bold'
                : 'border-transparent text-[#8E9BB5] hover:text-white'
            }`}
          >
            Connection Settings
          </button>
          <button
            onClick={() => setActiveTab('script')}
            className={`pb-2 sm:pb-2.5 px-2.5 sm:px-3 border-b-2 transition-colors cursor-pointer flex items-center gap-1 sm:gap-1.5 shrink-0 ${
              activeTab === 'script'
                ? 'border-emerald-400 text-emerald-300 font-bold'
                : 'border-transparent text-[#8E9BB5] hover:text-white'
            }`}
          >
            <Code className="w-3.5 h-3.5" />
            Turnkey Apps Script Code
          </button>
          <button
            onClick={() => setActiveTab('sheet_preview')}
            className={`pb-2 sm:pb-2.5 px-2.5 sm:px-3 border-b-2 transition-colors cursor-pointer flex items-center gap-1 sm:gap-1.5 shrink-0 ${
              activeTab === 'sheet_preview'
                ? 'border-emerald-400 text-emerald-300 font-bold'
                : 'border-transparent text-[#8E9BB5] hover:text-white'
            }`}
          >
            <Columns className="w-3.5 h-3.5 text-amber-400" />
            EventDay Columns Layout
          </button>
          <button
            onClick={() => setActiveTab('troubleshoot')}
            className={`pb-2 sm:pb-2.5 px-2.5 sm:px-3 border-b-2 transition-colors cursor-pointer flex items-center gap-1 sm:gap-1.5 shrink-0 ${
              activeTab === 'troubleshoot'
                ? 'border-amber-400 text-amber-300 font-bold'
                : 'border-transparent text-[#8E9BB5] hover:text-white'
            }`}
          >
            <HelpCircle className="w-3.5 h-3.5 text-amber-400" />
            Troubleshoot No Data
          </button>
          {config.pendingSyncCount !== undefined && config.pendingSyncCount > 0 && (
            <button
              onClick={() => setActiveTab('logs')}
              className={`pb-2 sm:pb-2.5 px-2.5 sm:px-3 border-b-2 transition-colors cursor-pointer flex items-center gap-1 sm:gap-1.5 shrink-0 ${
                activeTab === 'logs'
                  ? 'border-amber-400 text-amber-300 font-bold'
                  : 'border-transparent text-amber-400/80 hover:text-amber-300'
              }`}
            >
              <AlertTriangle className="w-3.5 h-3.5" />
              Pending Scans ({config.pendingSyncCount})
            </button>
          )}
        </div>

        {/* Modal Body */}
        <div className="p-3.5 sm:p-6 overflow-y-auto space-y-4 sm:space-y-5 text-xs text-left">
          {activeTab === 'settings' && (
            <>
              {/* Status Ribbon with Direct Sheet Link */}
              <div className="p-3.5 rounded-xl bg-[#091122] border border-[#1E293B] flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div className="flex items-center gap-3">
                  <div className={`w-3 h-3 rounded-full ${urlInput ? 'bg-emerald-400 shadow-[0_0_10px_#10B981] animate-pulse' : 'bg-amber-400'}`} />
                  <div>
                    <div className="font-bold text-white text-xs flex items-center gap-2">
                      <span>Targeting Google Sheet Tab:</span>
                      <span className="text-emerald-300 bg-emerald-950/80 px-2 py-0.5 rounded border border-emerald-500/40 font-mono">
                        {IBSI_SHEET_TAB_NAME}
                      </span>
                    </div>
                    <div className="text-[11px] text-[#8E9BB5] mt-0.5">
                      Columns: Timestamp, Full Name, BU, Team Name, Status (green highlight)
                    </div>
                  </div>
                </div>

                <a
                  href={sheetsUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center justify-center gap-1.5 px-3 py-2 sm:py-1.5 rounded-xl bg-emerald-600/20 hover:bg-emerald-600/30 text-emerald-300 border border-emerald-500/40 font-bold transition-all text-xs w-full sm:w-auto shrink-0"
                >
                  <span>Open Google Sheet</span>
                  <ExternalLink className="w-3.5 h-3.5" />
                </a>
              </div>

              {/* URL Input */}
              <div className="space-y-2">
                <div className="flex items-center justify-between flex-wrap gap-1">
                  <label className="block font-bold text-white uppercase tracking-wider text-[11px] flex items-center gap-1.5">
                    <FileSpreadsheet className="w-3.5 h-3.5 text-emerald-400" />
                    <span>Your Google Apps Script Web App URL</span>
                  </label>
                  <span className="text-[10px] text-cyan-400 font-semibold flex items-center gap-1">
                    <ShieldCheck className="w-3 h-3" /> Ends in /exec
                  </span>
                </div>

                <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
                  <div className="relative flex-1 min-w-0">
                    <Link2 className="w-4 h-4 absolute left-3 top-2.5 text-[#8E9BB5]" />
                    <input
                      type="url"
                      placeholder="https://script.google.com/macros/s/AKfycb.../exec"
                      value={urlInput}
                      onChange={(e) => setUrlInput(e.target.value)}
                      className="w-full pl-9 pr-3 py-2.5 bg-[#091122] text-white border border-[#232F4C] rounded-xl focus:outline-none focus:border-emerald-400 text-xs font-mono"
                    />
                  </div>
                  <button
                    type="button"
                    onClick={handleSave}
                    disabled={isSaving}
                    className="w-full sm:w-auto px-4 py-2.5 rounded-xl font-bold bg-emerald-600 hover:bg-emerald-500 text-white shrink-0 disabled:opacity-50 transition-colors cursor-pointer shadow-md flex items-center justify-center"
                  >
                    {isSaving ? 'Saving...' : 'Save URL'}
                  </button>
                </div>
                <p className="text-[10px] text-[#8E9BB5]">
                  Paste the Web App URL generated when deploying your Apps Script with access set to <strong>"Anyone"</strong>.
                </p>
              </div>

              {/* Action Buttons: Test Handshake & Send Live Test Row */}
              <div className="p-3 sm:p-3.5 rounded-xl bg-[#091122] border border-[#1E293B] space-y-3">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
                  <span className="font-semibold text-white flex items-center gap-1.5 text-xs">
                    <Wifi className="w-3.5 h-3.5 text-emerald-400" />
                    Live Verification & Testing:
                  </span>
                  <div className="grid grid-cols-1 sm:flex items-center gap-2 w-full sm:w-auto">
                    <button
                      type="button"
                      onClick={handleTest}
                      disabled={isTesting || !urlInput.trim()}
                      className="w-full sm:w-auto px-3 py-2 sm:py-1.5 rounded-lg font-bold text-xs bg-[#1E293B] hover:bg-[#2B3B54] text-white border border-[#2E3E5B] disabled:opacity-40 flex items-center justify-center gap-1.5 transition-colors cursor-pointer shadow-sm"
                    >
                      {isTesting ? (
                        <>
                          <RefreshCw className="w-3.5 h-3.5 animate-spin text-emerald-400" /> Ping...
                        </>
                      ) : (
                        <>
                          <Play className="w-3.5 h-3.5 fill-current text-emerald-400" /> Test Ping Handshake
                        </>
                      )}
                    </button>

                    <button
                      type="button"
                      onClick={handleSendTestRow}
                      disabled={isSendingTestRow || !urlInput.trim()}
                      className="w-full sm:w-auto px-3 py-2 sm:py-1.5 rounded-lg font-bold text-xs bg-emerald-600/30 hover:bg-emerald-600/50 text-emerald-200 border border-emerald-500/50 disabled:opacity-40 flex items-center justify-center gap-1.5 transition-colors cursor-pointer shadow-sm"
                    >
                      {isSendingTestRow ? (
                        <>
                          <RefreshCw className="w-3.5 h-3.5 animate-spin text-emerald-400" /> Sending Row...
                        </>
                      ) : (
                        <>
                          <Send className="w-3.5 h-3.5 text-emerald-400" /> Send Live Test Row
                        </>
                      )}
                    </button>
                  </div>
                </div>

                {/* Handshake Result */}
                {testResult && (
                  <div
                    className={`p-3 rounded-xl border flex items-start gap-2.5 ${
                      testResult.success
                        ? 'bg-emerald-950/40 border-emerald-500/50 text-emerald-200'
                        : 'bg-rose-950/40 border-rose-500/50 text-rose-200'
                    }`}
                  >
                    {testResult.success ? (
                      <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
                    ) : (
                      <AlertTriangle className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
                    )}
                    <div className="space-y-1 w-full overflow-hidden">
                      <div className="font-bold text-xs">{testResult.message}</div>
                      {testResult.latencyMs !== undefined && (
                        <div className="text-[10px] text-white/70">
                          Roundtrip Latency: <strong>{testResult.latencyMs}ms</strong> • Status: {testResult.status || 200}
                        </div>
                      )}
                    </div>
                  </div>
                )}

                {/* Live Test Row Result */}
                {testRowResult && (
                  <div
                    className={`p-3 rounded-xl border flex items-start gap-2.5 ${
                      testRowResult.success
                        ? 'bg-emerald-950/50 border-emerald-400 text-emerald-100 shadow-[0_0_15px_rgba(16,185,129,0.3)]'
                        : 'bg-rose-950/50 border-rose-400 text-rose-100'
                    }`}
                  >
                    {testRowResult.success ? (
                      <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
                    ) : (
                      <AlertTriangle className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
                    )}
                    <div className="space-y-1">
                      <div className="font-bold text-xs">{testRowResult.message}</div>
                      {testRowResult.success && (
                        <div className="text-[11px] text-emerald-300">
                          👉 Open your Google Sheet tab <strong>"{IBSI_SHEET_TAB_NAME}"</strong> now to see the new row with green status highlight!
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>

              {/* Data Specifications Summary */}
              <div className="p-3.5 rounded-xl bg-[#091122] border border-[#1E293B] text-[11px] space-y-2">
                <div className="font-bold text-white flex items-center gap-1.5">
                  <Sparkles className="w-3.5 h-3.5 text-amber-400" />
                  Target Google Sheet Details:
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-[10px] text-[#A2B2D2]">
                  <div className="p-2.5 rounded-lg bg-[#0E172B] border border-[#1D2B48] space-y-1">
                    <span className="font-bold text-emerald-300">Columns Logged:</span>
                    <div>• <strong>Col A:</strong> Timestamp</div>
                    <div>• <strong>Col B:</strong> Full Name</div>
                    <div>• <strong>Col C:</strong> BU (Business Unit)</div>
                    <div>• <strong>Col D:</strong> Team Name</div>
                  </div>
                  <div className="p-2.5 rounded-lg bg-[#0E172B] border border-[#1D2B48] space-y-1">
                    <span className="font-bold text-emerald-300">Status & Highlighting:</span>
                    <div>• <strong>Col E:</strong> Status ("Check-in")</div>
                    <div>
                      • Highlight: <span className="bg-[#4ade80] text-[#064e3b] font-bold px-1.5 py-0.2 rounded">Green Highlight</span>
                    </div>
                    <div>• Tab Name: <code className="text-cyan-300">{IBSI_SHEET_TAB_NAME}</code></div>
                  </div>
                </div>
              </div>
            </>
          )}

          {activeTab === 'script' && (
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <div>
                  <h4 className="font-bold text-white text-xs">Turnkey Google Apps Script Code</h4>
                  <p className="text-[11px] text-[#8E9BB5]">
                    Paste this exact code in <strong>Extensions &gt; Apps Script</strong> inside your Google Sheet.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={copyScript}
                  className="px-3 py-1.5 rounded-lg text-xs font-bold bg-emerald-600 hover:bg-emerald-500 text-white flex items-center gap-1.5 transition-colors cursor-pointer shadow-md"
                >
                  {copiedCode ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                  {copiedCode ? 'Copied!' : 'Copy Apps Script'}
                </button>
              </div>

              {/* Instructions steps */}
              <div className="p-3 bg-[#081122] rounded-xl border border-cyan-500/30 text-[11px] space-y-1.5 text-slate-200">
                <div className="font-bold text-cyan-300 text-xs">📋 Step-by-Step Deployment Instructions:</div>
                <ol className="list-decimal pl-4 space-y-1 text-[#9DB1D1]">
                  <li>Open your Google Sheet (<span className="text-cyan-300 font-mono">{IBSI_SPREADSHEET_ID}</span>).</li>
                  <li>In the top menu, click <strong>Extensions</strong> &gt; <strong>Apps Script</strong>.</li>
                  <li>Delete any existing code in the editor, click <strong>Copy Apps Script</strong> above, and paste it.</li>
                  <li>Click the <strong>Save</strong> disk icon (or Ctrl+S / Cmd+S).</li>
                  <li>Click <strong>Deploy</strong> (top right) &gt; <strong>New deployment</strong> (or Manage deployments &gt; edit pencil).</li>
                  <li>Click the gear icon next to "Select type" and choose <strong>Web app</strong>.</li>
                  <li>
                    Set <strong>Execute as: "Me"</strong>, and set <strong>Who has access: "Anyone"</strong> (CRITICAL).
                  </li>
                  <li>Click <strong>Deploy</strong> and approve permissions if prompted (Advanced &gt; Go to script).</li>
                  <li>Copy the <strong>Web app URL</strong> (ending in <code className="text-amber-300">/exec</code>).</li>
                  <li>Paste the URL into <strong>Connection Settings</strong> and click <strong>Save URL</strong>.</li>
                </ol>
              </div>

              <pre className="p-3 bg-[#060912] rounded-xl text-emerald-300 font-mono text-[10px] overflow-x-auto max-h-72 border border-[#1E293B]">
                {sampleAppsScriptCode}
              </pre>
            </div>
          )}

          {activeTab === 'troubleshoot' && (
            <div className="space-y-3.5">
              <div className="p-3.5 rounded-xl bg-amber-950/40 border border-amber-500/40 text-amber-200 space-y-1.5">
                <div className="font-bold text-xs flex items-center gap-1.5">
                  <AlertTriangle className="w-4 h-4 text-amber-400" />
                  Why did no data appear in the EventDay tab upon testing?
                </div>
                <p className="text-[11px] text-slate-200 leading-relaxed">
                  Here are the 3 most common reasons and the exact solution for each:
                </p>
              </div>

              <div className="space-y-3 text-xs">
                {/* Issue 1 */}
                <div className="p-3 rounded-xl bg-[#091122] border border-[#1E293B] space-y-1">
                  <div className="font-bold text-emerald-300 flex items-center gap-1.5">
                    <span>1. Deployment Access set to "Only myself" instead of "Anyone"</span>
                  </div>
                  <p className="text-[11px] text-[#8E9BB5] leading-relaxed">
                    When Google Apps Script is deployed with "Only myself" or "Anyone in my organization", external POST requests from the portal receive a Google Sign-in redirect page instead of executing the script.
                  </p>
                  <p className="text-[11px] text-cyan-300 font-semibold">
                    👉 Fix: In Apps Script, click <strong>Deploy</strong> &gt; <strong>Manage deployments</strong> &gt; click the <strong>Edit (pencil)</strong> icon &gt; under <strong>"Who has access"</strong>, select <strong>"Anyone"</strong> &gt; click <strong>Deploy</strong>.
                  </p>
                </div>

                {/* Issue 2 */}
                <div className="p-3 rounded-xl bg-[#091122] border border-[#1E293B] space-y-1">
                  <div className="font-bold text-emerald-300 flex items-center gap-1.5">
                    <span>2. Web App URL was not saved in this portal</span>
                  </div>
                  <p className="text-[11px] text-[#8E9BB5] leading-relaxed">
                    When you deploy your script, Google generates a unique URL for your sheet. If the URL field in this portal was empty or had an old URL, check-ins were not routed to your sheet.
                  </p>
                  <p className="text-[11px] text-cyan-300 font-semibold">
                    👉 Fix: Copy the Web App URL from Apps Script, paste it into the <strong>Connection Settings</strong> tab, and click <strong>Save URL</strong>.
                  </p>
                </div>

                {/* Issue 3 */}
                <div className="p-3 rounded-xl bg-[#091122] border border-[#1E293B] space-y-1">
                  <div className="font-bold text-emerald-300 flex items-center gap-1.5">
                    <span>3. Tab Name in Google Sheet must be "EventDay"</span>
                  </div>
                  <p className="text-[11px] text-[#8E9BB5] leading-relaxed">
                    The script appends rows to the tab named <strong>"EventDay"</strong> (case-sensitive). If the tab has a different name, the script automatically creates a new tab called "EventDay".
                  </p>
                  <p className="text-[11px] text-cyan-300 font-semibold">
                    👉 Check: Look at the bottom tab list of your sheet for the tab named <strong>EventDay</strong>.
                  </p>
                </div>

                {/* Issue 4 */}
                <div className="p-3 rounded-xl bg-[#091122] border border-[#1E293B] space-y-1">
                  <div className="font-bold text-emerald-300 flex items-center gap-1.5">
                    <span>4. Verify with the "Send Live Test Row" button</span>
                  </div>
                  <p className="text-[11px] text-[#8E9BB5] leading-relaxed">
                    In the <strong>Connection Settings</strong> tab, click <strong>"Send Live Test Row to EventDay"</strong>. This directly writes a test row into your sheet so you can see it live.
                  </p>
                </div>
              </div>
            </div>
          )}

          {activeTab === 'sheet_preview' && (
            <div className="space-y-4">
              <div className="p-3.5 rounded-xl bg-emerald-950/30 border border-emerald-500/30 text-emerald-200">
                <div className="font-bold text-xs flex items-center gap-1.5">
                  <Columns className="w-4 h-4 text-emerald-400" />
                  Exact 5 Columns in Google Sheets (Tab: {IBSI_SHEET_TAB_NAME})
                </div>
                <p className="text-[11px] text-[#BACAE5] mt-1">
                  Each scanned attendee is appended as a new row on tab <strong>"{IBSI_SHEET_TAB_NAME}"</strong>, with their <strong>Status</strong> highlighted in vibrant green.
                </p>
              </div>

              {/* Visual Table Mockup matching user's image.png */}
              <div className="overflow-x-auto rounded-xl border border-[#1E293B] bg-[#070B14]">
                <table className="w-full text-[10px] border-collapse text-left font-mono whitespace-nowrap">
                  <thead>
                    <tr className="bg-[#0C1424] text-[#7187A8] border-b border-[#1E293B]">
                      <th className="p-2 border-r border-[#1E293B]">Row</th>
                      <th className="p-2 border-r border-[#1E293B] text-white font-bold">Col A: Timestamp</th>
                      <th className="p-2 border-r border-[#1E293B] text-white font-bold">Col B: Full Name</th>
                      <th className="p-2 border-r border-[#1E293B] text-white font-bold">Col C: BU</th>
                      <th className="p-2 border-r border-[#1E293B] text-white font-bold">Col D: Team Name</th>
                      <th className="p-2 text-[#064e3b] font-bold bg-[#4ade80]">Col E: Status (Green Highlight)</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#172033] text-white">
                    <tr className="hover:bg-white/5">
                      <td className="p-2 border-r border-[#1E293B] text-[#64748B]">1</td>
                      <td className="p-2 border-r border-[#1E293B] font-bold text-cyan-300">Timestamp</td>
                      <td className="p-2 border-r border-[#1E293B] font-bold text-cyan-300">Full Name</td>
                      <td className="p-2 border-r border-[#1E293B] font-bold text-cyan-300">BU</td>
                      <td className="p-2 border-r border-[#1E293B] font-bold text-cyan-300">Team Name</td>
                      <td className="p-2 font-bold text-cyan-300 bg-[#0c1e30]">Status</td>
                    </tr>
                    <tr className="hover:bg-white/5">
                      <td className="p-2 border-r border-[#1E293B] text-[#64748B]">2</td>
                      <td className="p-2 border-r border-[#1E293B] text-[#94A3B8]">2026-09-30 08:30:15</td>
                      <td className="p-2 border-r border-[#1E293B] font-bold text-white">[Scanned Attendee Full Name]</td>
                      <td className="p-2 border-r border-[#1E293B] text-cyan-300">[Attendee BU / Department]</td>
                      <td className="p-2 border-r border-[#1E293B] text-amber-300">[Attendee Team]</td>
                      <td className="p-2 font-black text-[#064e3b] bg-[#4ade80] text-center">Check-in</td>
                    </tr>
                    <tr className="hover:bg-white/5">
                      <td className="p-2 border-r border-[#1E293B] text-[#64748B]">3</td>
                      <td className="p-2 border-r border-[#1E293B] text-[#94A3B8]">2026-09-30 08:32:40</td>
                      <td className="p-2 border-r border-[#1E293B] font-bold text-white">[Scanned Attendee Full Name]</td>
                      <td className="p-2 border-r border-[#1E293B] text-cyan-300">[Attendee BU / Department]</td>
                      <td className="p-2 border-r border-[#1E293B] text-amber-300">[Attendee Team]</td>
                      <td className="p-2 font-black text-[#064e3b] bg-[#4ade80] text-center">Check-in</td>
                    </tr>
                    <tr className="hover:bg-white/5">
                      <td className="p-2 border-r border-[#1E293B] text-[#64748B]">4</td>
                      <td className="p-2 border-r border-[#1E293B] text-[#94A3B8]">2026-09-30 08:34:02</td>
                      <td className="p-2 border-r border-[#1E293B] font-bold text-white">[Scanned Attendee Full Name]</td>
                      <td className="p-2 border-r border-[#1E293B] text-cyan-300">[Attendee BU / Department]</td>
                      <td className="p-2 border-r border-[#1E293B] text-amber-300">[Attendee Team]</td>
                      <td className="p-2 font-black text-[#064e3b] bg-[#4ade80] text-center">Check-in</td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {activeTab === 'logs' && config.pendingSyncCount !== undefined && config.pendingSyncCount > 0 && (
            <div className="space-y-3">
              <div className="p-3.5 rounded-xl bg-amber-950/40 border border-amber-500/40 text-amber-200 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <AlertTriangle className="w-4 h-4 text-amber-400" />
                  <span>{config.pendingSyncCount} check-in(s) saved locally pending sync to Google Sheets.</span>
                </div>
                <button
                  type="button"
                  onClick={handleSyncPending}
                  disabled={isSyncingPending}
                  className="px-3 py-1.5 rounded-lg font-bold text-xs bg-amber-500 hover:bg-amber-400 text-black flex items-center gap-1.5 transition-colors cursor-pointer"
                >
                  {isSyncingPending ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />}
                  Sync All to Sheets
                </button>
              </div>
              {syncMessage && (
                <div className="p-2.5 rounded-lg bg-black/40 text-white font-mono text-xs">
                  {syncMessage}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
