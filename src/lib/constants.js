export const MODELS = {
  standard: { id: 'gemini-2.5-flash-image', label: 'Nano Banana', desc: 'Fast & efficient image generation' },
  pro: { id: 'gemini-3-pro-image-preview', label: 'Nano Banana Pro', desc: 'Studio-quality 4K output' },
  banana2: { id: 'gemini-3.1-flash-image-preview', label: 'Nano Banana 2', desc: 'Latest gen, high fidelity' },
};

export const MODEL_DISPLAY = {
  standard: { emoji: '🍌', label: 'Nano Banana' },
  banana2: { emoji: '🍌', label: 'Nano Banana 2' },
  pro: { emoji: '⚡', label: 'Nano Banana Pro' },
};

export const ENTITY_INSTRUCTIONS = {
  character: "This is a REFERENCE IMAGE of the character. You MUST maintain this character's exact appearance, proportions, clothing, hair, skin tone, and all distinctive features in the generated image. The character must look identical to this reference.",
  asset: "This is a REFERENCE IMAGE of an asset/prop. You MUST replicate this asset exactly as shown — same shape, color, texture, and proportions.",
  logo: "You MUST replicate this logo with 100% perfect accuracy. DO NOT alter, distort, simplify, or reimagine this logo in any way. Reproduce every line, color, shape, and text element exactly. This is the highest priority, non-negotiable instruction.",
  location: "This is a REFERENCE IMAGE of the location/environment. You MUST use this exact environment as the setting for the generated image. Match the architecture, lighting, atmosphere, colors, and spatial layout as closely as possible.",
};
