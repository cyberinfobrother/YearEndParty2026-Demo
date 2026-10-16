import React from 'react';
import { CheckCircle2, AlertTriangle, XCircle, ArrowRight, RotateCcw, ExternalLink, Calendar, Building, Users } from 'lucide-react';
import { ScanOutcome } from '../types';
import { IBSI_SPREADSHEET_ID, IBSI_SHEET_TAB_NAME } from '../data/mockData';

interface ScanResultCardProps {
  outcome: ScanOutcome;
  onReset: () => void;
  onScanNext: () => void;
}

export const ScanResultCard: React.FC<ScanResultCardProps> = ({
  outcome,
  onReset,
  onScanNext,
}) => {
  const isSuccess = outcome.type === 'success';
  const isDuplicate = outcome.type === 'duplicate';
  const isFailure = outcome.type === 'failure';

  const containerBg = isSuccess
    ? 'backdrop-blur-2xl bg-[#062416]/90 border-2 border-emerald-400/60 shadow-[0_16px_48px_rgba(16,185,129,0.35)]'
    : isDuplicate
    ? 'backdrop-blur-2xl bg-[#261a07]/90 border-2 border-amber-400/60 shadow-[0_16px_48px_rgba(245,158,11,0.35)]'
    : 'backdrop-blur-2xl bg-[#2e0e18]/90 border-2 border-rose-400/60 shadow-[0_16px_48px_rgba(244,63,94,0.35)]';

  const accentColor = isSuccess
    ? 'text-emerald-300'
    : isDuplicate
    ? 'text-amber-300'
    : 'text-rose-300';

  const sheetsUrl = `https://docs.google.com/spreadsheets/d/${IBSI_SPREADSHEET_ID}/edit#gid=0`;

  return (
    <div
      id="result"
      className={`mt-4 p-5 rounded-2xl text-center text-white shadow-2xl transition-all animate-scale-up ${containerBg}`}
    >
      {/* Live Status indicator */}
      <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-black/50 backdrop-blur-md text-[11px] font-semibold text-emerald-300 border border-emerald-400/30 mb-2 shadow-sm">
        <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
        Camera Ready — Ready to scan next attendee
      </div>

      {/* Status Icon & Title */}
      <div className="flex items-center justify-center gap-2 mb-2">
        {isSuccess && <CheckCircle2 className="w-6 h-6 text-emerald-400" />}
        {isDuplicate && <AlertTriangle className="w-6 h-6 text-amber-400" />}
        {isFailure && <XCircle className="w-6 h-6 text-rose-400" />}
        <div className={`text-xl font-black tracking-wide uppercase ${accentColor}`}>
          {outcome.title}
        </div>
      </div>

      {/* Description Message */}
      <p className="text-sm text-white/95 my-2 leading-relaxed font-medium">
        {outcome.message}
      </p>

      {/* Main Check-In Details Card (Logged to Google Sheets) */}
      {!isFailure && outcome.fullName && (
        <div className="my-3.5 p-4 rounded-xl bg-black/50 backdrop-blur-md border border-white/15 max-w-md mx-auto text-left space-y-2.5 shadow-inner">
          <div className="text-[10px] uppercase tracking-wider text-emerald-400 font-extrabold pb-1.5 border-b border-white/10 flex items-center justify-between">
            <span>Event Day Data Logged</span>
            <span className="text-cyan-300 font-mono">Tab: {IBSI_SHEET_TAB_NAME}</span>
          </div>

          {/* Full Name */}
          <div>
            <div className="text-[10px] text-[#9BB0D3] font-semibold">Full Name</div>
            <div className="text-lg font-black text-white tracking-tight">
              {outcome.fullName}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-2 pt-1 border-t border-white/10">
            {/* BU (Business Unit) */}
            <div>
              <div className="text-[10px] text-[#9BB0D3] font-semibold flex items-center gap-1">
                <Building className="w-3 h-3 text-cyan-400" />
                <span>BU (Business Unit)</span>
              </div>
              <div className="text-xs font-bold text-white mt-0.5">
                {outcome.bu || 'Technology'}
              </div>
            </div>

            {/* Team Name */}
            <div>
              <div className="text-[10px] text-[#9BB0D3] font-semibold flex items-center gap-1">
                <Users className="w-3 h-3 text-amber-400" />
                <span>Team Name</span>
              </div>
              <div className="text-xs font-bold text-white mt-0.5">
                {outcome.teamName || 'IBSI Team'}
              </div>
            </div>
          </div>

          {/* Timestamp & Status with Green Highlight */}
          <div className="pt-2 border-t border-white/10 flex items-center justify-between gap-2">
            <div>
              <div className="text-[10px] text-[#9BB0D3] font-semibold flex items-center gap-1">
                <Calendar className="w-3 h-3 text-[#9BB0D3]" />
                <span>Timestamp</span>
              </div>
              <div className="text-[11px] font-mono text-white/90">
                {outcome.timestampStr || new Date().toLocaleString()}
              </div>
            </div>

            {/* STATUS WITH GREEN HIGHLIGHT */}
            <div className="text-right">
              <div className="text-[10px] text-[#9BB0D3] font-semibold mb-0.5">Status</div>
              <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-lg bg-[#22c55e] text-[#064e3b] font-black text-xs shadow-[0_0_12px_rgba(34,197,94,0.5)] border border-[#16a34a] animate-pulse">
                <CheckCircle2 className="w-3.5 h-3.5 text-[#064e3b]" />
                <span>Check-in</span>
              </div>
            </div>
          </div>

          {/* Google Sheets Sync Confirmation Banner */}
          <div className="pt-2 border-t border-white/10">
            {outcome.syncedToExternal ? (
              <div className="flex items-center justify-between text-[11px] text-emerald-300 bg-emerald-950/60 p-2 rounded-lg border border-emerald-500/40">
                <div className="flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                  <span>
                    Logged to Google Sheet <strong>[{IBSI_SHEET_TAB_NAME}]</strong>
                    {outcome.rowNumber ? ` (Row ${outcome.rowNumber})` : ''}
                  </span>
                </div>
                <a
                  href={sheetsUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="text-cyan-300 hover:text-white flex items-center gap-1 font-mono text-[10px] underline ml-2"
                >
                  View <ExternalLink className="w-3 h-3" />
                </a>
              </div>
            ) : (
              <div className="text-[11px] text-amber-300 bg-amber-950/60 p-2 rounded-lg border border-amber-500/40 flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-amber-400" />
                <span>Saved locally — pending Google Sheets sync</span>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Reset & Continue Actions */}
      <div className="mt-4 flex flex-col sm:flex-row items-center justify-center gap-2">
        <button
          id="scanAnotherBtn"
          onClick={onScanNext}
          className="w-full sm:w-auto flex-1 py-3 px-5 rounded-xl font-bold text-sm text-white bg-gradient-to-r from-emerald-500 via-teal-500 to-cyan-600 hover:from-emerald-400 hover:to-cyan-500 active:scale-[0.98] transition-all flex items-center justify-center gap-2 shadow-lg shadow-emerald-900/40 border border-emerald-300/30 cursor-pointer"
        >
          {isFailure ? 'Try Scanning Again' : 'Ready for Next Attendee'}
          <ArrowRight className="w-4 h-4" />
        </button>

        <button
          onClick={onReset}
          className="w-full sm:w-auto py-3 px-4 rounded-xl font-semibold text-xs text-white/90 hover:text-white backdrop-blur-md bg-black/40 hover:bg-black/60 border border-white/15 transition-all flex items-center justify-center gap-1.5 cursor-pointer"
          title="Dismiss Result"
        >
          <RotateCcw className="w-3.5 h-3.5" />
          Dismiss Card
        </button>
      </div>
    </div>
  );
};
