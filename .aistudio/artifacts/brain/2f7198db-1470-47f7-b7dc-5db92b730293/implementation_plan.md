# Multi-Line Key-Value QR Code Parser & Column Alignment

Enhance the QR code parsing engine across the web application, Cloudflare Worker (`worker.js`), and Apps Script webhook so that multi-line event badges containing `Full Name:`, `Business Unit:`, and `Team:` are cleanly extracted into their designated Google Sheets columns rather than dumped as raw text.

---

### User Review & Critical Decisions

> [!IMPORTANT]
> **Confirmed QR Badge Format**:
> The badge scanned on-site contains multi-line key-value text in this exact structure:
> ```text
> IBSI YEP 2026
> Full Name: REYNALDO AGUILAR JR
> Business Unit: IT Delivery - Cybersecurity
> Team: Peridot
> ```
> 
> **Key Parsing Decisions**:
> 1. **Robust Key-Value Line Extraction**: Split raw QR content by line breaks (`\n` or `\r\n`), then evaluate each line for case-insensitive label prefixes (`Full Name:`, `Name:`, `Business Unit:`, `BU:`, `Department:`, `Team:`, `Team Name:`).
> 2. **Header/Title Line Stripping**: Header banners like `IBSI YEP 2026` or `IBSI Team Fest` will be safely recognized and excluded from attendee names.
> 3. **Backward Compatibility**: Preserve existing support for JSON badges (`{"fullName": "..."}`), base64-encoded payloads, and single/delimited line formats (`Name | BU | Team`).
> 4. **Multi-Surface Parity**: Ensure identical parser logic is updated in both the client apps (`public/app.html`, `src/utils/api.ts`), the generated Cloudflare Worker (`worker.js`), and the Google Apps Script (`webhook.gs`).

---

### 1. Overview & Core Concept

* **What It Does**: When camera or image scanner reads an IBSI Year End Party 2026 badge containing multi-line labeled text, the scanner intelligently identifies each line by key (`Full Name:`, `Business Unit:`, `Team:`), extracts the clean value, and maps each field directly to its corresponding Google Sheet column.
* **Target Audience**: Committee check-in station operators scanning physical attendee badges or mobile screens during event reception.
* **Key Value**: Guarantees clean, tabular reporting in the `EventDay` spreadsheet tab without manual copy-pasting or post-event data cleanup.

---

### 2. User Experience & Visual Design

* **Live Result Card**:
  * **Full Name**: Displays clean name in bold display typography (e.g. `REYNALDO AGUILAR JR`), without leading/trailing label markers or event headers.
  * **Business Unit Pill**: Displays the actual business unit (e.g. `IT Delivery - Cybersecurity`) instead of the hardcoded default `Technology & Digital`.
  * **Team Badge**: Displays the attendee's team color/group (e.g. `Peridot`) instead of the default `IBSI Team`.
  * **Status & Sync Banner**: Confirms successful row write to the `EventDay` Google Sheet tab with green check-in indicator.
* **History Modal & CSV Export**:
  * Attendee logs will reflect separate `Full Name`, `Business Unit`, and `Team Name` columns, allowing smooth CSV exporting and on-device filtering.

---

### 3. Key Product Decisions & Trade-Offs

* **Decision 1: Line-by-Line Regex Tokenization vs Strict Delimiter Split**
  * *Chosen Approach*: Iterate through trimmed lines and match prefix patterns (e.g., `/^(?:full\s*name|name|attendee|participant)\s*:\s*(.+)$/i`).
  * *Why*: Attendees' badges may have slight variation in capitalization or whitespace (e.g. `Full Name: `, `Business Unit : `, `Team:`). Regex prefix extraction is resilient to spacing and line ordering.
  * *Alternatives Considered*: Relying on comma or pipe splitting was the root cause of the previous failure, as newline-separated badge text was treated as one unstructured string.
* **Decision 2: Automatic Rebuild of Cloudflare `worker.js`**
  * *Chosen Approach*: Update `public/app.html` and immediately run `node scripts/build_worker.js` to ensure the generated `worker.js` and `public/worker.js` files are synchronized.
  * *Why*: If the standalone worker deployed on Cloudflare is used, it serves the bundled HTML directly. Both dev and production worker bundles must contain the fix.

---

### 4. Technical Architecture & Data Strategy

```
┌────────────────────────────────────────────────────────┐
│                   Camera / QR Scanner                  │
│       Decodes raw QR string (with line breaks)         │
└──────────────────────────┬─────────────────────────────┘
                           │
                           ▼
┌────────────────────────────────────────────────────────┐
│               Enhanced parseQrData()                   │
│  1. Check JSON / Base64 JSON                           │
│  2. Line-by-Line Key-Value Matching:                   │
│     - /full\s*name|name/i       --> fullName           │
│     - /business\s*unit|bu|dept/i --> bu                │
│     - /team(?:\s*name)?/i       --> teamName           │
│  3. Fallback Delimiters (, | ; /)                      │
│  4. Trimmed single-string fallback                     │
└──────────────────────────┬─────────────────────────────┘
                           │
                           ▼
┌────────────────────────────────────────────────────────┐
│                 Check-In State & Dispatch              │
│  - Sets outcome card state with parsed fields          │
│  - Dispatches POST payload to Google Apps Script       │
└──────────────────────────┬─────────────────────────────┘
                           │
                           ▼
┌────────────────────────────────────────────────────────┐
│            Google Apps Script Webhook & Sheet          │
│  - Column A: Timestamp                                 │
│  - Column B: Full Name (e.g. "REYNALDO AGUILAR JR")    │
│  - Column C: BU (e.g. "IT Delivery - Cybersecurity")   │
│  - Column D: Team Name (e.g. "Peridot")                │
│  - Column E: Status ("Check-in" in #4ade80 green)      │
└────────────────────────────────────────────────────────┘
```

#### Files Scheduled for Updates:
1. `public/app.html` — Update `parseQr` function to support multi-line key-value parsing and line-break delimiters. [COMPLETED]
2. `src/utils/api.ts` — Enhance `parseQrData` with the same multi-line key-value extractor for the React SPA. [COMPLETED]
3. `server.ts` — Enhanced `parseParticipantData` helper to cleanly split labeled text and proxy clean parameters. [COMPLETED]
4. `webhook.gs` — Add multi-line key-value parser fallback in `logCheckIn` in case raw data is posted directly to Apps Script. [COMPLETED]
5. `worker.js` & `public/worker.js` — Recompile via `scripts/build_worker.js`. [COMPLETED]

---

### Implementation Status: COMPLETED

All updates have been implemented, built, verified, and tested:
1. **Multi-line Regex & Delimiter Handling**: Strips event banners (e.g. `IBSI YEP 2026`) and parses labels like `Full Name:`, `Business Unit:`, `Team:`.
2. **Column Alignment**:
   - **Full Name** (`REYNALDO AGUILAR JR`) goes to Column B
   - **Business Unit** (`IT Delivery - Cybersecurity`) goes to Column C
   - **Team** (`Peridot`) goes to Column D
   - **Status** (`Check-in`) goes to Column E with green highlight (#4ade80)
3. **Multi-surface Parity**: Implemented across `public/app.html`, `src/utils/api.ts`, `server.ts`, `webhook.gs`, and recompiled into both `worker.js` and `public/worker.js`.
4. **Verification**: Successfully tested against live backend checkin endpoint and passed both `tsc --noEmit` and `vite build`.

