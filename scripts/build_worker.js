import fs from 'fs';
import path from 'path';

// 1. Load optimized background image as Base64
const bgPath = path.join(process.cwd(), 'public', 'ibsi_year_end_bg_worker.jpg');
const bgBase64 = fs.existsSync(bgPath)
  ? fs.readFileSync(bgPath).toString('base64')
  : fs.readFileSync(path.join(process.cwd(), 'public', 'ibsi_year_end_bg.jpg')).toString('base64');

console.log(`Loaded background base64 image: ${bgBase64.length} characters.`);

// 2. Load optimized nautical wheel logo as Base64
const logoPath = path.join(process.cwd(), 'public', 'logo_worker.png');
const logoBase64 = fs.existsSync(logoPath)
  ? fs.readFileSync(logoPath).toString('base64')
  : fs.readFileSync(path.join(process.cwd(), 'public', 'logo.png')).toString('base64');

console.log(`Loaded logo base64 image: ${logoBase64.length} characters.`);

const htmlPath = path.join(process.cwd(), 'public', 'app.html');
let htmlContent = fs.readFileSync(htmlPath, 'utf-8');

// Replace background image URL with base64 data URI
htmlContent = htmlContent.replace(
  "url('/ibsi_year_end_bg.jpg')",
  `url('data:image/jpeg;base64,${bgBase64}')`
);
htmlContent = htmlContent.replace(
  "url('/ibsi_theme_bg.jpg')",
  `url('data:image/jpeg;base64,${bgBase64}')`
);

// Replace logo image URL with base64 data URI
htmlContent = htmlContent.replace(
  'src="/logo.png"',
  `src="data:image/png;base64,${logoBase64}"`
);

