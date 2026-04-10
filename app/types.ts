export interface Summary {
  inspections: number;
  permits: number;
  totalValuation: number;
  totalFees: number;
  geocoded: number;
  passRate: number;
}

export interface Contact {
  first_name: string;
  last_name: string;
  company: string;
  contact_type: string;
}

export type PermitContacts = Record<string, Contact[]>;

export interface Permit {
  permit_id: string;
  permit_number: string;
  permit_type: string;
  work_class: string;
  status: string;
  description: string;
  apply_date: string;
  issue_date: string;
  expire_date: string;
  finalize_date: string;
  complete_date: string;
  address: string;
  parcel_number: string;
  project_name: string;
  valuation: number;
  square_feet: number;
  latitude: number | null;
  longitude: number | null;
}

export interface TimelinePoint {
  month: string;
  count: number;
  total_valuation?: number;
}

export interface Builder {
  name: string;
  role: string;
  permit_count: number;
  total_valuation: number;
}

export interface StatusCount {
  status: string;
  count: number;
}

export interface FeeSummary {
  fee_name: string;
  count: number;
  total: number;
  average: number;
}

export interface PermitType {
  permit_type: string;
  count: number;
  avg_valuation: number;
  total_valuation: number;
  avg_days_to_issue: number;
}
