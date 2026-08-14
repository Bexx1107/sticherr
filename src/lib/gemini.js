import { logCall } from './usageTracker.js';

const GEMINI_API_BASE = 'https://generativelanguage.googleapis.com/v1beta';

/**
 * Execute image editing / generation via Google Gemini / Imagen API
 */
export async function geminiEdit(apiKey, modelId, params) {
  const start = performance.now();
  const { sourceImage, cropBase64, cropMimeType, prompt = '', onStatus = null, aspectRatio = '1:1', resolution = '1K', entityRefs = [], advancedConfig = {} } = params;

  if (!apiKey) {
    throw new Error('Gemini API key is missing. Please enter your Google Gemini API key in the sidebar.');
  }

  if (onStatus) onStatus('queued', {});

  const imgBase64 = cropBase64 || sourceImage?.base64;
  const imgMimeType = cropMimeType || sourceImage?.mimeType || 'image/png';

  if (!imgBase64) {
    throw new Error('No image data provided for stitching edit');
  }

  const masterPrefix = "You are performing a seamless in-place edit on a cropped area of an image. You MUST preserve the exact color scheme, style, lighting, textures, camera perspective, background, and overall composition of the original scene. Keep the layout identical and only make the specific change requested. Blend the modification seamlessly with the surrounding image. Edit Request: ";
  const finalPrompt = prompt ? `${masterPrefix}${prompt}` : "Edit the selected area of this image, matching its style and composition perfectly.";

  let refBase64 = null;
  let refMimeType = 'image/png';
  if (entityRefs && entityRefs.length > 0 && entityRefs[0]?.base64) {
    refBase64 = entityRefs[0].base64;
    refMimeType = entityRefs[0].mimeType || 'image/png';
  }

  if (onStatus) onStatus('generating', {});

  // Try Imagen 3 Predict endpoint first
  try {
    const result = await callImagenPredict(apiKey, finalPrompt, aspectRatio, imgBase64);
    logCall({ functionName: 'geminiEdit', modelId: 'imagen-3.0-generate-002', durationMs: performance.now() - start, success: true }).catch(() => {});
    return {
      image: result,
      text: '',
      apiPayload: { provider: 'gemini', model: 'imagen-3.0-generate-002', prompt: finalPrompt }
    };
  } catch (imagenErr) {
    console.warn('[Gemini] Imagen 3 predict endpoint failed, trying Gemini Flash multimodal fallback...', imagenErr.message);
    
    try {
      const result = await callGeminiMultimodal(apiKey, finalPrompt, imgBase64, imgMimeType, refBase64, refMimeType);
      logCall({ functionName: 'geminiEdit', modelId: 'gemini-2.0-flash', durationMs: performance.now() - start, success: true }).catch(() => {});
      return {
        image: result,
        text: '',
        apiPayload: { provider: 'gemini', model: 'gemini-2.0-flash', prompt: finalPrompt }
      };
    } catch (flashErr) {
      console.error('[Gemini] Flash fallback failed:', flashErr);
      logCall({ functionName: 'geminiEdit', modelId: 'gemini', durationMs: performance.now() - start, success: false, error: imagenErr.message }).catch(() => {});
      throw new Error(`Gemini API Error: ${imagenErr.message || flashErr.message}`);
    }
  }
}

async function callImagenPredict(apiKey, prompt, aspectRatio, imgBase64) {
  const url = `${GEMINI_API_BASE}/models/imagen-3.0-generate-002:predict?key=${apiKey}`;

  let formattedRatio = '1:1';
  if (aspectRatio === '16:9' || aspectRatio === 'wide') formattedRatio = '16:9';
  else if (aspectRatio === '9:16' || aspectRatio === 'tall') formattedRatio = '9:16';
  else if (aspectRatio === '4:3') formattedRatio = '4:3';
  else if (aspectRatio === '3:4') formattedRatio = '3:4';

  const instancePayload = {
    prompt: prompt
  };
  if (imgBase64) {
    instancePayload.image = { bytesBase64Encoded: imgBase64 };
  }

  const body = {
    instances: [instancePayload],
    parameters: {
      sampleCount: 1,
      aspectRatio: formattedRatio,
      outputMimeType: 'image/png'
    }
  };

  const resp = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  });

  if (!resp.ok) {
    const errText = await resp.text().catch(() => '');
    let errMsg = `HTTP ${resp.status}`;
    try {
      const errJson = JSON.parse(errText);
      errMsg = errJson.error?.message || errJson.message || errMsg;
    } catch (e) {}
    throw new Error(errMsg);
  }

  const data = await resp.json();
  const prediction = data.predictions?.[0];
  if (!prediction) {
    throw new Error('No predictions returned from Imagen 3 API');
  }

  const base64 = prediction.bytesBase64Encoded || prediction.bytes;
  const mimeType = prediction.mimeType || 'image/png';

  if (!base64) {
    throw new Error('Imagen 3 API did not return image bytes');
  }

  return { base64, mimeType };
}

async function callGeminiMultimodal(apiKey, prompt, imgBase64, imgMimeType, refBase64, refMimeType) {
  const modelsToTry = ['gemini-2.0-flash', 'gemini-1.5-flash'];
  let lastErr = null;

  for (const model of modelsToTry) {
    try {
      const url = `${GEMINI_API_BASE}/models/${model}:generateContent?key=${apiKey}`;
      const parts = [
        {
          inline_data: {
            mime_type: imgMimeType || 'image/png',
            data: imgBase64
          }
        }
      ];

      if (refBase64) {
        parts.push({
          inline_data: {
            mime_type: refMimeType || 'image/png',
            data: refBase64
          }
        });
      }

      parts.push({ text: prompt });

      const body = {
        contents: [{ parts }],
        generationConfig: {
          responseModalities: ["TEXT", "IMAGE"]
        }
      };

      const resp = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
      });

      if (!resp.ok) {
        const errText = await resp.text().catch(() => '');
        throw new Error(`${model} API error (${resp.status}): ${errText}`);
      }

      const data = await resp.json();
      const candidateParts = data.candidates?.[0]?.content?.parts || [];

      for (const part of candidateParts) {
        const inlineData = part.inlineData || part.inline_data;
        if (inlineData && inlineData.data) {
          return {
            base64: inlineData.data,
            mimeType: inlineData.mimeType || inlineData.mime_type || 'image/png'
          };
        }
      }
    } catch (err) {
      lastErr = err;
    }
  }

  throw lastErr || new Error('No image output received from Gemini API');
}
