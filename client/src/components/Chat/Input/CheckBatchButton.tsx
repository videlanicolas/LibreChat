import React, { forwardRef } from 'react';
import { RefreshCw } from 'lucide-react';
import { composerSubmitClasses, TooltipAnchor } from '@librechat/client';
import { useLocalize } from '~/hooks';

type CheckBatchButtonProps = {
  disabled: boolean;
  checking: boolean;
  onClick: () => void;
};

const CheckBatchButton = React.memo(
  forwardRef((props: CheckBatchButtonProps, ref: React.ForwardedRef<HTMLButtonElement>) => {
    const localize = useLocalize();
    return (
      <TooltipAnchor
        description={localize('com_ui_check_batch_status') || 'Check Batch Response'}
        render={
          <button
            ref={ref}
            aria-label={localize('com_ui_check_batch_status') || 'Check Batch Response'}
            id="check-batch-button"
            disabled={props.disabled || props.checking}
            onClick={props.onClick}
            className={composerSubmitClasses()}
            data-testid="check-batch-button"
            type="button"
          >
            <span className="" data-state="closed">
              <RefreshCw className={props.checking ? 'animate-spin h-5 w-5' : 'h-5 w-5'} />
            </span>
          </button>
        }
      />
    );
  }),
);

export default CheckBatchButton;
