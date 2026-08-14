import { logCall } from './usageTracker.js';

const GEMINI_API_BASE = 'https://generativelanguage.googleapis.com/v1beta';

/**
 * Execute image editing / generation via Google Gemini / Nano Banana API
 * (Uses :generateContent endpoint with responseModalities: ["TEXT", "IMAGE"])
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

  // List of Nano Banana / Gemini models to attempt via :generateContent
  const modelsToTry = Array.from(new Set([
    modelId,
    'gemini-3.1-flash-image-preview',
    'gemini-3.1-flash-image',
    'gemini-2.5-flash-image',
    'gemini-3-pro-image-preview',
    'gemini-2.0-flash',
    'gemini-1.5-flash'
  ])).filter(Boolean);

  let lastError = null;

  for (const model of modelsToTry) {
    try {
      console.log(`[Gemini] Attempting generation with model: ${model}`);
      const result = await callGeminiGenerateContent(apiKey, model, finalPrompt, imgBase64, imgMimeType, refBase64, refMimeType);
      
      logCall({ functionName: 'geminiEdit', modelId: model, durationMs: performance.now() - start, success: true }).catch(() => {});
      
      return {
        image: result,
        text: '',
        apiPayload: { provider: 'gemini', model, prompt: finalPrompt }
      };
    } catch (err) {
      console.warn(`[Gemini] Model ${model} failed:`, err.message);
      lastError = err;
    }
  }

  logCall({ functionName: 'geminiEdit', modelId: modelId || 'gemini', durationMs: performance.now() - start, success: false, error: lastError?.message }).catch(() => {});
  throw new Error(`Gemini API Error: ${lastError?.message || 'Failed to generate image with Gemini API'}`);
}

async function callGeminiGenerateContent(apiKey, model, prompt, imgBase64, imgMimeType, refBase64, refMimeType) {
  const url = `${GEMINI_API_BASE}/models/${model}:generateContent?key=${apiKey}`;

  const parts = [];

  if (imgBase64) {
    parts.push({
      inlineData: {
        mimeType: imgMimeType || 'image/png',
        data: imgBase64
      }
    });
  }

  if (refBase64) {
    parts.push({
      inlineData: {
        mimeType: refMimeType || 'image/png',
        data: refBase64
      }
    });
  }

  parts.push({ text: prompt });

  const body = {
    contents: [
      {
        role: 'user',
        parts: parts
      }
    ],
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
    let errMsg = `HTTP ${resp.status}`;
    try {
      const errJson = JSON.parse(errText);
      errMsg = errJson.error?.message || errJson.message || errMsg;
    } catch (e) {}
    throw new Error(`${model} error (${resp.status}): ${errMsg}`);
  }

  const data = await resp.json();
  const candidateParts = data.candidates?.[0]?.content?.parts || [];

  for (const part of candidateParts) {
    const inlineData = part.inlineData || part.inline_data;
    if (inlineData && (inlineData.data || inlineData.bytes)) {
      return {
        base64: inlineData.data || inlineData.bytes,
        mimeType: inlineData.mimeType || inlineData.mime_type || 'image/png'
      };
    }
  }

  // If text was returned instead of image, extract and report error message
  const textPart = candidateParts.find(p => p.text)?.text;
  if (textPart) {
    throw new Error(`Model returned text instead of image: "${textPart.slice(0, 150)}..."`);
  }

  throw new Error(`Model ${model} did not return image data in output parts.`);
}
