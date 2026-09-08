import React from 'react';
import { ActionMenu } from './ActionMenu';
import ReportButton from '../features/moderation/components/ReportButton';

// ReportButton owns eligibility, capability checks and the reporting sheet.
// Its sheet stays outside ActionMenu so iOS can dismiss one before opening another.
export default function ContentActionMenu({ target, ownerId, subjectLabel = 'ההמלצה', ...menuProps }) {
  return (
    <ReportButton
      target={target}
      ownerId={ownerId}
      subjectLabel={subjectLabel}
      renderTrigger={({ onReport }) => (
        <ActionMenu
          title={`אפשרויות ${subjectLabel}`}
          {...menuProps}
          onReport={onReport}
          reportLabel={`דיווח על ${subjectLabel}`}
        />
      )}
    />
  );
}
