export type PermitSector =
  | "commercial"
  | "residential"
  | "multi_family"
  | "unknown";

export type PermitKind =
  | "construction"
  | "trade"
  | "site_civil"
  | "compliance"
  | "other"
  | "unknown";

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
  sector?: PermitSector;
  permit_kind?: PermitKind;
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
  sector?: PermitSector;
  permit_kind?: PermitKind;
}

// ── GIS layer types ──────────────────────────────────────────────

export interface GisLayerStyle {
  fillOpacity?: number;
  weight?: number;
  color?: string;
  dashArray?: string;
  colors?: Record<string, string>;
}

export interface GisLayerMeta {
  id: string;
  name: string;
  sourceUrl: string;
  displayField: string;
  geometryType: "polygon" | "polyline";
  featureCount: number;
  defaultVisible: boolean;
  style: GisLayerStyle;
  bounds: { south: number; west: number; north: number; east: number };
}

export interface GisManifest {
  fetchedAt: string;
  cityBounds: {
    latlng: { south: number; west: number; north: number; east: number };
    mercator3857: { xmin: number; ymin: number; xmax: number; ymax: number };
  };
  svgViewBox: string;
  layers: GisLayerMeta[];
}

export type GisGeoJson = GeoJSON.FeatureCollection;

// ── Demographic types ────────────────────────────────────────────

export type ProjectStatus = "open" | "closed";

export interface Project {
  normalized_address: string;
  is_historic: boolean;
  permit_count: number;
  permit_types: string[];
  total_valuation: number;
  first_issue_date: string | null;
  final_inspection_date: string | null;
  is_open: boolean;
  duration_days: number | null;
  district_name: string | null;
  latitude: number | null;
  longitude: number | null;
  permit_ids: string[];
  permit_suffixes: string[];
}

export type DemographicTopic =
  | "population"
  | "race_ethnicity"
  | "poverty"
  | "income"
  | "tenure"
  | "vacancy"
  | "structure"
  | "renter_cost_burden"
  | "owner_cost_burden";

export type DemographicGeography = "urban_area" | "historic_districts";

export type DemographicUnit = "count" | "percent" | "dollars" | "per_sq_mile";

export interface DemographicMetricPoint {
  topic: DemographicTopic;
  metric: string;
  category?: string;
  year: number;
  geography: DemographicGeography;
  value: number | null;
  unit: DemographicUnit;
  sourceSection: string;
  noteIds?: string[];
}

export interface NarrativeFinding {
  id: string;
  title: string;
  body: string;
  relatedMetrics: string[];
}

export interface DemographicSource {
  year: number;
  topic: string;
  censusSource: string;
  accessedThrough: string;
}

export interface DemographicAppendixContext {
  title: string;
  author: string;
  geographies: Record<string, string>;
  methodology: string[];
  limitations: string[];
  definitions: Record<string, string>;
  notes: Record<string, string>;
  sources: DemographicSource[];
  narrativeFindings: NarrativeFinding[];
}

export interface DemographicAppendixData {
  context: DemographicAppendixContext;
  metrics: DemographicMetricPoint[];
}
