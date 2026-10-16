import React, { useState, useEffect, useCallback, useRef } from 'react';
import confetti from 'canvas-confetti';
import {
  IBSI_SPREADSHEET_ID,
  IBSI_SHEET_TAB_NAME,
  getStoredParticipants,
  saveStoredParticipants,
} from './data/mockData';
import { Participant, ScanRecord, ScanOutcome, ModalState } from './types';
import { soundFx, triggerHaptic } from './utils/audio';
import { StationHeader } from './components/StationHeader';
import { QRScannerView } from './components/QRScannerView';
import { ScanResultCard } from './components/ScanResultCard';
import { CameraModal } from './components/CameraModal';
import { ScanHistoryModal } from './components/ScanHistoryModal';
import { BackendConnectModal } from './components/BackendConnectModal';
import {
  recordCheckIn,
  getBackendConfig,
  saveBackendConfig,
  testBackendConnection,
  fetchServerScans,
  BackendConfig,
  DEFAULT_GOOGLE_SHEETS_URL,
} from './utils/api';
import { BUSINESS_UNITS, DEFAULT_BUSINESS_UNIT } from './constants/businessUnits';
import { QrCode, Sparkles, User, ExternalLink, Building, Users } from 'lucide-react';

export default function App() {
  // Backend Integration State (Targeting Sheet ID 1anInd4lDcfN8xlVfKrVlvxxbC2z_72qA-L3yxi8nwrs / EventDay tab)
  const [backendConfig, setBackendConfig] = useState<BackendConfig>({
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
  });

  const [isBackendModalOpen, setIsBackendModalOpen] = useState<boolean>(false);

  // Filter to ensure mock/test data is never retained
  const isMockRecord = (s: ScanRecord) => {
    const name = (s.fullName || '').toLowerCase().trim();
    return (
      !name ||
      name.includes('test') ||
      name.includes('juan dela cruz') ||
      name.includes('john mark') ||
      name.includes('maria santos') ||
      name.includes('carlos mendoza') ||
      name.includes('mock') ||
      name.includes('sample')
    );
  };

  const SCANS_STORAGE_KEY = 'ibsi_eventday_checkins_clean';

  // Participants & History
  const [participants, setParticipants] = useState<Participant[]>(() => {
    try {
      localStorage.removeItem('ibsi_teamfest_participants_prod');
    } catch (e) {}
    return [];
  });

  const [scans, setScans] = useState<ScanRecord[]>(() => {
    try {
      // Actively purge legacy keys that contained test check-ins
      localStorage.removeItem('ibsi_teamfest_scans_prod');
      localStorage.removeItem('ibsi_tf_scans_v2');
      const saved = localStorage.getItem(SCANS_STORAGE_KEY);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed)) {
          return parsed.filter((s: ScanRecord) => !isMockRecord(s));
        }
      }
    } catch (e) {}
    return [];
  });

  // Scanner state
  const [isScanning, setIsScanning] = useState<boolean>(false);
  const [outcome, setOutcome] = useState<ScanOutcome | null>(null);
  const isScanLockedRef = useRef<boolean>(false);

  // Manual Check-in Fields
  const [manualFullName, setManualFullName] = useState<string>('');
  const [manualBu, setManualBu] = useState<string>(DEFAULT_BUSINESS_UNIT);
  const [manualTeamName, setManualTeamName] = useState<string>('');
  const [showManualForm, setShowManualForm] = useState<boolean>(false);

  // Modals
  const [isCameraModalOpen, setIsCameraModalOpen] = useState<boolean>(false);
  const [cameraModalState, setCameraModalState] = useState<ModalState>('idle');
  const [cameraModalError, setCameraModalError] = useState<string>('');
  const [isHistoryModalOpen, setIsHistoryModalOpen] = useState<boolean>(false);
  const [soundEnabled, setSoundEnabled] = useState<boolean>(() => soundFx.isEnabled());

  // Load backend config and initial server scans on mount
  useEffect(() => {
    getBackendConfig().then((cfg) => {
      setBackendConfig(cfg);
    });
    fetchServerScans().then((serverScans) => {
      if (Array.isArray(serverScans)) {
        const clean = serverScans.filter((s) => !isMockRecord(s));
        setScans(clean);
        try {
          localStorage.setItem(SCANS_STORAGE_KEY, JSON.stringify(clean));
        } catch (e) {}
      }
    });
  }, []);

  // Save changes to localStorage
  useEffect(() => {
    saveStoredParticipants(participants);
  }, [participants]);

  useEffect(() => {
    try {
      const clean = scans.filter((s) => !isMockRecord(s));
      localStorage.setItem(SCANS_STORAGE_KEY, JSON.stringify(clean));
    } catch (e) {}
  }, [scans]);

  const handleToggleSound = () => {
    const next = soundFx.toggle();
    setSoundEnabled(next);
  };

  // Celebration confetti
  const fireConfetti = useCallback(() => {
    try {
      confetti({
        particleCount: 120,
        spread: 75,
        origin: { y: 0.6 },
        colors: ['#22c55e', '#10b981', '#06b6d4', '#3b82f6', '#f59e0b'],
      });
    } catch (e) {}
  }, []);

  const handleSaveBackendConfig = async (configOrUrl: any) => {
    const updated = await saveBackendConfig(configOrUrl);
    setBackendConfig(updated);
  };

  const handleTestBackend = async (params: any) => {
    return await testBackendConnection(params);
  };

  // Process Attendee QR Scan or Check-in (Strict: One at a time per user)
  const handleScan = useCallback(
    async (rawText: string) => {
      if (isScanLockedRef.current) return;
      isScanLockedRef.current = true;

      // Immediately pause scanning so badge cannot trigger duplicate entries
      setIsScanning(false);

      if (!rawText || !rawText.trim()) {
        soundFx.playFailure();
        triggerHaptic('failure');
        setOutcome({
          type: 'failure',
          title: '❌ Scan Rejected',
          message: 'The scanned QR code did not contain readable participant information.',
          rawPayload: rawText,
        });
        isScanLockedRef.current = false;
        return;
      }

      try {
        const res = await recordCheckIn(rawText);

        // Refresh database config for pending counter
        getBackendConfig().then((cfg) => setBackendConfig(cfg));

        const isDuplicate = res.duplicate;

        const syncMsg = res.externalBackend?.synced
          ? `Logged to Google Sheet tab [${res.externalBackend.sheetName || IBSI_SHEET_TAB_NAME}] (Row ${res.rowNumber || 'Auto'})`
          : res.externalBackend?.error
          ? `Sync pending: ${res.externalBackend.error}`
          : `Saved locally — pending Google Sheets sync [${IBSI_SHEET_TAB_NAME}]`;

        if (isDuplicate) {
          soundFx.playDuplicate();
          triggerHaptic('duplicate');
          setOutcome({
            type: 'duplicate',
            title: '⚠️ ALREADY CHECKED IN',
            message: `Attendee ${res.fullName} (${res.bu}) has already been recorded in the EventDay roster.`,
            fullName: res.fullName,
            bu: res.bu,
            teamName: res.teamName,
            status: 'Check-in',
            timestampStr: res.timestampStr,
            rowNumber: res.rowNumber,
            sheetName: IBSI_SHEET_TAB_NAME,
            spreadsheetId: IBSI_SPREADSHEET_ID,
            syncedToExternal: res.externalBackend ? res.externalBackend.synced : undefined,
            syncMessage: syncMsg,
          });
        } else {
          soundFx.playSuccess();
          triggerHaptic('success');
          fireConfetti();
          setOutcome({
            type: 'success',
            title: '✅ CHECK-IN SUCCESSFUL!',
            message: `Welcome to IBSI Year End Party 2026! Check-in confirmed with green status highlight on tab "${IBSI_SHEET_TAB_NAME}".`,
            fullName: res.fullName,
            bu: res.bu,
            teamName: res.teamName,
            status: 'Check-in',
            timestampStr: res.timestampStr,
            rowNumber: res.rowNumber,
            sheetName: IBSI_SHEET_TAB_NAME,
            spreadsheetId: IBSI_SPREADSHEET_ID,
            syncedToExternal: res.externalBackend ? res.externalBackend.synced : undefined,
            syncMessage: syncMsg,
          });
        }

        // Refresh scan history
        fetchServerScans().then((updatedScans) => {
          if (updatedScans && updatedScans.length > 0) {
            setScans(updatedScans);
          }
        });
      } catch (err: any) {
        soundFx.playFailure();
        triggerHaptic('failure');
        setOutcome({
          type: 'failure',
          title: 'Check-in Failed',
          message: err?.message || 'Server error communicating with Google Sheets.',
          rawPayload: rawText,
        });
      }
    },
    [fireConfetti]
  );

  // Manual Check-in Submission
  const handleManualCheckIn = (e: React.FormEvent) => {
    e.preventDefault();
    if (!manualFullName.trim()) return;

    const payload = JSON.stringify({
      fullName: manualFullName.trim(),
      bu: manualBu.trim() || 'Technology',
      teamName: manualTeamName.trim() || 'IBSI Team',
      status: 'Check-in',
    });

    handleScan(payload);
    setManualFullName('');
  };

  // Camera Permission Modal handlers
  const handleRequestCameraModal = () => {
    setCameraModalState('idle');
    setIsCameraModalOpen(true);
  };

  const handleGrantCameraPermission = async () => {
    setCameraModalState('requesting');
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: 'environment' } },
      });
      // Stop temporary track
      stream.getTracks().forEach((track) => track.stop());
      setCameraModalState('granted');
      setTimeout(() => {
        setIsCameraModalOpen(false);
        setIsScanning(true);
      }, 700);
    } catch (err: any) {
      setCameraModalState('denied');
      setCameraModalError(err?.message || 'Camera permission denied or camera device busy.');
    }
  };

  const handleUploadPhotoFromModal = () => {
    setIsCameraModalOpen(false);
    const input = document.getElementById('qrFileInput') as HTMLInputElement;
    if (input) input.click();
  };

  const handleClearHistory = async () => {
    setScans([]);
    setParticipants([]);
    try {
      localStorage.removeItem(SCANS_STORAGE_KEY);
      localStorage.removeItem('ibsi_teamfest_scans_prod');
      localStorage.removeItem('ibsi_teamfest_participants_prod');
      localStorage.removeItem('ibsi_pending_scans_prod');
      localStorage.removeItem('ibsi_tf_scans_v2');
      await fetch('/api/scans/clear', { method: 'POST' });
    } catch (e) {}
  };

  const sheetsUrl = `https://docs.google.com/spreadsheets/d/${IBSI_SPREADSHEET_ID}/edit#gid=0`;

  return (
    <div className="min-h-[100dvh] w-full text-white flex flex-col items-center justify-start p-3 sm:p-6 pb-8 safe-bottom safe-top selection:bg-emerald-400 selection:text-black font-sans">
      <div className="w-full max-w-xl mx-auto flex flex-col items-center">
        {/* Header Bar */}
        <StationHeader
          soundEnabled={soundEnabled}
          onToggleSound={handleToggleSound}
          onOpenHistory={() => setIsHistoryModalOpen(true)}
          onOpenBackend={() => setIsBackendModalOpen(true)}
          hasExternalBackend={backendConfig.hasExternalBackend}
          databaseType={backendConfig.databaseType}
          databaseUrl={backendConfig.databaseUrl}
          pendingSyncCount={backendConfig.pendingSyncCount}
          scanCount={scans.length}
        />

        {/* Scanner Viewport Container */}
        <div className="w-full mt-1">
          <QRScannerView
            isScanning={isScanning}
            setIsScanning={setIsScanning}
            onScanSuccess={handleScan}
            onRequestCameraModal={handleRequestCameraModal}
          />
        </div>

        {/* Scan Result Card */}
        {outcome && (
          <div className="w-full">
            <ScanResultCard
              outcome={outcome}
              onReset={() => {
                isScanLockedRef.current = false;
                setOutcome(null);
              }}
              onScanNext={() => {
                isScanLockedRef.current = false;
                setOutcome(null);
                setIsScanning(true);
              }}
            />
          </div>
        )}

        {/* Quick Manual Attendee Check-In Toggle & Form */}
        <div className="w-full mt-4 p-4 rounded-2xl glass-surface-subtle border border-white/10 text-left">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <User className="w-4 h-4 text-emerald-400" />
              <span className="text-xs font-bold text-white tracking-wide uppercase">
                Manual Attendee Check-In
              </span>
            </div>
            <button
              type="button"
              onClick={() => setShowManualForm(!showManualForm)}
              className="text-xs text-cyan-300 hover:text-white font-semibold transition-colors cursor-pointer"
            >
              {showManualForm ? 'Hide Form' : 'Manual Entry'}
            </button>
          </div>

          {showManualForm && (
            <form onSubmit={handleManualCheckIn} className="mt-3.5 space-y-3 animate-fade-in">
              <div>
                <label className="block text-[11px] font-semibold text-[#9BB0D3] mb-1">
                  Full Name <span className="text-rose-400">*</span>
                </label>
                <input
                  type="text"
                  required
                  placeholder="Enter attendee's full name"
                  value={manualFullName}
                  onChange={(e) => setManualFullName(e.target.value)}
                  className="w-full px-3 py-2 bg-black/50 text-white rounded-xl border border-white/15 focus:outline-none focus:border-emerald-400 text-xs"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                <div>
                  <label className="block text-[11px] font-semibold text-[#9BB0D3] mb-1 flex items-center gap-1">
                    <Building className="w-3 h-3 text-cyan-400" />
                    BU (Business Unit)
                  </label>
                  <select
                    value={manualBu}
                    onChange={(e) => setManualBu(e.target.value)}
                    className="w-full px-3 py-2 bg-black/60 text-white rounded-xl border border-white/15 focus:outline-none focus:border-cyan-400 text-xs appearance-none cursor-pointer"
                  >
                    {BUSINESS_UNITS.map((buOption) => (
                      <option key={buOption} value={buOption} className="bg-[#0f172a] text-white py-1">
                        {buOption}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-[11px] font-semibold text-[#9BB0D3] mb-1 flex items-center gap-1">
                    <Users className="w-3 h-3 text-amber-400" />
                    Team Name
                  </label>
                  <input
                    type="text"
                    placeholder="Enter assigned team"
                    value={manualTeamName}
                    onChange={(e) => setManualTeamName(e.target.value)}
                    className="w-full px-3 py-2 bg-black/50 text-white rounded-xl border border-white/15 focus:outline-none focus:border-amber-400 text-xs"
                  />
                </div>
              </div>

              <button
                type="submit"
                disabled={!manualFullName.trim()}
                className="w-full py-2.5 px-4 rounded-xl font-bold text-xs bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white flex items-center justify-center gap-1.5 transition-all shadow-md cursor-pointer"
              >
                <span>Record Check-in to Google Sheet</span>
                <span className="bg-[#22c55e] text-[#064e3b] font-extrabold px-1.5 py-0.2 rounded text-[10px]">
                  Green Highlight
                </span>
              </button>
            </form>
          )}
        </div>

        {/* Live Event Day Status Footer Banner */}
        <div className="w-full mt-4 p-3 rounded-xl bg-black/40 backdrop-blur-md border border-white/10 text-xs text-center flex flex-col sm:flex-row items-center justify-between gap-2">
          <div className="flex items-center gap-2 text-[#9BB0D3]">
            <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse shrink-0" />
            <span>
              Connected to Sheet: <strong>{IBSI_SHEET_TAB_NAME}</strong> tab
            </span>
          </div>

          <div className="flex items-center gap-3">
            <span className="text-emerald-400 font-bold font-mono">
              {scans.length} Check-ins Recorded
            </span>
            <a
              href={sheetsUrl}
              target="_blank"
              rel="noreferrer"
              className="text-cyan-300 hover:text-white inline-flex items-center gap-1 font-mono text-[11px]"
            >
              Open Sheet <ExternalLink className="w-3 h-3" />
            </a>
          </div>
        </div>
      </div>

      {/* Modals */}
      <BackendConnectModal
        isOpen={isBackendModalOpen}
        onClose={() => setIsBackendModalOpen(false)}
        config={backendConfig}
        onSaveConfig={handleSaveBackendConfig}
        onTestConnection={handleTestBackend}
      />

      <ScanHistoryModal
        isOpen={isHistoryModalOpen}
        onClose={() => setIsHistoryModalOpen(false)}
        scans={scans}
        onClearHistory={handleClearHistory}
      />

      <CameraModal
        isOpen={isCameraModalOpen}
        state={cameraModalState}
        stationName="Committee"
        errorMessage={cameraModalError}
        onClose={() => setIsCameraModalOpen(false)}
        onGrant={handleGrantCameraPermission}
        onUploadClick={handleUploadPhotoFromModal}
      />
    </div>
  );
}