const workerCode = `/**
 * ============================================================================
 * IBSI YEAR END PARTY 2026 - COMMITTEE SCANNER (CLOUDFLARE WORKER FULL-STACK APP)
 * Target Spreadsheet ID: 1anInd4lDcfN8xlVfKrVlvxxbC2z_72qA-L3yxi8nwrs
 * Target Sheet Tab: EventDay
 * Logged Columns: Timestamp | Full Name | BU | Team Name | Status (Green Highlight)
 * ============================================================================
 */

const DEFAULT_GOOGLE_SCRIPT_URL =
  'https://script.google.com/a/macros/ibs.com.ph/s/AKfycbwjEbCcwwDRklQLF0L2Dymz8U9afSdZm3RlVMyULlxBK1YfV5TmHxZdYnCUsp6_xXjA/exec';

const IBSI_SPREADSHEET_ID = '1anInd4lDcfN8xlVfKrVlvxxbC2z_72qA-L3yxi8nwrs';
const IBSI_SHEET_TAB_NAME = 'EventDay';

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Requested-With, Accept',
  'Access-Control-Max-Age': '86400',
};

function jsonResponse(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'Content-Type': 'application/json;charset=utf-8',
      ...CORS_HEADERS,
    },
  });
}

const HTML_APP = ${JSON.stringify(htmlContent)};

const recentScans = new Map();

export default {
  async fetch(request, env, ctx) {
    // 1. Handle CORS Preflight
    if (request.method === 'OPTIONS') {
      return new Response(null, {
        status: 200,
        headers: CORS_HEADERS,
      });
    }

    const url = new URL(request.url);
    const googleScriptUrl =
      (env && env.GOOGLE_SCRIPT_URL) || DEFAULT_GOOGLE_SCRIPT_URL;

    // 2. Handle GET requests
    if (request.method === 'GET') {
      const format = url.searchParams.get('format');
      const acceptHeader = request.headers.get('Accept') || '';

      // Return JSON ONLY if explicitly requested via ?format=json, /api/health, or /api/status
      if (
        format === 'json' ||
        url.pathname === '/api/health' ||
        url.pathname === '/api/status' ||
        (url.pathname === '/api' && !acceptHeader.includes('text/html'))
      ) {
        return jsonResponse({
          status: 'ONLINE',
          service: 'IBSI Year End Party 2026 Committee Scanner Proxy Worker',
          timestamp: new Date().toISOString(),
          googleScriptConfigured: Boolean(googleScriptUrl),
          spreadsheetId: IBSI_SPREADSHEET_ID,
          tabName: IBSI_SHEET_TAB_NAME,
          targetColumns: ['Timestamp', 'Full Name', 'BU', 'Team Name', 'Status (Green Highlight)'],
        });
      }

      // DEFAULT BROWSER VISIT: Serve the FULL, RICH, MOBILE-FRIENDLY IBSI YEAR END PARTY 2026 WEB APPLICATION!
      return new Response(HTML_APP, {
        status: 200,
        headers: {
          'Content-Type': 'text/html;charset=utf-8',
          'Cache-Control': 'no-cache',
          ...CORS_HEADERS,
        },
      });
    }

    // 3. Handle POST Requests (Check-in Scanner Relay)
    if (request.method === 'POST') {
      let requestData = {};
      try {
        const contentType = request.headers.get('content-type') || '';
        if (contentType.includes('application/json')) {
          requestData = await request.json();
        } else {
          requestData = JSON.parse(await request.text());
        }
      } catch (err) {
        requestData = {};
      }

      // Handshake / Connection Test
      if (requestData.action === 'validateConnection' || requestData.ping) {
        try {
          const pingRes = await fetch(googleScriptUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'text/plain;charset=utf-8' },
            body: JSON.stringify({
              action: 'validateConnection',
              ping: 'test-handshake',
              spreadsheetId: IBSI_SPREADSHEET_ID,
              sheetName: IBSI_SHEET_TAB_NAME,
              timestamp: new Date().toISOString(),
              client: 'Cloudflare-Worker-Proxy',
            }),
            redirect: 'follow',
          });
          const text = await pingRes.text();
          let json;
          try { json = JSON.parse(text); } catch { json = { message: text }; }
          return jsonResponse({
            success: true,
            status: 'LIVE_CONNECTED',
            message: 'Cloudflare Worker proxy successfully reached Google Apps Script (EventDay)!',
            backendResponse: json,
          });
        } catch (e) {
          return jsonResponse({ success: false, error: e.message }, 502);
        }
      }

      // Forward Attendee Check-In to Google Apps Script
      // STRICT: Ensures ONLY ONE item is submitted per attendee scan
      if (requestData.isDuplicate) {
        return jsonResponse({
          success: true,
          duplicate: true,
          message: 'Attendee already checked in. Duplicate submission skipped.',
        });
      }

      const attendeeName = (requestData.fullName || requestData.name || '').trim().toLowerCase();
      const nowMs = Date.now();
      const lastScanTime = recentScans.get(attendeeName);
      if (attendeeName && lastScanTime && (nowMs - lastScanTime < 10000)) {
        return jsonResponse({
          success: true,
          duplicate: true,
          message: 'Duplicate scan blocked (recent scan within 10s). Only 1 item submitted.',
        });
      }
      if (attendeeName) {
        recentScans.set(attendeeName, nowMs);
        if (recentScans.size > 500) {
          recentScans.clear();
        }
      }

      try {
        const gasResponse = await fetch(googleScriptUrl, {
          method: 'POST',
          headers: {
            'Content-Type': 'text/plain;charset=utf-8',
          },
          body: JSON.stringify({
            action: 'ibsi_checkin',
            spreadsheetId: IBSI_SPREADSHEET_ID,
            sheetName: IBSI_SHEET_TAB_NAME,
            timestamp: requestData.timestamp || new Date().toISOString(),
            fullName: requestData.fullName || requestData.name || 'Participant',
            bu: requestData.bu || requestData.businessUnit || 'Technology',
            teamName: requestData.teamName || requestData.team || 'IBSI Team',
            status: 'Check-in',
            highlightColor: '#4ade80',
          }),
          redirect: 'follow',
        });

        const responseText = await gasResponse.text();
        let responseJson;
        try {
          responseJson = JSON.parse(responseText);
        } catch (e) {
          return jsonResponse({
            success: gasResponse.ok,
            status: gasResponse.status,
            rawResponse: responseText,
          });
        }

        return jsonResponse(responseJson, gasResponse.status);
      } catch (fetchError) {
        return jsonResponse(
          {
            success: false,
            error: 'Error communicating with Google Apps Script: ' + fetchError.message,
          },
          502
        );
      }
    }

    return jsonResponse({ error: 'Method not allowed' }, 405);
  },
};
`;

const workerPath = path.join(process.cwd(), 'worker.js');
const publicWorkerPath = path.join(process.cwd(), 'public', 'worker.js');

fs.writeFileSync(workerPath, workerCode, 'utf-8');
fs.writeFileSync(publicWorkerPath, workerCode, 'utf-8');

console.log(`Successfully generated ${workerPath} (${fs.statSync(workerPath).size} bytes).`);
console.log(`Successfully generated ${publicWorkerPath} (${fs.statSync(publicWorkerPath).size} bytes).`);
