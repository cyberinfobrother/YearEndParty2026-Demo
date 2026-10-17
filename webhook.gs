// ============================================================================
// IBSI YEAR END PARTY 2026 COMMITTEE SCANNER - GOOGLE APPS SCRIPT WEBHOOK (webhook.gs)
// Spreadsheet Tab: "EventDay" (or your current active sheet tab)
// Columns Logged: Timestamp | Full Name | BU | Team Name | Status (Green Highlight)
// ============================================================================

var SPREADSHEET_ID = "1anInd4lDcfN8xlVfKrVlvxxbC2z_72qA-L3yxi8nwrs";
var TARGET_TAB = "EventDay";

/**
 * 1. GET Request Handler
 * Responds to browser tests, pings, or GET-based test check-ins
 */
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
      tabName: sheet ? sheet.getName() : TARGET_TAB,
      totalRows: sheet ? sheet.getLastRow() : 0,
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

/**
 * 2. POST Request Handler
 * Main entry point for QR scanner check-in data
 */
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

/**
 * Resolves the spreadsheet:
 * 1. Opens the target scanner spreadsheet by ID (1anInd4lDcfN8xlVfKrVlvxxbC2z_72qA-L3yxi8nwrs)!
 * 2. Falls back to active sheet only if openById fails
 */
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

/**
 * Resolves the target sheet / tab:
 * Strictly targets 'EventDay'. Inserts the 'EventDay' tab if it doesn't exist!
 */
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

/**
 * Core Single Check-in Logger:
 * Ensures exactly ONE row is added per attendee
 */
function logCheckIn(ss, sheet, data) {
  var now = new Date();
  var timeString = data.timestamp || Utilities.formatDate(now, Session.getScriptTimeZone() || "GMT+8", "yyyy-MM-dd HH:mm:ss");

  // Extract attendee fields from payload
  var fullName = String(data.fullName || data.name || data.participantName || "").trim();
  var bu = String(data.bu || data.department || data.businessUnit || data.office || data.dept || "Technology").trim();
  var teamName = String(data.teamName || data.team || "IBSI Team").trim();
  var status = "Check-in";

  // Parse QR badge fields if fullName contains multi-line text/colons or if only raw data was provided
  var sourceText = (fullName.indexOf("\n") !== -1 || fullName.indexOf(":") !== -1)
    ? fullName
    : (data.rawQrData || data.token || data.raw || data.qrPayload ? String(data.rawQrData || data.token || data.raw || data.qrPayload).trim() : "");

  if (sourceText) {
    var raw = sourceText;

    // 0. Base64 decode check (handles createSecureQRPayload_ from QRService.gs)
    if (!raw.startsWith("{") && !raw.startsWith("http") && raw.length > 12 && raw.indexOf(" ") === -1) {
      try {
        var decodedBytes = Utilities.base64Decode(raw);
        var decodedStr = Utilities.newBlob(decodedBytes).getDataAsString();
        if (decodedStr.startsWith("{") && decodedStr.endsWith("}")) {
          raw = decodedStr;
        }
      } catch (b64Err) {}
    }

    // 1. JSON parsing
    if (raw.startsWith("{") && raw.endsWith("}")) {
      try {
        var obj = JSON.parse(raw);
        fullName = obj.fullName || obj.FullName || obj["Full Name"] || obj.name || obj.Name || "";
        bu = obj.bu || obj.BU || obj.businessUnit || obj["Business Unit"] || obj.department || bu;
        teamName = obj.teamName || obj.TeamName || obj["Team Name"] || obj.team || obj.Team || teamName;
      } catch(_) {}
    }

    // 2. Multi-line Key-Value parsing (Handles Full Name:, Business Unit:, Team:)
    var lines = raw.split(/\r?\n|\\n/);
    var parsedName = "";
    var parsedBu = "";
    var parsedTeam = "";

    for (var l = 0; l < lines.length; l++) {
      var line = lines[l].trim();
      var colonIdx = line.indexOf(":");
      if (colonIdx !== -1) {
        var k = line.substring(0, colonIdx).trim().toLowerCase();
        var v = line.substring(colonIdx + 1).trim();

        if (
          k === "full name" ||
          k === "fullname" ||
          k === "name" ||
          k === "attendee" ||
          k === "participant" ||
          (k.indexOf("name") !== -1 && k.indexOf("team") === -1 && k.indexOf("company") === -1)
        ) {
          if (v) parsedName = v;
        } else if (
          k === "business unit" ||
          k === "businessunit" ||
          k === "bu" ||
          k === "department" ||
          k === "dept" ||
          k === "division" ||
          k === "office" ||
          k.indexOf("business") !== -1 ||
          k.indexOf("unit") !== -1
        ) {
          if (v) parsedBu = v;
        } else if (
          k === "team" ||
          k === "team name" ||
          k === "teamname" ||
          k === "group" ||
          k === "house" ||
          k.indexOf("team") !== -1
        ) {
          if (v) parsedTeam = v;
        }
      }
    }

    if (parsedName) {
      fullName = parsedName;
      if (parsedBu) bu = parsedBu;
      if (parsedTeam) teamName = parsedTeam;
    } else if (!fullName || fullName.indexOf("\n") !== -1) {
      // 3. Positional fallback filtering out event titles like "IBSI YEP 2026"
      var nonHeaders = [];
      for (var j = 0; j < lines.length; j++) {
        var trimmed = lines[j].trim();
        var lower = trimmed.toLowerCase();
        if (lower && lower.indexOf("ibsi yep") !== 0 && lower.indexOf("ibsi year end") !== 0 && lower.indexOf("year end party") !== 0) {
          nonHeaders.push(trimmed);
        }
      }

      if (nonHeaders.length >= 3) {
        fullName = nonHeaders[0].replace(/^full\s*name\s*[:=-]\s*/i, "").trim();
        bu = nonHeaders[1].replace(/^(business\s*unit|bu|dept|department)\s*[:=-]\s*/i, "").trim();
        teamName = nonHeaders[2].replace(/^(team\s*name|team)\s*[:=-]\s*/i, "").trim();
      } else if (nonHeaders.length === 2) {
        fullName = nonHeaders[0].replace(/^full\s*name\s*[:=-]\s*/i, "").trim();
        bu = nonHeaders[1].replace(/^(business\s*unit|bu|dept|department)\s*[:=-]\s*/i, "").trim();
      } else if (nonHeaders.length === 1) {
        fullName = nonHeaders[0].replace(/^full\s*name\s*[:=-]\s*/i, "").trim();
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

/**
 * 5. Direct Test Runner
 * Select this function in the Apps Script toolbar and click "Run" to test writing directly to your sheet!
 */
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
}
