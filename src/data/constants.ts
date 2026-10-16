import { Participant } from '../types';

export const IBSI_SPREADSHEET_ID = '1anInd4lDcfN8xlVfKrVlvxxbC2z_72qA-L3yxi8nwrs';
export const IBSI_SHEET_TAB_NAME = 'EventDay';

const PARTICIPANTS_STORAGE_KEY = 'ibsi_yep2026_participants_prod';

export function getStoredParticipants(): Participant[] {
  try {
    const data = localStorage.getItem(PARTICIPANTS_STORAGE_KEY);
    if (data) {
      return JSON.parse(data);
    }
  } catch (e) {
    console.error('Failed reading participants from storage', e);
  }
  return [];
}

export function saveStoredParticipants(participants: Participant[]) {
  try {
    localStorage.setItem(PARTICIPANTS_STORAGE_KEY, JSON.stringify(participants));
  } catch (e) {
    console.error('Failed saving participants to storage', e);
  }
}
