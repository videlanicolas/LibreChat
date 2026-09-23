import { GoogleGenAI } from '@google/genai';
import { logger } from '@librechat/data-schemas';
import { AuthKeys } from 'librechat-data-provider';
import type * as t from '~/types';

export interface CreateBatchJobParams {
  credentials: string | t.GoogleCredentials | undefined;
  model: string;
  prompt: string;
}

export interface BatchJobStatusResult {
  done: boolean;
  status: 'pending' | 'running' | 'completed' | 'failed';
  text?: string;
  error?: string;
}

function getGoogleGenAIClient(credentials: string | t.GoogleCredentials | undefined): GoogleGenAI {
  let creds: t.GoogleCredentials = {};
  if (typeof credentials === 'string') {
    try {
      creds = JSON.parse(credentials);
    } catch {
      creds = { [AuthKeys.GOOGLE_API_KEY]: credentials };
    }
  } else if (credentials && typeof credentials === 'object') {
    creds = credentials;
  }

  const apiKey = creds[AuthKeys.GOOGLE_API_KEY] || process.env.GOOGLE_KEY;
  if (!apiKey) {
    throw new Error('Google API key is required to use Batch API.');
  }

  return new GoogleGenAI({ apiKey });
}

export async function createGoogleBatchJob({
  credentials,
  model,
  prompt,
}: CreateBatchJobParams): Promise<{ batchId: string }> {
  const ai = getGoogleGenAIClient(credentials);
  const normalizedModel = model.replace(/^models\//, '');

  const inlineRequests = [
    {
      contents: [
        {
          parts: [{ text: prompt }],
          role: 'user',
        },
      ],
    },
  ];

  logger.debug('[GoogleBatch] Creating batch job', { model: normalizedModel });

  const response = await ai.batches.create({
    model: normalizedModel,
    src: inlineRequests,
    config: {
      displayName: `librechat-batch-${Date.now()}`,
    },
  });

  const batchId = response.name;
  if (!batchId) {
    throw new Error('Failed to create Gemini batch job: No batch ID returned');
  }

  logger.debug('[GoogleBatch] Created batch job successfully', { batchId });
  return { batchId };
}

export async function checkGoogleBatchJobStatus({
  credentials,
  batchId,
}: {
  credentials: string | t.GoogleCredentials | undefined;
  batchId: string;
}): Promise<BatchJobStatusResult> {
  const ai = getGoogleGenAIClient(credentials);

  logger.debug('[GoogleBatch] Checking batch job status', { batchId });
  const batchJob = await ai.batches.get({ name: batchId });

  const state = (batchJob.state || (batchJob as { metadata?: { state?: string } })?.metadata?.state || '').toString();
  logger.debug('[GoogleBatch] Batch job state', { batchId, state });

  const completedStates = new Set([
    'JOB_STATE_SUCCEEDED',
    'JOB_STATE_FAILED',
    'JOB_STATE_CANCELLED',
    'JOB_STATE_EXPIRED',
  ]);

  if (!completedStates.has(state)) {
    return {
      done: false,
      status: state === 'JOB_STATE_RUNNING' ? 'running' : 'pending',
    };
  }

  if (state === 'JOB_STATE_SUCCEEDED') {
    let generatedText = '';
    const dest = batchJob.dest;

    if (dest?.inlinedResponses && dest.inlinedResponses.length > 0) {
      const inlineResp = dest.inlinedResponses[0];
      if (inlineResp.response) {
        const candidate = inlineResp.response.candidates?.[0];
        if (candidate?.content?.parts) {
          generatedText = candidate.content.parts.map((p: { text?: string }) => p.text || '').join('');
        } else if (inlineResp.response.text) {
          generatedText = inlineResp.response.text;
        }
      } else if (inlineResp.error) {
        return {
          done: true,
          status: 'failed',
          error: typeof inlineResp.error === 'string' ? inlineResp.error : JSON.stringify(inlineResp.error),
        };
      }
    } else if (dest?.fileName) {
      const downloadPath = `/tmp/gemini-batch-${Date.now()}.jsonl`;
      await ai.files.download({ file: dest.fileName, downloadPath });
      const fs = await import('fs/promises');
      const fileContentStr = await fs.readFile(downloadPath, 'utf-8');
      await fs.unlink(downloadPath).catch(() => {});
      const lines = fileContentStr.split('\n').filter(Boolean);
      if (lines.length > 0) {
        const parsed = JSON.parse(lines[0]);
        if (parsed.response?.candidates?.[0]?.content?.parts) {
          generatedText = parsed.response.candidates[0].content.parts
            .map((p: { text?: string }) => p.text || '')
            .join('');
        } else if (parsed.error) {
          return {
            done: true,
            status: 'failed',
            error: typeof parsed.error === 'string' ? parsed.error : JSON.stringify(parsed.error),
          };
        }
      }
    }

    return {
      done: true,
      status: 'completed',
      text: generatedText,
    };
  }

  const errMessage = batchJob.error
    ? typeof batchJob.error === 'string'
      ? batchJob.error
      : (batchJob.error as { message?: string }).message || JSON.stringify(batchJob.error)
    : `Batch job ended with state ${state}`;

  return {
    done: true,
    status: 'failed',
    error: errMessage,
  };
}
