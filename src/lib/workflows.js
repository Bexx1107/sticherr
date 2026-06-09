function buildNB2Workflow({ prompt, aspectRatio = 'auto', resolution = '1K', imageUrl = null, image2Url = null, numImages = 1, seed = -1, safetyTolerance = '4', outputFormat = 'png', syncMode = false, limitGenerations = true, enableWebSearch = false, modelId = 'gemini-3.1-flash-image-preview' }) {
  const inputs = {
    prompt,
    num_images: numImages,
    seed: seed === -1 ? Math.floor(Math.random() * 2147483647) : seed,
    aspect_ratio: aspectRatio,
    output_format: outputFormat,
    safety_tolerance: safetyTolerance,
    resolution,
    sync_mode: syncMode,
    limit_generations: limitGenerations,
    enable_web_search: enableWebSearch,
  };

  const workflow = {
    '54': {
      inputs,
      class_type: '', // Will be dynamically mapped
      _meta: {},
    },
    '55': {
      inputs: { images: ['54', 0] },
      class_type: 'PreviewImage',
      _meta: { title: 'Preview Image' },
    },
    '56': {
      inputs: { filename_prefix: 'FloUI', images: ['54', 0] },
      class_type: 'SaveImage',
      _meta: { title: 'Save Image' },
    },
  };

  if (imageUrl) {
    workflow['12'] = {
      inputs: {
        image: imageUrl,
      },
      class_type: 'LoadImage',
      _meta: { title: 'Load Image 1' },
    };
    inputs.image1 = ['12', 0];
    inputs.floyo_text_0 = imageUrl;
    inputs.floyo_image_0 = imageUrl;
  }

  if (image2Url) {
    workflow['13'] = {
      inputs: {
        image: image2Url,
      },
      class_type: 'LoadImage',
      _meta: { title: 'Load Image 2' },
    };
    inputs.image2 = ['13', 0];
  }

  // Map the modelId to the correct ComfyUI node class name
  let classType = 'NanoBanana2Unified_floyo';
  let title = 'Nano Banana 2 Unified (Floyo Partner Nodes)';

  if (modelId === 'gemini-2.5-flash-image') {
    classType = 'NanoBananaUnified_floyo';
    title = 'Nano Banana Unified (Floyo Partner Nodes)';
  } else if (modelId === 'gemini-3-pro-image-preview') {
    classType = 'NanoBananaProUnified_floyo';
    title = 'Nano Banana Pro Unified (Floyo Partner Nodes)';
  }

  workflow['54'].class_type = classType;
  workflow['54']._meta = { title };

  return workflow;
}

export const WORKFLOWS = {
  generateImage: {
    type: 'image',
    name: 'T2I NB2',
    description: 'Text-to-image with Nano Banana 2',
    build: buildNB2Workflow,
  },
  stitcherEdit: {
    type: 'image',
    name: 'Stitcher Edit NB2',
    description: 'Area-specific editing with Nano Banana 2',
    build: buildNB2Workflow,
  },
};
