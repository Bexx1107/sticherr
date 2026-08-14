import { WORKFLOWS } from './workflows.js';
import { logCall } from './usageTracker.js';

const FLOYO_API_BASE = '/api/floyo';
const FLOYO_CDN_BASE = '/cdn/floyo';

async function submitRun(apiKey, workflowName, workflowPrompt) {
  const response = await fetch(`${FLOYO_API_BASE}/runs`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      name: workflowName,
      workflow: workflowPrompt,
    }),
  });

  if (!response.ok) {
    const errBody = await response.text().catch(() => '');
    console.error('[Floyo] Submit failed:', response.status, errBody);
    throw new Error(`Floyo API error (${response.status}): ${errBody || response.statusText}`);
  }

  return response.json();
}

async function pollRun(apiKey, runId, { maxWaitMs = 300000, onStatus = null } = {}) {
  const startTime = Date.now();
  let delay = 2000;
  const maxDelay = 10000;

  while (true) {
    const elapsed = Date.now() - startTime;
    if (elapsed > maxWaitMs) {
      throw new Error(`Floyo run timed out after ${Math.round(maxWaitMs / 1000)}s. Run ID: ${runId}`);
    }

    const response = await fetch(`${FLOYO_API_BASE}/runs/${runId}`, {
      headers: { 'Authorization': `Bearer ${apiKey}` },
    });

    if (!response.ok) {
      if (response.status === 409) {
        const body = await response.json().catch(() => ({}));
        throw new Error(`Floyo run failed (409): ${body.error || body.message || 'Run cancelled or failed'}`);
      }
      throw new Error(`Floyo status check failed (${response.status})`);
    }

    const data = await response.json();
    const status = (data.status || '').toLowerCase();
    console.log(`[Floyo] Poll ${runId}: status=${status}`, data);

    if (onStatus) onStatus(status, data);

    if (status === 'completed' || status === 'ready' || status === 'success' || status === 'done') {
      return data;
    }

    if (status === 'failed' || status === 'error' || status === 'cancelled') {
      throw new Error(`Floyo run ${status}: ${data.error || data.message || 'Unknown error'}. Run ID: ${runId}`);
    }

    await new Promise(r => setTimeout(r, delay));
    delay = Math.min(delay * 1.5, maxDelay);
  }
}

async function downloadImageAsBase64(url, apiKey) {
  const headers = {};
  if (apiKey) headers['Authorization'] = `Bearer ${apiKey}`;

  let response = await fetch(url, { headers });

  if (!response.ok && url.endsWith('/content')) {
    const metaUrl = url.replace('/content', '');
    const metaResp = await fetch(metaUrl, { headers });
    if (metaResp.ok) {
      const meta = await metaResp.json();
      const downloadUrl = meta.url || meta.download_url || meta.signed_url || meta.link;
      if (downloadUrl) {
        response = await fetch(downloadUrl, { headers });
      } else {
        throw new Error(`Floyo file has no download URL. File ID: ${meta.id}`);
      }
    }
  }

  if (!response.ok) throw new Error(`Failed to download image: ${response.status}`);

  const contentType = response.headers.get('content-type') || '';
  if (contentType.includes('application/json')) {
    const data = await response.json();
    const redirectUrl = data.url || data.download_url || data.signed_url || data.link;
    if (redirectUrl) {
      response = await fetch(redirectUrl);
      if (!response.ok) throw new Error(`Failed to download image from redirect: ${response.status}`);
    } else {
      throw new Error(`Floyo returned JSON instead of image.`);
    }
  }

  const blob = await response.blob();
  const mimeType = blob.type || 'image/png';
  const base64 = await new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => resolve(reader.result.split(',')[1]);
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });

  return { base64, mimeType };
}

