export interface Participant {
  token: string;
  fullName: string;
  bu: string;        // Business Unit (BU)
  teamName: string;  // Team Name
  status: string;    // "Check-in"
  timestamp?: number;
  timestampStr?: string;
  id?: string;
}

export interface ScanRecord {
  id: string;
  timestamp: number;
  dateTime: string;
  fullName: string;
  bu: string;
  teamName: string;
  status: string; // "Check-in"
  isDuplicate: boolean;
  participantToken?: string;
  syncedToExternal?: boolean;
  syncError?: string | null;
  spreadsheetId?: string;
  sheetName?: string;
  rowNumber?: number;
}

export interface ScanOutcome {
  type: 'success' | 'duplicate' | 'failure';
  title: string;
  message: string;
  fullName?: string;
  bu?: string;
  teamName?: string;
  status?: string;
  timestampStr?: string;
  rawPayload?: string;
  syncedToExternal?: boolean;
  syncMessage?: string;
  rowNumber?: number;
  sheetName?: string;
  spreadsheetId?: string;
}

export type ModalState = 'idle' | 'requesting' | 'granted' | 'denied';

export type DatabaseType = 'google_sheets' | 'rest_api' | 'webhook' | 'supabase';

export interface DatabaseConfig {
  databaseType: DatabaseType;
  databaseUrl: string;
  spreadsheetId: string;
  sheetName: string;
  apiKey?: string;
  authHeader?: string;
  enabled: boolean;
  hasExternalBackend?: boolean;
  builtInBackendActive?: boolean;
  lastConnectedAt?: number;
  lastStatus?: string;
  pendingSyncCount?: number;
}

