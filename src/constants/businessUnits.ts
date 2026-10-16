export const BUSINESS_UNITS = [
  'BPO – FAS',
  'BPO – HRS',
  'Corporate Services - Finance and Admin',
  'Corporate Services - Process Excellence',
  'Corporate Services - Human Resources',
  'Digital Platforms - Advanced Applications',
  'Digital Platforms - Core and Emerging Applications',
  'Growth - Commercials and Contracts Management',
  'IT Delivery- Governance',
  'IT Delivery – Cybersecurity',
  'IT Delivery – Operations',
  'IT Delivery – PMO',
  'IT Delivery - Solutions and Architecture',
  'Office of the President',
] as const;

export type BusinessUnit = (typeof BUSINESS_UNITS)[number];

export const DEFAULT_BUSINESS_UNIT: BusinessUnit = 'BPO – FAS';
