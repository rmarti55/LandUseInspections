"use client";

import {
  CERTIFICATE_OF_COMPLIANCE_EXPLAINER,
  CERTIFICATE_OF_COMPLIANCE_EXPLAINER_SHORT,
} from "../lib/permitKind";

type Props = {
  id: string;
  cocOnly: boolean;
  onCocOnlyChange: (value: boolean) => void;
};

export default function CocFilterToggle({
  id,
  cocOnly,
  onCocOnlyChange,
}: Props) {
  return (
    <div className="flex flex-wrap items-center gap-2 text-sm">
      <label
        htmlFor={id}
        className="inline-flex items-center gap-2 cursor-pointer select-none"
      >
        <input
          id={id}
          type="checkbox"
          checked={cocOnly}
          onChange={(e) => onCocOnlyChange(e.target.checked)}
          className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
        />
        <span className="font-medium text-gray-800">
          New business activity (Certificate of Compliance)
        </span>
      </label>
      <span
        className="text-gray-500 max-w-xl"
        title={CERTIFICATE_OF_COMPLIANCE_EXPLAINER}
      >
        {CERTIFICATE_OF_COMPLIANCE_EXPLAINER_SHORT}
      </span>
    </div>
  );
}