async function uploadImage(apiKey, base64, mimeType = 'image/png') {
  const ext = mimeType.split('/')[1] || 'png';
  const byteString = atob(base64);
  const ab = new ArrayBuffer(byteString.length);
  const ia = new Uint8Array(ab);
  for (let i = 0; i < byteString.length; i++) ia[i] = byteString.charCodeAt(i);
  const blob = new Blob([ab], { type: mimeType });

  const formData = new FormData();
  formData.append('file', blob, `upload.${ext}`);
  formData.append('on_conflict', 'rename');

  const response = await fetch(`${FLOYO_CDN_BASE}/upload`, {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${apiKey}` },
    body: formData,
  });

  if (!response.ok) {
    const errBody = await response.text().catch(() => '');
    throw new Error(`Floyo image upload failed (${response.status}): ${errBody}`);
  }

  const data = await response.json();
  return data.input_path || data.url || data.name || data.filename;
}

function extractOutputFiles(runData) {
  const outputs = runData.outputs;
  if (Array.isArray(outputs) && outputs.length > 0 && outputs[0].id) {
    return [...outputs].sort((a, b) => {
      const aIsSave = a.file_name?.startsWith('FloUI') || a.input_path?.includes('outputs/') ? 0 : 1;
      const bIsSave = b.file_name?.startsWith('FloUI') || b.input_path?.includes('outputs/') ? 0 : 1;
      return aIsSave - bIsSave;
    });
  }
  return [];
}

async function trackFloyoCall(functionName, workflowName, executeFn) {
  const start = performance.now();
  try {
    const result = await executeFn();
    const durationMs = performance.now() - start;
    logCall({ functionName, modelId: workflowName, durationMs, success: true }).catch(() => {});
    return result;
  } catch (err) {
    const durationMs = performance.now() - start;
    logCall({ functionName, modelId: workflowName, durationMs, success: false, error: err?.message || String(err) }).catch(() => {});
    throw err;
  }
}

async function executeWorkflow(apiKey, workflowName, workflowPrompt, { onStatus, maxWaitMs } = {}) {
  const submitResult = await submitRun(apiKey, workflowName, workflowPrompt);
  const runId = submitResult.run_id || submitResult.id || submitResult.runId;

  if (!runId) throw new Error('Floyo API did not return a run ID');
  if (onStatus) onStatus('queued', { runId });

  const completedRun = await pollRun(apiKey, runId, { maxWaitMs, onStatus });
  if (onStatus) onStatus('downloading', {});

  const files = extractOutputFiles(completedRun);
  if (files.length === 0) throw new Error('Floyo run completed but no output files were found.');

  const file = files[0];
  const cdnUrl = `${FLOYO_CDN_BASE}/${file.id}/download`;

  let image = null;
  try {
    image = await downloadImageAsBase64(cdnUrl, apiKey);
  } catch (cdnErr) {
    console.warn('[Floyo] CDN download failed, trying presigned fallback...', cdnErr.message);
    try {
      const metaResp = await fetch(
        `${FLOYO_API_BASE}/files/${file.id}?expand=presigned_url&presigned_url_expires_in=300`,
        { headers: { 'Authorization': `Bearer ${apiKey}` } }
      );
      if (metaResp.ok) {
        const meta = await metaResp.json();
        if (meta.presigned_url) {
          image = await downloadImageAsBase64(meta.presigned_url);
        }
      }
    } catch (presignErr) {
      console.warn('[Floyo] Presigned URL fallback failed:', presignErr.message);
    }
  }

  if (!image) {
    throw new Error(`Floyo: Could not download output image. File ID: ${file.id}`);
  }

  return {
    image,
    text: '',
    apiPayload: { name: workflowName, workflow: workflowPrompt, runId },
  };
}

export async function stitcherEdit(apiKey, modelId, params, provider = 'floyo') {
  if (provider === 'gemini' || (apiKey && apiKey.startsWith('AIza'))) {
    return geminiEdit(apiKey, modelId, params);
  }
  const { sourceImage, cropBase64, cropMimeType, prompt = '', onStatus = null, aspectRatio = 'auto', resolution = '1K', entityRefs = [], advancedConfig = {} } = params;
  const wf = WORKFLOWS.stitcherEdit;

  const imgBase64 = cropBase64 || sourceImage?.base64;
  const imgMimeType = cropMimeType || sourceImage?.mimeType || 'image/png';

  if (!imgBase64) {
    throw new Error('No image data provided for stitching edit');
  }

  // Upload the cropped base selection image (mapped to image1)
  const imageUrl = await uploadImage(apiKey, imgBase64, imgMimeType);

  // Upload the first reference image if one is provided (mapped to image2)
  let image2Url = null;
  if (entityRefs && entityRefs.length > 0) {
    const ref = entityRefs[0];
    if (ref && ref.base64) {
      try {
        image2Url = await uploadImage(apiKey, ref.base64, ref.mimeType || 'image/png');
      } catch (err) {
        console.warn('[Floyo] Failed to upload reference image:', err);
      }
    }
  }

  const masterPrefix = "You are performing a seamless in-place edit on a cropped area of an image. You MUST preserve the exact color scheme, style, lighting, textures, camera perspective, background, and overall composition of the original scene. Keep the layout identical and only make the specific change requested. Blend the modification seamlessly with the surrounding image. Edit Request: ";
  const finalPrompt = prompt ? `${masterPrefix}${prompt}` : "Edit the selected area of this image, matching its style and composition perfectly.";

  const workflowPrompt = wf.build({
    prompt: finalPrompt,
    aspectRatio: aspectRatio || 'auto',
    resolution: resolution || '1K',
    imageUrl,
    image2Url,
    modelId,
    seed: advancedConfig.seed !== undefined ? advancedConfig.seed : -1,
    safetyTolerance: advancedConfig.safetyTolerance !== undefined ? String(advancedConfig.safetyTolerance) : '4',
    enableWebSearch: !!advancedConfig.enableWebSearch,
  });

  return trackFloyoCall('stitcherEdit', wf.name, () =>
    executeWorkflow(apiKey, wf.name, workflowPrompt, { onStatus })
  );
}

export async function listAvailableModels() {
  return [
    { id: 'standard', name: 'Stitcher Edit NB2', description: 'Area-specific editing with Nano Banana 2' }
  ];
}
