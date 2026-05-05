import type { Permit } from "../types";

export const CERTIFICATE_OF_COMPLIANCE_TYPE = "Certificate of Compliance";

/** Full tooltip / assistive text for Certificate of Compliance. */
export const CERTIFICATE_OF_COMPLIANCE_EXPLAINER =
  "A Certificate of Compliance is the city’s zoning and land-use sign-off that a business or event is allowed at this address; it is not a building permit.";

/** Shorter line next to the filter toggle (full detail in title tooltip). */
export const CERTIFICATE_OF_COMPLIANCE_EXPLAINER_SHORT =
  "City zoning sign-off for a business or event at this address — not a building permit.";

export function isCertificateOfCompliance(p: Permit): boolean {
  return (
    p.permit_type === CERTIFICATE_OF_COMPLIANCE_TYPE ||
    p.work_class === CERTIFICATE_OF_COMPLIANCE_TYPE
  );
}
