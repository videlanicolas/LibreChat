const { createGoogleBatchJob, checkGoogleBatchJobStatus } = require('@librechat/api');
const { logger } = require('@librechat/data-schemas');
const { EModelEndpoint, AuthKeys } = require('librechat-data-provider');
const { saveMessage, getUserKey } = require('~/models');

async function resolveCredentials(req) {
  const { GOOGLE_KEY } = process.env;
  const isUserProvided = GOOGLE_KEY === 'user_provided';
  if (isUserProvided) {
    const userKey = await getUserKey({ userId: req.user.id, name: EModelEndpoint.google });
    return userKey;
  }
  return { [AuthKeys.GOOGLE_API_KEY]: GOOGLE_KEY };
}

async function checkBatchStatusHandler(req, res) {
  try {
    const { batchId, messageId, conversationId } = req.body;
    if (!batchId || !messageId) {
      return res.status(400).json({ error: 'Missing batchId or messageId' });
    }

    const credentials = await resolveCredentials(req);
    const result = await checkGoogleBatchJobStatus({ credentials, batchId });

    if (result.done) {
      const userId = req.user.id;
      const reqCtx = {
        userId,
        isTemporary: req.body.isTemporary,
        interfaceConfig: req.config?.interfaceConfig,
      };

      if (result.status === 'completed' && result.text) {
        const savedMessage = await saveMessage(
          reqCtx,
          {
            messageId,
            conversationId,
            user: userId,
            text: result.text,
            batchStatus: 'completed',
            isBatch: true,
            unfinished: false,
            error: false,
          },
          { context: 'BatchController - check status completed' }
        );
        return res.json({
          status: 'completed',
          message: savedMessage,
          text: result.text,
        });
      } else {
        const errorMessage = result.error || 'Batch job failed or was cancelled.';
        const savedMessage = await saveMessage(
          reqCtx,
          {
            messageId,
            conversationId,
            user: userId,
            text: `Error: ${errorMessage}`,
            batchStatus: 'failed',
            isBatch: true,
            unfinished: false,
            error: true,
          },
          { context: 'BatchController - check status failed' }
        );
        return res.json({
          status: 'failed',
          error: errorMessage,
          message: savedMessage,
        });
      }
    }

    return res.json({
      status: result.status || 'pending',
    });
  } catch (err) {
    logger.error('[BatchController] Error checking batch status', err);
    return res.status(500).json({ error: err.message || 'Internal server error checking batch status' });
  }
}

module.exports = {
  checkBatchStatusHandler,
  resolveCredentials,
};
