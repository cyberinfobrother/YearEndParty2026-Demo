import fs from 'fs';
import path from 'path';

const bgPath = path.join(process.cwd(), 'public', 'ibsi_theme_bg_mobile.jpg');
const bgBase64 = fs.readFileSync(bgPath).toString('base64');

console.log('Background base64 generated, length:', bgBase64.length);

const workerCode = `/**
 * ============================================================================
 * IBSI TEAM FEST COMMITTEE SCANNER - FULL-STACK CLOUDFLARE WORKER
 * Spreadsheet ID: 1anInd4lDcfN8xlVfKrVlvxxbC2z_72qA-L3yxi8nwrs
 * Sheet Tab: EventDay
 * Columns Logged: Timestamp | Full Name | BU | Team Name | Status (Green Highlight)
 * ============================================================================
 */

const DEFAULT_GOOGLE_SCRIPT_URL =
  'https://script.google.com/macros/s/AKfycbxAeLqizAvH2HGjbQF0eG7rPaf0RTNE41NfC6Xob5fRJINICFsNvIETXNZj08l9DK3A/exec';

const SPREADSHEET_ID = '1anInd4lDcfN8xlVfKrVlvxxbC2z_72qA-L3yxi8nwrs';
const SHEET_TAB_NAME = 'EventDay';

const BG_IMAGE_BASE64 = "${bgBase64}";

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Requested-With, Accept',
  'Access-Control-Max-Age': '86400',
};

const recentScans = new Map();

function jsonResponse(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'Content-Type': 'application/json;charset=utf-8',
      ...CORS_HEADERS,
    },
  });
}

function parseParticipant(raw) {
  let clean = String(raw || '').trim();
  if (!clean) return { fullName: 'Participant', bu: 'Technology', teamName: 'IBSI Team' };

  if (clean.startsWith('http://') || clean.startsWith('https://')) {
    try {
      const u = new URL(clean);
      const fn = u.searchParams.get('fullName') || u.searchParams.get('name') || '';
      const bu = u.searchParams.get('bu') || u.searchParams.get('dept') || '';
      const tm = u.searchParams.get('teamName') || u.searchParams.get('team') || '';
      if (fn) return { fullName: fn, bu: bu || 'Technology', teamName: tm || 'IBSI Team' };
    } catch (_) {}
  }

  if (clean.startsWith('{') && clean.endsWith('}')) {
    try {
      const j = JSON.parse(clean);
      const fn = j.fullName || j.name || j['Full Name'] || '';
      const bu = j.bu || j.BU || j.businessUnit || j.department || '';
      const tm = j.teamName || j.team || j['Team Name'] || '';
      if (fn) return { fullName: String(fn).trim(), bu: String(bu || 'Technology').trim(), teamName: String(tm || 'IBSI Team').trim() };
    } catch (_) {}
  }

  for (const delim of [',', '|', ';', '\\n', '/']) {
    if (clean.includes(delim)) {
      const parts = clean.split(delim).map(s => s.trim()).filter(Boolean);
      if (parts.length >= 3) {
        return { fullName: parts[0], bu: parts[1], teamName: parts[2] };
      } else if (parts.length === 2) {
        return { fullName: parts[0], bu: parts[1], teamName: 'IBSI Team' };
      }
    }
  }

  return { fullName: clean, bu: 'Technology', teamName: 'IBSI Team' };
}

function renderHtml(googleScriptUrl) {
  return \`<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no, viewport-fit=cover" />
  <meta name="theme-color" content="#040c1e" />
  <meta name="mobile-web-app-capable" content="yes" />
  <meta name="apple-mobile-web-app-capable" content="yes" />
  <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
  <meta name="apple-mobile-web-app-title" content="IBSI Scanner" />
  <title>IBSI Team Fest Committee Scanner</title>
  
  <script src="https://cdn.tailwindcss.com"></script>
  <script src="https://cdn.jsdelivr.net/npm/html5-qrcode@2.3.8/html5-qrcode.min.js"></script>
  <script src="https://cdn.jsdelivr.net/npm/canvas-confetti@1.9.3/dist/confetti.browser.min.js"></script>

  <style>
    @keyframes scanLine {
      0% { top: 6%; opacity: 0.8; }
      50% { top: 90%; opacity: 1; }
      100% { top: 6%; opacity: 0.8; }
    }
    .animate-scan-line {
      animation: scanLine 2.2s ease-in-out infinite;
    }
    @keyframes scaleUp {
      from { opacity: 0; transform: scale(0.96); }
      to { opacity: 1; transform: scale(1); }
    }
    .animate-scale-up {
      animation: scaleUp 0.25s cubic-bezier(0.16, 1, 0.3, 1) forwards;
    }
    * {
      -webkit-tap-highlight-color: transparent;
      box-sizing: border-box;
    }
    body {
      touch-action: pan-y;
      overscroll-behavior-y: none;
      background-color: #040c1e;
      background-image: 
        linear-gradient(to bottom, rgba(4, 12, 30, 0.85) 0%, rgba(6, 18, 42, 0.74) 40%, rgba(4, 12, 30, 0.94) 100%),
        url('data:image/jpeg;base64,\${BG_IMAGE_BASE64}');
      background-size: cover;
      background-position: center top;
      background-repeat: no-repeat;
      background-attachment: fixed;
    }
    button, input, select {
      touch-action: manipulation;
    }
    #reader {
      width: 100% !important;
      border: none !important;
      background: #04091a !important;
    }
    #reader video {
      width: 100% !important;
      height: 100% !important;
      max-height: 50vh !important;
      object-fit: cover !important;
      border-radius: 1rem !important;
      transform: scale(1.02);
    }
    #reader img {
      display: none !important;
    }
    @media screen and (max-width: 640px) {
      input[type="text"], select {
        font-size: 16px !important;
      }
    }
    .safe-bottom {
      padding-bottom: max(1.25rem, env(safe-area-inset-bottom, 0px));
    }
    .safe-top {
      padding-top: max(0.5rem, env(safe-area-inset-top, 0px));
    }
  </style>
</head>
<body class="min-h-[100dvh] text-white flex flex-col items-center justify-start p-3 sm:p-6 safe-top safe-bottom font-sans">
  <div class="w-full max-w-xl mx-auto flex flex-col items-center">
    
    <!-- Top Nav Utility Bar -->
    <div class="w-full flex items-center justify-between gap-2 mb-3 pb-2.5 border-b border-white/15">
      <div class="flex items-center gap-2 text-left">
        <div class="w-8 h-8 rounded-xl bg-gradient-to-br from-cyan-400 via-teal-500 to-orange-500 flex items-center justify-center text-white font-black text-xs shadow-md">
          🧭
        </div>
        <div>
          <div class="text-xs font-black text-white flex items-center gap-1.5 leading-none">
            <span>IBSI TEAM FEST</span>
            <span class="text-[9px] font-extrabold text-orange-300 bg-orange-500/20 px-1.5 py-0.2 rounded border border-orange-400/40">2026</span>
          </div>
          <div class="text-[9px] text-cyan-300/90 font-medium mt-0.5">One Team • One Voyage • One Champion</div>
        </div>
      </div>

      <div class="flex items-center gap-1.5">
        <button id="soundBtn" onclick="toggleSound()" class="p-2 min-h-[36px] min-w-[36px] rounded-xl border border-white/20 bg-white/10 text-emerald-400 text-xs font-bold active:scale-95 transition-all">
          🔊
        </button>
        <button onclick="openTestBadges()" class="px-2.5 py-1.5 min-h-[36px] rounded-xl border border-white/15 bg-white/5 text-cyan-300 hover:text-white text-xs font-semibold active:scale-95 transition-all">
          Test QRs
        </button>
        <button onclick="openHistory()" class="px-2.5 py-1.5 min-h-[36px] rounded-xl border border-white/15 bg-white/5 text-amber-300 hover:text-white text-xs font-semibold active:scale-95 transition-all flex items-center gap-1">
          Scans <span id="scanBadge" class="bg-emerald-400 text-black text-[10px] font-black px-1.5 rounded-full">0</span>
        </button>
      </div>
    </div>

    <!-- Main Branding Header -->
    <div class="text-center my-2">
      <div class="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-gradient-to-r from-cyan-500/20 via-orange-500/20 to-teal-500/20 border border-cyan-400/30 text-[10px] font-bold text-cyan-200 uppercase tracking-widest mb-1.5 shadow-sm">
        <span>Fifteen Years, One Horizon</span>
        <span class="text-orange-400">•</span>
        <span class="text-orange-300">Since 2011</span>
      </div>
      <h1 class="text-2xl sm:text-3xl font-black text-white tracking-tight leading-none drop-shadow-md">
        <span>IBSI </span><span class="text-orange-400 italic">TEAM FEST </span><span class="text-cyan-400">2026</span>
      </h1>
      <div class="text-[11px] text-cyan-200/90 font-semibold mt-1 uppercase flex items-center justify-center gap-1.5">
        <span>Committee Scanner</span>
        <span class="text-white/40">•</span>
        <span class="text-emerald-400 font-mono">Tab: \${SHEET_TAB_NAME}</span>
      </div>

      <!-- Date & Venue from Poster -->
      <div class="mt-2.5 flex flex-wrap items-center justify-center gap-2 text-[10px] sm:text-[11px]">
        <div class="inline-flex items-center gap-1.5 px-3 py-1 rounded-xl bg-black/50 border border-white/15 text-white/90">
          <span class="text-orange-400 font-bold">📅 Oct 10, 2026</span>
          <span class="text-white/30">•</span>
          <span class="text-cyan-200 font-medium">Gameville Central Park, Greenfield</span>
        </div>
        <a href="https://docs.google.com/spreadsheets/d/\${SPREADSHEET_ID}/edit#gid=0" target="_blank" class="inline-flex items-center gap-1 px-2.5 py-1 rounded-xl bg-emerald-950/60 border border-emerald-500/40 text-emerald-300 hover:text-white font-mono text-[10px]">
          <span class="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse"></span>
          <span>Sheet [1anInd4l...nwrs] ↗</span>
        </a>
      </div>
    </div>

    <!-- Scanner Bezel & Viewport -->
    <div class="w-full mt-3">
      <div id="scannerBox" class="relative min-h-[280px] rounded-2xl border-2 border-cyan-400/60 bg-[#04091a]/80 backdrop-blur-xl flex flex-col items-center justify-center overflow-hidden shadow-2xl">
        <div id="reader" class="w-full h-full min-h-[280px] rounded-2xl overflow-hidden hidden"></div>
        
        <!-- Reticle Overlay -->
        <div id="reticleOverlay" class="absolute inset-0 pointer-events-none flex items-center justify-center hidden">
          <div class="relative w-56 h-56 border-2 border-cyan-400/60 rounded-xl overflow-hidden shadow-[0_0_15px_rgba(6,182,212,0.25)]">
            <div class="absolute top-0 left-0 w-6 h-6 border-t-4 border-l-4 border-cyan-400 rounded-tl"></div>
            <div class="absolute top-0 right-0 w-6 h-6 border-t-4 border-r-4 border-cyan-400 rounded-tr"></div>
            <div class="absolute bottom-0 left-0 w-6 h-6 border-b-4 border-l-4 border-cyan-400 rounded-bl"></div>
            <div class="absolute bottom-0 right-0 w-6 h-6 border-b-4 border-r-4 border-cyan-400 rounded-br"></div>
            <div class="absolute inset-x-0 h-1 bg-gradient-to-r from-transparent via-[#00E5FF] to-transparent shadow-[0_0_14px_#00E5FF] animate-scan-line"></div>
          </div>
          <div class="absolute bottom-3 px-3.5 py-1.5 rounded-full bg-black/70 backdrop-blur-xl text-xs text-white border border-white/20 flex items-center gap-2">
            <span class="w-2 h-2 rounded-full bg-cyan-400 animate-pulse"></span>
            <span id="scanStatus">Camera Live — Align attendee badge</span>
          </div>
        </div>

        <!-- Idle State -->
        <div id="idleState" class="p-6 text-center flex flex-col items-center justify-center gap-3">
          <div class="w-16 h-16 rounded-2xl bg-white/10 border border-white/20 flex items-center justify-center text-cyan-400 text-3xl shadow-lg">
            📷
          </div>
          <div>
            <h3 class="text-base font-bold text-white">Camera Inactive</h3>
            <p class="text-xs text-[#9BB0D3] mt-1 max-w-xs">Tap below to launch continuous live scanning for attendee badges.</p>
          </div>
        </div>
      </div>

      <!-- Action Buttons -->
      <div class="mt-3 flex flex-col gap-2">
        <div id="idleButtons" class="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
          <button onclick="startScanning()" class="py-3.5 px-4 min-h-[48px] rounded-xl font-black text-sm text-white bg-gradient-to-r from-cyan-500 via-teal-500 to-orange-500 hover:from-cyan-400 hover:to-orange-400 active:scale-[0.98] transition-all flex items-center justify-center gap-2 shadow-lg shadow-cyan-900/50 border border-cyan-300/40 cursor-pointer">
            <span>📷 Start Live Camera Scanner</span>
          </button>
          <button onclick="document.getElementById('fileInput').click()" class="py-3.5 px-4 min-h-[48px] rounded-xl font-bold text-sm text-white bg-white/10 hover:bg-white/15 border border-white/20 active:scale-[0.98] transition-all flex items-center justify-center gap-2 cursor-pointer shadow-md">
            <span>📤 Take / Upload QR Photo</span>
          </button>
        </div>

        <div id="activeButtons" class="flex flex-col gap-2 hidden">
          <div class="grid grid-cols-2 gap-2">
            <button onclick="restartCamera()" class="py-2.5 px-3 rounded-xl font-bold text-xs text-white bg-white/10 hover:bg-white/15 border border-white/20 active:scale-95 transition-all">
              🔄 Restart Camera
            </button>
            <button onclick="stopScanning()" class="py-2.5 px-3 rounded-xl font-bold text-xs text-rose-200 bg-rose-950/60 hover:bg-rose-900/60 border border-rose-500/40 active:scale-95 transition-all">
              ⏹ Pause Camera
            </button>
          </div>
          <div class="flex items-center justify-between gap-2 p-2 rounded-xl bg-white/5 border border-white/10 text-xs">
            <button onclick="flipCamera()" class="px-3 py-1.5 rounded-lg bg-white/10 hover:bg-white/20 text-cyan-300 font-bold border border-white/15">
              🔄 Flip Front/Back
            </button>
            <span class="text-cyan-300 font-medium flex items-center gap-1.5">
              <span class="w-2 h-2 rounded-full bg-cyan-400 animate-pulse"></span>
              Live Scanner Active
            </span>
          </div>
        </div>

        <input type="file" id="fileInput" accept="image/*" capture="environment" style="display:none;" onchange="handleFileUpload(event)" />
      </div>
    </div>

    <!-- Scan Result Card (With Green Highlight Status) -->
    <div id="resultCard" class="w-full mt-4 p-5 rounded-2xl text-center text-white shadow-2xl transition-all animate-scale-up hidden">
      <div class="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-black/50 text-[11px] font-semibold text-emerald-300 border border-emerald-400/30 mb-2">
        <span class="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse"></span>
        Camera Ready — Ready for next attendee
      </div>

      <div class="flex items-center justify-center gap-2 mb-2">
        <span id="resultIcon" class="text-2xl">✅</span>
        <div id="resultTitle" class="text-xl font-black tracking-wide uppercase text-emerald-300">CHECK-IN SUCCESSFUL!</div>
      </div>
      <p id="resultMsg" class="text-sm text-white/95 my-2 font-medium"></p>

      <!-- Details Card with Green Highlighted Status -->
      <div id="resultDetails" class="my-3.5 p-4 rounded-xl bg-black/60 border border-white/15 max-w-md mx-auto text-left space-y-2.5 shadow-inner">
        <div class="text-[10px] uppercase font-extrabold text-emerald-400 pb-1.5 border-b border-white/10 flex items-center justify-between">
          <span>Event Day Data Logged</span>
          <span class="text-cyan-300 font-mono">Tab: \${SHEET_TAB_NAME}</span>
        </div>
        <div>
          <div class="text-[10px] text-[#9BB0D3] font-semibold">Full Name</div>
          <div id="resFullName" class="text-lg font-black text-white"></div>
        </div>
        <div class="grid grid-cols-2 gap-2 pt-1 border-t border-white/10">
          <div>
            <div class="text-[10px] text-[#9BB0D3] font-semibold">BU (Business Unit)</div>
            <div id="resBu" class="text-xs font-bold text-white mt-0.5"></div>
          </div>
          <div>
            <div class="text-[10px] text-[#9BB0D3] font-semibold">Team Name</div>
            <div id="resTeam" class="text-xs font-bold text-white mt-0.5"></div>
          </div>
        </div>
        <div class="pt-2 border-t border-white/10 flex items-center justify-between gap-2">
          <div>
            <div class="text-[10px] text-[#9BB0D3] font-semibold">Timestamp</div>
            <div id="resTime" class="text-[11px] font-mono text-white/90"></div>
          </div>
          <div class="text-right">
            <div class="text-[10px] text-[#9BB0D3] font-semibold mb-0.5">Status</div>
            <!-- VIBRANT GREEN HIGHLIGHT -->
            <div class="inline-flex items-center gap-1 px-3 py-1 rounded-lg bg-[#22c55e] text-[#064e3b] font-black text-xs shadow-md border border-[#16a34a] animate-pulse">
              ✓ <span>Check-in</span>
            </div>
          </div>
        </div>
        <div class="pt-2 border-t border-white/10 flex items-center justify-between text-[11px] text-emerald-300 bg-emerald-950/60 p-2 rounded-lg border border-emerald-500/40">
          <div class="flex items-center gap-1.5">
            <span class="w-2 h-2 rounded-full bg-emerald-400 animate-pulse"></span>
            <span id="resSyncText">Logged to Google Sheet [EventDay]</span>
          </div>
          <a href="https://docs.google.com/spreadsheets/d/\${SPREADSHEET_ID}/edit#gid=0" target="_blank" class="text-cyan-300 underline font-mono text-[10px]">View ↗</a>
        </div>
      </div>

      <div class="mt-4 flex gap-2">
        <button onclick="dismissResult(true)" class="flex-1 py-3 px-4 rounded-xl font-bold text-sm text-white bg-gradient-to-r from-emerald-500 via-teal-500 to-cyan-600 hover:from-emerald-400 hover:to-cyan-500 active:scale-95 transition-all shadow-lg">
          Ready for Next Attendee ➔
        </button>
        <button onclick="dismissResult(false)" class="py-3 px-4 rounded-xl font-semibold text-xs text-white/80 bg-black/40 border border-white/15">
          Dismiss
        </button>
      </div>
    </div>

    <!-- Manual Attendee Entry Form -->
    <div class="w-full mt-4 p-4 rounded-2xl bg-black/40 border border-white/15 text-left">
      <div class="flex items-center justify-between">
        <span class="text-xs font-bold text-white uppercase tracking-wider flex items-center gap-1.5">
          👤 Manual Attendee Check-In
        </span>
        <button onclick="toggleManualForm()" id="manualToggleBtn" class="text-xs text-cyan-300 hover:text-white font-semibold cursor-pointer">
          Show Form
        </button>
      </div>

      <form id="manualForm" onsubmit="handleManualSubmit(event)" class="mt-3 space-y-3 hidden">
        <div>
          <label class="block text-[11px] font-semibold text-[#9BB0D3] mb-1">Full Name <span class="text-rose-400">*</span></label>
          <input type="text" id="manualName" required placeholder="e.g. John Mark Reyes" class="w-full px-3 py-2 bg-black/60 text-white rounded-xl border border-white/20 focus:outline-none focus:border-emerald-400 text-xs" />
        </div>
        <div class="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
          <div>
            <label class="block text-[11px] font-semibold text-[#9BB0D3] mb-1">BU (Business Unit)</label>
            <select id="manualBu" class="w-full px-3 py-2 bg-black/70 text-white rounded-xl border border-white/20 focus:outline-none focus:border-cyan-400 text-xs">
              <option value="Technology & Digital">Technology & Digital</option>
              <option value="Retail Banking">Retail Banking</option>
              <option value="Corporate Finance">Corporate Finance</option>
              <option value="Human Resources">Human Resources</option>
              <option value="Operations & Logistics">Operations & Logistics</option>
              <option value="Risk & Compliance">Risk & Compliance</option>
              <option value="Marketing & CX">Marketing & CX</option>
              <option value="Legal & Governance">Legal & Governance</option>
            </select>
          </div>
          <div>
            <label class="block text-[11px] font-semibold text-[#9BB0D3] mb-1">Team Name</label>
            <input type="text" id="manualTeam" placeholder="e.g. Cyber Tigers" value="Cyber Tigers" class="w-full px-3 py-2 bg-black/60 text-white rounded-xl border border-white/20 focus:outline-none focus:border-amber-400 text-xs" />
          </div>
        </div>
        <button type="submit" class="w-full py-2.5 px-4 rounded-xl font-bold text-xs bg-emerald-600 hover:bg-emerald-500 text-white flex items-center justify-center gap-1.5 transition-all shadow-md">
          <span>Record Check-in to Google Sheet</span>
          <span class="bg-[#22c55e] text-[#064e3b] font-black px-1.5 py-0.2 rounded text-[10px]">Green Highlight</span>
        </button>
      </form>
    </div>

    <!-- Footer info -->
    <div class="w-full mt-4 p-3 rounded-xl bg-black/50 border border-white/10 text-xs flex items-center justify-between text-[#9BB0D3]">
      <div class="flex items-center gap-2">
        <span class="w-2 h-2 rounded-full bg-emerald-400 animate-pulse"></span>
        <span>Google Sheet Tab: <strong>\${SHEET_TAB_NAME}</strong></span>
      </div>
      <div class="font-mono text-emerald-400 font-bold">
        <span id="scanCountText">0</span> Check-ins Recorded
      </div>
    </div>
  </div>

  <!-- History Modal -->
  <div id="historyModal" class="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4 hidden">
    <div class="relative w-full max-w-xl bg-[#0F172A] border border-[#1E293B] rounded-2xl shadow-2xl p-5 text-white max-h-[85vh] flex flex-col">
      <div class="flex items-center justify-between pb-3 border-b border-white/10">
        <h3 class="font-bold text-sm">IBSI Team Fest Check-in Logs</h3>
        <button onclick="closeHistory()" class="text-[#8E9BB5] hover:text-white">✕</button>
      </div>
      <div id="historyList" class="my-3 overflow-y-auto flex-1 space-y-2 text-xs"></div>
      <div class="pt-3 border-t border-white/10 flex justify-between">
        <button onclick="exportCSV()" class="px-3 py-1.5 rounded-lg bg-[#1E293B] text-emerald-300 font-bold text-xs">Export CSV</button>
        <button onclick="clearHistory()" class="px-3 py-1.5 rounded-lg bg-red-950/60 text-red-300 text-xs">Clear Session</button>
      </div>
    </div>
  </div>

  <!-- Test Badges Modal -->
  <div id="testModal" class="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4 hidden">
    <div class="relative w-full max-w-md bg-[#0F172A] border border-[#1E293B] rounded-2xl shadow-2xl p-5 text-white max-h-[85vh] flex flex-col">
      <div class="flex items-center justify-between pb-3 border-b border-white/10">
        <h3 class="font-bold text-sm">Test Attendee Badges</h3>
        <button onclick="closeTestBadges()" class="text-[#8E9BB5] hover:text-white">✕</button>
      </div>
      <div class="my-3 overflow-y-auto flex-1 space-y-2 text-xs text-left" id="testRoster">
        <button onclick="simulateScan('John Mark Reyes', 'Technology & Digital', 'Cyber Tigers')" class="w-full p-2.5 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 text-left">
          <div class="font-bold text-white">John Mark Reyes</div>
          <div class="text-[10px] text-cyan-300">Technology & Digital • Cyber Tigers</div>
        </button>
        <button onclick="simulateScan('Maria Santos', 'Retail Banking', 'Golden Eagles')" class="w-full p-2.5 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 text-left">
          <div class="font-bold text-white">Maria Santos</div>
          <div class="text-[10px] text-amber-300">Retail Banking • Golden Eagles</div>
        </button>
        <button onclick="simulateScan('Carlos Mendoza', 'Corporate Finance', 'Blue Sharks')" class="w-full p-2.5 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 text-left">
          <div class="font-bold text-white">Carlos Mendoza</div>
          <div class="text-[10px] text-cyan-300">Corporate Finance • Blue Sharks</div>
        </button>
        <button onclick="simulateScan('Bea Alonzo', 'Human Resources', 'Red Dragons')" class="w-full p-2.5 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 text-left">
          <div class="font-bold text-white">Bea Alonzo</div>
          <div class="text-[10px] text-rose-300">Human Resources • Red Dragons</div>
        </button>
        <button onclick="simulateScan('David Lim', 'Operations & Logistics', 'Phoenix Rising')" class="w-full p-2.5 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 text-left">
          <div class="font-bold text-white">David Lim</div>
          <div class="text-[10px] text-orange-300">Operations & Logistics • Phoenix Rising</div>
        </button>
      </div>
    </div>
  </div>

  <script>
    let html5QrScanner = null;
    let isScanning = false;
    let soundEnabled = true;
    let currentCameraIndex = 0;
    let cameraList = [];
    let scans = JSON.parse(localStorage.getItem('ibsi_teamfest_scans_prod') || '[]');

    function updateBadge() {
      document.getElementById('scanBadge').textContent = scans.length;
      document.getElementById('scanCountText').textContent = scans.length;
    }
    updateBadge();

    // Sound synthesizer using Web Audio API
    let audioCtx = null;
    function playBeep(freq, type, duration) {
      if (!soundEnabled) return;
      try {
        if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
        if (audioCtx.state === 'suspended') audioCtx.resume();
        const osc = audioCtx.createOscillator();
        const gain = audioCtx.createGain();
        osc.type = type || 'sine';
        osc.frequency.setValueAtTime(freq, audioCtx.currentTime);
        gain.gain.setValueAtTime(0.18, audioCtx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + duration);
        osc.connect(gain);
        gain.connect(audioCtx.destination);
        osc.start();
        osc.stop(audioCtx.currentTime + duration);
      } catch(e) {}
    }

    function toggleSound() {
      soundEnabled = !soundEnabled;
      document.getElementById('soundBtn').textContent = soundEnabled ? '🔊' : '🔇';
      if (soundEnabled) playBeep(660, 'sine', 0.2);
    }

    function triggerConfetti() {
      try {
        confetti({
          particleCount: 110,
          spread: 75,
          origin: { y: 0.6 },
          colors: ['#22c55e', '#10b981', '#06b6d4', '#f97316', '#eab308']
        });
      } catch(e) {}
    }

    async function startScanning() {
      document.getElementById('idleState').classList.add('hidden');
      document.getElementById('idleButtons').classList.add('hidden');
      document.getElementById('reader').classList.remove('hidden');
      document.getElementById('reticleOverlay').classList.remove('hidden');
      document.getElementById('activeButtons').classList.remove('hidden');
      document.getElementById('scanStatus').textContent = 'Starting camera...';

      try {
        html5QrScanner = new Html5Qrcode('reader');
        cameraList = await Html5Qrcode.getCameras();
        let targetCam = { facingMode: 'environment' };
        if (cameraList && cameraList.length > 0) {
          const back = cameraList.find(c => c.label.toLowerCase().includes('back') || c.label.toLowerCase().includes('rear'));
          targetCam = back ? back.id : cameraList[0].id;
        }

        await html5QrScanner.start(
          targetCam,
          { fps: 15, qrbox: { width: 230, height: 230 } },
          (decodedText) => onScanSuccess(decodedText),
          () => {}
        );
        isScanning = true;
        document.getElementById('scanStatus').textContent = 'Camera Live — Align attendee badge';
      } catch (err) {
        alert('Could not start camera: ' + (err.message || err) + '. You can still use "Take / Upload QR Photo" or "Manual Attendee Check-In".');
        stopScanning();
      }
    }

    async function stopScanning() {
      if (html5QrScanner && isScanning) {
        try {
          await html5QrScanner.stop();
          await html5QrScanner.clear();
        } catch(e) {}
        html5QrScanner = null;
      }
      isScanning = false;
      document.getElementById('reader').classList.add('hidden');
      document.getElementById('reticleOverlay').classList.add('hidden');
      document.getElementById('activeButtons').classList.add('hidden');
      document.getElementById('idleState').classList.remove('hidden');
      document.getElementById('idleButtons').classList.remove('hidden');
    }

    async function restartCamera() {
      await stopScanning();
      setTimeout(startScanning, 200);
    }

    async function flipCamera() {
      if (cameraList.length < 2) return;
      currentCameraIndex = (currentCameraIndex + 1) % cameraList.length;
      if (html5QrScanner && isScanning) {
        await html5QrScanner.stop();
        await html5QrScanner.start(
          cameraList[currentCameraIndex].id,
          { fps: 15, qrbox: { width: 230, height: 230 } },
          onScanSuccess,
          () => {}
        );
      }
    }

    async function handleFileUpload(e) {
      if (!e.target.files || !e.target.files[0]) return;
      const file = e.target.files[0];
      await stopScanning();
      const tempScanner = new Html5Qrcode('reader');
      try {
        const decoded = await tempScanner.scanFile(file, true);
        onScanSuccess(decoded);
      } catch(err) {
        alert('Could not read a valid QR code from this image. Please ensure the QR is clear and in focus.');
      }
    }

    let isScanLocked = false;
    let lastScannedName = "";
    let lastScannedTime = 0;

    async function onScanSuccess(raw) {
      if (isScanLocked) return;
      if (!raw || !raw.trim()) return;

      const p = parseParticipantClient(raw);
      const nameLower = (p.fullName || '').trim().toLowerCase();
      const now = Date.now();

      // Immediately lock scanning so extra frames are not processed
      isScanLocked = true;

      // Debounce burst protection: if same attendee was scanned in last 8s, ignore
      if (nameLower && nameLower === lastScannedName && (now - lastScannedTime < 8000)) {
        return;
      }
      lastScannedName = nameLower;
      lastScannedTime = now;

      // Stop scanning immediately
      await stopScanning();
      
      // Haptic vibration
      if (navigator.vibrate) navigator.vibrate([40, 30, 40]);

      // Strict duplicate check against all existing scans
      const isDuplicate = scans.some(s => s.fullName.toLowerCase() === p.fullName.toLowerCase() && s.bu.toLowerCase() === p.bu.toLowerCase());

      const nowDate = new Date();
      const timestampStr = nowDate.toLocaleDateString() + ' ' + nowDate.toLocaleTimeString();

      const scanRecord = {
        id: 'scan-' + Date.now(),
        timestamp: Date.now(),
        dateTime: timestampStr,
        fullName: p.fullName,
        bu: p.bu,
        teamName: p.teamName,
        status: 'Check-in',
        isDuplicate
      };

      scans.unshift(scanRecord);
      localStorage.setItem('ibsi_teamfest_scans_prod', JSON.stringify(scans));
      updateBadge();

      // Display result card
      const card = document.getElementById('resultCard');
      card.classList.remove('hidden');
      document.getElementById('resFullName').textContent = p.fullName;
      document.getElementById('resBu').textContent = p.bu;
      document.getElementById('resTeam').textContent = p.teamName;
      document.getElementById('resTime').textContent = timestampStr;

      if (isDuplicate) {
        playBeep(440, 'triangle', 0.25);
        document.getElementById('resultIcon').textContent = '⚠️';
        document.getElementById('resultTitle').textContent = 'ALREADY CHECKED IN';
        document.getElementById('resultTitle').className = 'text-xl font-black uppercase text-amber-300';
        document.getElementById('resultMsg').textContent = 'Attendee ' + p.fullName + ' (' + p.bu + ') was already recorded previously.';
        card.className = 'w-full mt-4 p-5 rounded-2xl text-center text-white shadow-2xl transition-all animate-scale-up bg-[#261a07]/90 border-2 border-amber-400/60';
        document.getElementById('resSyncText').textContent = 'Duplicate row skipped — attendee already checked in';
        return; // DO NOT SUBMIT TO GOOGLE SHEETS!
      } else {
        playBeep(880, 'sine', 0.2);
        triggerConfetti();
        document.getElementById('resultIcon').textContent = '✅';
        document.getElementById('resultTitle').textContent = 'CHECK-IN SUCCESSFUL!';
        document.getElementById('resultTitle').className = 'text-xl font-black uppercase text-emerald-300';
        document.getElementById('resultMsg').textContent = 'Check-in recorded to EventDay tab with green status highlight.';
        card.className = 'w-full mt-4 p-5 rounded-2xl text-center text-white shadow-2xl transition-all animate-scale-up bg-[#062416]/90 border-2 border-emerald-400/60';
      }

      card.scrollIntoView({ behavior: 'smooth', block: 'nearest' });

      // Forward EXACTLY ONE row to Google Sheets via POST to Worker
      try {
        document.getElementById('resSyncText').textContent = 'Submitting 1 item to Google Sheet...';
        fetch(window.location.origin, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            action: 'ibsi_checkin',
            timestamp: timestampStr,
            fullName: p.fullName,
            bu: p.bu,
            teamName: p.teamName,
            status: 'Check-in',
            isDuplicate: false
          })
        }).then(r => r.json()).then(res => {
          if (res && res.rowNumber) {
            document.getElementById('resSyncText').textContent = '✓ Logged 1 entry to Google Sheet (Row ' + res.rowNumber + ')';
          }
        }).catch(() => {});
      } catch(e) {}
    }

    function parseParticipantClient(raw) {
      let clean = String(raw || '').trim();
      if (!clean) return { fullName: 'Participant', bu: 'Technology', teamName: 'IBSI Team' };

      if (clean.startsWith('{') && clean.endsWith('}')) {
        try {
          const j = JSON.parse(clean);
          return {
            fullName: j.fullName || j.name || 'Participant',
            bu: j.bu || j.department || 'Technology & Digital',
            teamName: j.teamName || j.team || 'Cyber Tigers'
          };
        } catch(_) {}
      }

      for (const delim of [',', '|', ';', '\\n', '/']) {
        if (clean.includes(delim)) {
          const parts = clean.split(delim).map(s => s.trim()).filter(Boolean);
          if (parts.length >= 3) return { fullName: parts[0], bu: parts[1], teamName: parts[2] };
          if (parts.length === 2) return { fullName: parts[0], bu: parts[1], teamName: 'IBSI Team' };
        }
      }

      return { fullName: clean, bu: 'Technology & Digital', teamName: 'IBSI Team' };
    }

    function dismissResult(resume) {
      isScanLocked = false;
      document.getElementById('resultCard').classList.add('hidden');
      if (resume && !isScanning) startScanning();
    }

    function toggleManualForm() {
      const f = document.getElementById('manualForm');
      const b = document.getElementById('manualToggleBtn');
      if (f.classList.contains('hidden')) {
        f.classList.remove('hidden');
        b.textContent = 'Hide Form';
      } else {
        f.classList.add('hidden');
        b.textContent = 'Show Form';
      }
    }

    function handleManualSubmit(e) {
      e.preventDefault();
      const fn = document.getElementById('manualName').value.trim();
      const bu = document.getElementById('manualBu').value;
      const tm = document.getElementById('manualTeam').value.trim() || 'IBSI Team';
      if (!fn) return;

      onScanSuccess(JSON.stringify({ fullName: fn, bu, teamName: tm }));
      document.getElementById('manualName').value = '';
    }

    function openTestBadges() { document.getElementById('testModal').classList.remove('hidden'); }
    function closeTestBadges() { document.getElementById('testModal').classList.add('hidden'); }
    function simulateScan(fn, bu, tm) {
      closeTestBadges();
      onScanSuccess(JSON.stringify({ fullName: fn, bu, teamName: tm }));
    }

    function openHistory() {
      const modal = document.getElementById('historyModal');
      const list = document.getElementById('historyList');
      list.innerHTML = '';
      if (scans.length === 0) {
        list.innerHTML = '<div class="py-8 text-center text-[#8E9BB5]">No check-ins recorded yet.</div>';
      } else {
        scans.forEach(s => {
          const item = document.createElement('div');
          item.className = 'p-2.5 rounded-xl bg-white/5 border border-white/10 flex justify-between items-center text-xs';
          item.innerHTML = '<div><div class="font-bold text-white">' + s.fullName + ' <span class="bg-[#22c55e] text-[#064e3b] text-[10px] font-black px-1.5 py-0.2 rounded">Check-in</span></div><div class="text-[10px] text-[#9BB0D3] mt-0.5">' + s.bu + ' • ' + s.teamName + '</div></div><div class="text-right text-[10px] font-mono text-[#8E9BB5]">' + s.dateTime + '</div>';
          list.appendChild(item);
        });
      }
      modal.classList.remove('hidden');
    }
    function closeHistory() { document.getElementById('historyModal').classList.add('hidden'); }
    function clearHistory() {
      if (confirm('Clear check-in list for this session?')) {
        scans = [];
        localStorage.removeItem('ibsi_teamfest_scans_prod');
        updateBadge();
        closeHistory();
      }
    }
    function exportCSV() {
      if (scans.length === 0) return;
      const headers = ['Timestamp', 'Full Name', 'BU', 'Team Name', 'Status'];
      const rows = scans.map(s => ['"' + s.dateTime + '"', '"' + s.fullName + '"', '"' + s.bu + '"', '"' + s.teamName + '"', '"Check-in"']);
      const csv = 'data:text/csv;charset=utf-8,' + [headers.join(','), ...rows.map(r => r.join(','))].join('\\n');
      const link = document.createElement('a');
      link.href = encodeURI(csv);
      link.download = 'IBSI-Team-Fest-EventDay-' + new Date().toISOString().slice(0, 10) + '.csv';
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    }
  </script>
</body>
</html>\`;
}

export default {
  async fetch(request, env, ctx) {
    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 200, headers: CORS_HEADERS });
    }

    const url = new URL(request.url);
    const googleScriptUrl = (env && env.GOOGLE_SCRIPT_URL) || DEFAULT_GOOGLE_SCRIPT_URL;

    // 1. Serve background image directly if requested
    if (url.pathname === '/ibsi_theme_bg.jpg') {
      const binaryString = atob(BG_IMAGE_BASE64);
      const len = binaryString.length;
      const bytes = new Uint8Array(len);
      for (let i = 0; i < len; i++) {
        bytes[i] = binaryString.charCodeAt(i);
      }
      return new Response(bytes.buffer, {
        headers: {
          'Content-Type': 'image/jpeg',
          'Cache-Control': 'public, max-age=86400, immutable',
          ...CORS_HEADERS,
        },
      });
    }

    // 2. Health check endpoint or explicit ?format=json
    const acceptHeader = request.headers.get('accept') || '';
    const wantsJson = url.searchParams.get('format') === 'json' || url.pathname === '/api/health' || (acceptHeader.includes('application/json') && !acceptHeader.includes('text/html'));

    if (request.method === 'GET') {
      if (wantsJson) {
        return jsonResponse({
          status: 'ONLINE',
          service: 'IBSI Team Fest Committee Scanner Proxy Worker',
          timestamp: new Date().toISOString(),
          googleScriptConfigured: Boolean(googleScriptUrl),
          spreadsheetId: SPREADSHEET_ID,
          tabName: SHEET_TAB_NAME,
          targetColumns: ['Timestamp', 'Full Name', 'BU', 'Team Name', 'Status (Green Highlight)'],
        });
      }

      // Default for Browser: Return complete HTML Application
      return new Response(renderHtml(googleScriptUrl), {
        headers: {
          'Content-Type': 'text/html;charset=utf-8',
          'Cache-Control': 'no-cache',
          ...CORS_HEADERS,
        },
      });
    }

    // 3. POST Check-in request handler (proxy to Google Apps Script)
    if (request.method === 'POST') {
      let requestData = {};
      try {
        const contentType = request.headers.get('content-type') || '';
        if (contentType.includes('application/json')) {
          requestData = await request.json();
        } else {
          requestData = JSON.parse(await request.text());
        }
      } catch (_) {
        requestData = {};
      }

      if (requestData.action === 'validateConnection' || requestData.ping) {
        try {
          const pingRes = await fetch(googleScriptUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'text/plain;charset=utf-8' },
            body: JSON.stringify({
              action: 'validateConnection',
              ping: 'test-handshake',
              spreadsheetId: SPREADSHEET_ID,
              sheetName: SHEET_TAB_NAME,
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
            message: 'Worker proxy reached Google Apps Script (EventDay)!',
            backendResponse: json,
          });
        } catch (e) {
          return jsonResponse({ success: false, error: e.message }, 502);
        }
      }

      // If client flagged as duplicate, do NOT submit duplicate item to Google Apps Script!
      if (requestData.isDuplicate) {
        return jsonResponse({
          success: true,
          duplicate: true,
          message: 'Attendee already checked in. Duplicate submission skipped.',
        });
      }

      const p = parseParticipant(requestData.rawQrData || requestData.fullName || requestData.name);
      const fullName = requestData.fullName || p.fullName;
      const bu = requestData.bu || p.bu;
      const teamName = requestData.teamName || p.teamName;
      const timestamp = requestData.timestamp || new Date().toLocaleString();

      const attendeeName = (fullName || '').trim().toLowerCase();
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
            spreadsheetId: SPREADSHEET_ID,
            sheetName: SHEET_TAB_NAME,
            timestamp,
            fullName,
            bu,
            teamName,
            status: 'Check-in',
            highlightColor: '#4ade80',
            row: [timestamp, fullName, bu, teamName, 'Check-in'],
          }),
          redirect: 'follow',
        });

        const responseText = await gasResponse.text();
        let responseJson;
        try {
          responseJson = JSON.parse(responseText);
        } catch (_) {
          responseJson = { success: gasResponse.ok, rawText: responseText };
        }

        return jsonResponse(responseJson, gasResponse.status);
      } catch (fetchError) {
        return jsonResponse(
          {
            success: false,
            error: 'Google Apps Script sync error: ' + fetchError.message,
            savedLocally: true,
          },
          502
        );
      }
    }

    return jsonResponse({ error: 'Method not allowed' }, 405);
  },
};
`;

fs.writeFileSync(path.join(process.cwd(), 'worker.js'), workerCode, 'utf-8');
fs.writeFileSync(path.join(process.cwd(), 'public', 'worker.js'), workerCode, 'utf-8');
console.log('Successfully wrote worker.js and public/worker.js!');
