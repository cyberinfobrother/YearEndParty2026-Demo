import React from 'react';
import { Volume2, VolumeX, QrCode, History, Database, ExternalLink, Calendar, MapPin, Sparkles, PartyPopper } from 'lucide-react';
import { triggerHaptic } from '../utils/audio';
import { IBSI_SPREADSHEET_ID, IBSI_SHEET_TAB_NAME } from '../data/mockData';

interface StationHeaderProps {
  soundEnabled: boolean;
  onToggleSound: () => void;
  onOpenHistory: () => void;
  onOpenBackend: () => void;
  hasExternalBackend: boolean;
  databaseType?: string;
  databaseUrl?: string;
  pendingSyncCount?: number;
  scanCount: number;
}

export const StationHeader: React.FC<StationHeaderProps> = ({
  soundEnabled,
  onToggleSound,
  onOpenHistory,
  onOpenBackend,
  hasExternalBackend,
  databaseType,
  databaseUrl,
  pendingSyncCount,
  scanCount,
}) => {
  const getDbLabel = () => {
    if (!hasExternalBackend) return 'Local Store';
    if (databaseUrl?.includes('workers.dev')) return 'Proxy Online';
    if (databaseType === 'google_sheets') return 'Sheets Live';
    return 'Sheets Live';
  };

  const sheetsUrl = `https://docs.google.com/spreadsheets/d/${IBSI_SPREADSHEET_ID}/edit#gid=0`;

  return (
    <div className="w-full mb-4 text-center">
      {/* Top Utility Nav - Optimized for mobile touch */}
      <div className="flex items-center justify-between gap-2 mb-3 pb-2.5 border-b border-white/15">
        {/* Brand identity pill */}
        <div className="flex items-center gap-2.5 text-left">
          <div className="w-9 h-9 rounded-xl overflow-hidden border border-pink-400/50 shadow-md shadow-pink-900/40 shrink-0 bg-black/60 p-0.5 flex items-center justify-center">
            <img src="/logo.png" alt="IBSI Brand Logo" className="w-full h-full object-cover rounded-lg" referrerPolicy="no-referrer" />
          </div>
          <div>
            <div className="text-[11px] sm:text-xs font-black text-white tracking-wider flex items-center gap-1.5 leading-none">
              <span>IBSI YEAR END PARTY</span>
              <span className="text-[9px] font-extrabold text-amber-300 bg-amber-500/20 px-1.5 py-0.2 rounded border border-amber-400/40">
                2026
              </span>
            </div>
            <div className="text-[9px] text-amber-300/90 font-medium tracking-wide mt-0.5">
              Celebrate • Connect • Inspire
            </div>
          </div>
        </div>

        {/* Action icons */}
        <div className="flex items-center gap-1 sm:gap-1.5">
          {/* Live Google Sheets Launcher */}
          <button
            onClick={() => {
              triggerHaptic('tap');
              onOpenBackend();
            }}
            className={`px-2 py-1.5 min-h-[36px] rounded-xl border text-[11px] font-semibold flex items-center gap-1.5 transition-all cursor-pointer backdrop-blur-md active:scale-95 ${
              hasExternalBackend
                ? 'bg-emerald-950/70 text-emerald-300 border-emerald-500/50 hover:bg-emerald-900/70 shadow-[0_0_12px_rgba(16,185,129,0.25)]'
                : 'bg-white/5 text-[#9BB0D3] hover:text-white border-white/15 hover:bg-white/10'
            }`}
            title="Configure Google Sheets connection and instant sync"
          >
            <Database className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
            <span className="hidden xs:inline">{getDbLabel()}</span>
            <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse shrink-0" />
            {pendingSyncCount !== undefined && pendingSyncCount > 0 && (
              <span className="bg-amber-500 text-black text-[9px] font-bold px-1 rounded-full">
                {pendingSyncCount}
              </span>
            )}
          </button>

          {/* Sound Toggle */}
          <button
            onClick={() => {
              triggerHaptic('tap');
              onToggleSound();
            }}
            className={`p-2 min-h-[36px] min-w-[36px] rounded-xl border text-xs font-semibold flex items-center justify-center gap-1 transition-all backdrop-blur-md active:scale-95 ${
              soundEnabled
                ? 'bg-white/10 text-emerald-400 border-white/25 hover:bg-white/15 shadow-sm'
                : 'bg-white/5 text-[#9BB0D3] border-white/15 hover:bg-white/10'
            }`}
            title={soundEnabled ? 'Sound is Enabled' : 'Sound is Muted'}
          >
            {soundEnabled ? <Volume2 className="w-3.5 h-3.5" /> : <VolumeX className="w-3.5 h-3.5" />}
          </button>

          {/* History Modal Launcher */}
          <button
            onClick={() => {
              triggerHaptic('tap');
              onOpenHistory();
            }}
            className="px-2.5 py-1.5 min-h-[36px] rounded-xl backdrop-blur-md bg-white/5 hover:bg-white/10 border border-white/15 text-[11px] font-semibold text-[#9BB0D3] hover:text-white flex items-center gap-1.5 transition-all cursor-pointer active:scale-95"
            title="View scanned attendee history"
          >
            <History className="w-3.5 h-3.5 text-amber-400" />
            <span className="hidden xs:inline">Scans</span>
            {scanCount > 0 && (
              <span className="bg-emerald-400 text-black text-[10px] px-1.5 py-0.2 rounded-full font-bold shadow-sm">
                {scanCount}
              </span>
            )}
          </button>
        </div>
      </div>

      {/* Main Title Badge - Styled matching the festive elegance of Year End Party 2026 */}
      <div className="relative my-2 inline-flex flex-col items-center">
        <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-gradient-to-r from-amber-500/20 via-rose-500/20 to-purple-500/20 border border-amber-400/30 text-[10px] sm:text-xs font-bold text-amber-200 uppercase tracking-widest backdrop-blur-md mb-1.5 shadow-sm">
          <PartyPopper className="w-3.5 h-3.5 text-amber-400" />
          <span>Annual Gala & Celebration</span>
          <span className="text-amber-400 font-black">•</span>
          <span className="text-amber-300">IBSI Year End 2026</span>
        </div>

        <h1 className="text-2xl sm:text-3xl font-black text-white tracking-tight leading-none drop-shadow-[0_2px_12px_rgba(0,0,0,0.8)]">
          <span className="text-transparent bg-clip-text bg-gradient-to-r from-white via-amber-100 to-white">IBSI </span>
          <span className="text-transparent bg-clip-text bg-gradient-to-r from-amber-300 via-rose-300 to-amber-400 font-extrabold italic">YEAR END PARTY </span>
          <span className="text-amber-300">2026</span>
        </h1>

        <div className="text-[11px] text-amber-200/90 font-semibold mt-1 tracking-wide uppercase flex items-center justify-center gap-1.5">
          <span>Committee Scanner</span>
          <span className="text-white/40">•</span>
          <span className="text-emerald-400 font-mono">Tab: {IBSI_SHEET_TAB_NAME}</span>
        </div>
      </div>

      {/* Event Details Ribbon & Sheet Link */}
      <div className="mt-2.5 flex flex-wrap items-center justify-center gap-2 text-[10px] sm:text-[11px]">
        {/* Date and Location pill */}
        <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-xl backdrop-blur-xl bg-black/45 border border-white/15 text-white/90 shadow-sm">
          <Calendar className="w-3 h-3 text-amber-400 shrink-0" />
          <span className="font-semibold text-white">Nov 27, 2026</span>
          <span className="text-white/30">•</span>
          <MapPin className="w-3 h-3 text-rose-400 shrink-0" />
          <span className="text-amber-200 font-medium max-w-[270px] xs:max-w-none">
            THE BLUE LEAF McKinley, Taguig City
          </span>
        </div>

        {/* Google Sheet Direct Link */}
        <a
          href={sheetsUrl}
          target="_blank"
          rel="noreferrer"
          className="inline-flex items-center gap-1 px-2.5 py-1 rounded-xl backdrop-blur-xl bg-emerald-950/60 hover:bg-emerald-900/70 border border-emerald-500/40 text-emerald-300 hover:text-white transition-all font-mono shadow-sm"
          title="Open connected Google Sheet"
        >
          <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
          <span>Sheet [1anInd4l...nwrs]</span>
          <ExternalLink className="w-3 h-3 text-emerald-400" />
        </a>
      </div>
    </div>
  );
};
