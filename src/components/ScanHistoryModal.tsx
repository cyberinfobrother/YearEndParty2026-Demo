import React, { useState } from 'react';
import { History, X, Download, Trash2, Search, Clock, Building, Users } from 'lucide-react';
import { ScanRecord } from '../types';
import { IBSI_SPREADSHEET_ID, IBSI_SHEET_TAB_NAME } from '../data/mockData';

interface ScanHistoryModalProps {
  isOpen: boolean;
  onClose: () => void;
  scans: ScanRecord[];
  onClearHistory: () => void;
}

export const ScanHistoryModal: React.FC<ScanHistoryModalProps> = ({
  isOpen,
  onClose,
  scans,
  onClearHistory,
}) => {
  const [searchTerm, setSearchTerm] = useState('');

  if (!isOpen) return null;

  // Filter out any mock/test entries from history display and CSV export
  const cleanScans = scans.filter((s) => {
    const name = (s.fullName || '').toLowerCase().trim();
    return (
      name.length > 0 &&
      !name.includes('test') &&
      !name.includes('juan dela cruz') &&
      !name.includes('john mark') &&
      !name.includes('maria santos') &&
      !name.includes('carlos mendoza') &&
      !name.includes('mock') &&
      !name.includes('sample')
    );
  });

  const filteredScans = cleanScans.filter(
    (s) =>
      s.fullName.toLowerCase().includes(searchTerm.toLowerCase()) ||
      s.bu.toLowerCase().includes(searchTerm.toLowerCase()) ||
      s.teamName.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const exportCSV = () => {
    if (cleanScans.length === 0) return;
    // EXACT COLUMNS SPECIFIED BY USER: Timestamp, Full Name, BU, Team Name, Status
    const headers = ['Timestamp', 'Full Name', 'BU', 'Team Name', 'Status'];

    const rows = cleanScans.map((s) => [
      `"${s.dateTime || new Date(s.timestamp).toLocaleString()}"`,
      `"${s.fullName.replace(/"/g, '""')}"`,
      `"${s.bu.replace(/"/g, '""')}"`,
      `"${s.teamName.replace(/"/g, '""')}"`,
      `"${s.status || 'Check-in'}"`,
    ]);

    const csvContent =
      'data:text/csv;charset=utf-8,' +
      [headers.join(','), ...rows.map((r) => r.join(','))].join('\n');

    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute(
      'download',
      `IBSI-Year-End-Party-2026-Checkins-${new Date().toISOString().slice(0, 10)}.csv`
    );
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-2 sm:p-4 bg-black/80 backdrop-blur-sm animate-fade-in"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="relative w-full max-w-2xl bg-[#0F172A] border border-[#1E293B] rounded-2xl shadow-2xl overflow-hidden text-white animate-scale-up max-h-[94vh] sm:max-h-[85vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-3.5 sm:px-6 py-3 sm:py-4 border-b border-[#1E293B] bg-[#0A101D]">
          <div className="flex items-center gap-2.5 sm:gap-3 min-w-0">
            <div className="w-8 h-8 sm:w-9 sm:h-9 rounded-xl bg-emerald-500/20 border border-emerald-500/40 flex items-center justify-center text-emerald-400 shrink-0">
              <History className="w-4 h-4 sm:w-5 sm:h-5" />
            </div>
            <div className="min-w-0">
              <h3 className="text-sm sm:text-base font-bold text-white truncate">IBSI Year End Party 2026 Check-in History</h3>
              <p className="text-[10px] sm:text-xs text-[#8E9BB5] truncate">
                Tab: <span className="text-emerald-400 font-semibold font-mono">{IBSI_SHEET_TAB_NAME}</span> ({cleanScans.length} attendees)
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

        {/* Action bar: Search + Export + Clear */}
        <div className="p-3 sm:p-4 border-b border-[#1E293B] bg-[#0D1527] flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-2.5">
          <div className="relative w-full sm:w-72">
            <Search className="w-4 h-4 absolute left-3 top-2.5 text-[#8E9BB5]" />
            <input
              type="text"
              placeholder="Search name, BU, or team..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-9 pr-3 py-2 sm:py-1.5 text-xs bg-[#070B14] text-white border border-[#1E293B] rounded-lg focus:outline-none focus:border-emerald-400"
            />
          </div>

          <div className="grid grid-cols-2 sm:flex items-center gap-2 w-full sm:w-auto">
            <button
              onClick={exportCSV}
              disabled={cleanScans.length === 0}
              className="w-full sm:w-auto px-3 py-2 sm:py-1.5 rounded-lg text-xs font-semibold text-white bg-[#1E293B] hover:bg-[#2A3B54] disabled:opacity-40 border border-[#2A3B54] flex items-center justify-center gap-1.5 transition-colors cursor-pointer"
            >
              <Download className="w-3.5 h-3.5 text-emerald-400" /> Export CSV
            </button>
            <button
              onClick={() => {
                if (confirm('Are you sure you want to clear the local check-in list for this session?')) {
                  onClearHistory();
                }
              }}
              disabled={cleanScans.length === 0}
              className="w-full sm:w-auto px-3 py-2 sm:py-1.5 rounded-lg text-xs font-semibold text-red-300 hover:text-white hover:bg-red-950/60 disabled:opacity-40 border border-red-900/40 flex items-center justify-center gap-1.5 transition-colors cursor-pointer"
            >
              <Trash2 className="w-3.5 h-3.5" /> Clear
            </button>
          </div>
        </div>

        {/* Records List */}
        <div className="p-3 sm:p-4 overflow-y-auto flex-1 space-y-2">
          {filteredScans.length === 0 ? (
            <div className="py-12 text-center text-[#8E9BB5] text-xs">
              {cleanScans.length === 0
                ? 'No participants checked in yet. Scan an attendee QR code to record check-in.'
                : 'No attendees matching your search.'}
            </div>
          ) : (
            filteredScans.map((s) => (
              <div
                key={s.id}
                className="p-3 rounded-xl bg-[#091122] border border-[#1A253D] flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs"
              >
                <div className="flex items-start sm:items-center gap-2.5 sm:gap-3 min-w-0">
                  <div
                    className={`w-7 h-7 sm:w-8 sm:h-8 rounded-lg flex items-center justify-center font-bold text-xs shrink-0 mt-0.5 sm:mt-0 ${
                      s.isDuplicate
                        ? 'bg-amber-500/20 text-amber-300 border border-amber-500/40'
                        : 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40'
                    }`}
                  >
                    {s.isDuplicate ? '⚠️' : '✓'}
                  </div>
                  <div className="min-w-0">
                    <div className="font-bold text-white flex items-center gap-1.5 sm:gap-2 text-xs sm:text-sm flex-wrap">
                      <span className="truncate">{s.fullName}</span>
                      <span className="text-[9px] sm:text-[10px] bg-[#22c55e] text-[#064e3b] font-bold px-1.5 sm:px-2 py-0.2 sm:py-0.5 rounded shadow-sm whitespace-nowrap">
                        {s.status || 'Check-in'}
                      </span>
                    </div>
                    <div className="text-[10px] sm:text-[11px] text-[#8E9BB5] flex items-center gap-2 sm:gap-3 mt-0.5 flex-wrap">
                      <span className="flex items-center gap-1">
                        <Building className="w-3 h-3 text-cyan-400 shrink-0" />
                        <span className="truncate max-w-[140px] sm:max-w-none">{s.bu}</span>
                      </span>
                      <span className="flex items-center gap-1">
                        <Users className="w-3 h-3 text-amber-400 shrink-0" />
                        <span>{s.teamName}</span>
                      </span>
                      {s.rowNumber && (
                        <span className="text-[9px] px-1.5 py-0.2 rounded bg-[#101D36] text-emerald-300 border border-emerald-500/30 font-mono whitespace-nowrap">
                          Row {s.rowNumber}
                        </span>
                      )}
                    </div>
                  </div>
                </div>

                <div className="flex items-center justify-between sm:flex-col sm:items-end pt-1.5 sm:pt-0 border-t border-[#141E33] sm:border-t-0">
                  <div className="text-[10px] text-[#8E9BB5] flex items-center gap-1 font-mono">
                    <Clock className="w-3 h-3 text-[#64748B]" />
                    {s.dateTime || new Date(s.timestamp).toLocaleTimeString()}
                  </div>
                  <div className="sm:mt-1">
                    {s.syncedToExternal ? (
                      <span className="text-[9px] text-emerald-400 font-semibold flex items-center gap-1">
                        <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
                        Synced
                      </span>
                    ) : (
                      <span className="text-[9px] text-amber-400 font-semibold flex items-center gap-1">
                        <span className="w-1.5 h-1.5 rounded-full bg-amber-400" />
                        Local Only
                      </span>
                    )}
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
};
