export function resizeImage(file, maxSize = 2048) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('Failed to read file'));
    reader.onload = (e) => {
      const img = new Image();
      img.onerror = () => reject(new Error('Failed to load image'));
      img.onload = () => {
        const canvas = document.createElement('canvas');
        let { width, height } = img;
        if (width > maxSize || height > maxSize) {
          const ratio = Math.min(maxSize / width, maxSize / height);
          width = Math.round(width * ratio);
          height = Math.round(height * ratio);
        }
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0, width, height);
        const base64 = canvas.toDataURL('image/png').split(',')[1];
        resolve({ base64, mimeType: 'image/png', width, height });
      };
      img.src = e.target.result;
    };
    reader.readAsDataURL(file);
  });
}

export function readImageFullRes(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('Failed to read file'));
    reader.onload = (e) => {
      const dataUrl = e.target.result;
      const base64 = dataUrl.split(',')[1];
      const mimeType = file.type || 'image/png';
      const img = new Image();
      img.onerror = () => reject(new Error('Failed to load image'));
      img.onload = () => {
        resolve({ base64, mimeType, width: img.naturalWidth, height: img.naturalHeight });
      };
      img.src = dataUrl;
    };
    reader.readAsDataURL(file);
  });
}

export function detectAspectRatio(width, height) {
  const RATIOS = [
    { key: '1:1',  value: 1 },
    { key: '16:9', value: 16/9 },
    { key: '9:16', value: 9/16 },
    { key: '4:3',  value: 4/3 },
    { key: '3:4',  value: 3/4 },
    { key: '3:2',  value: 3/2 },
    { key: '2:3',  value: 2/3 },
  ];
  const actual = width / height;
  let closest = RATIOS[0];
  let minDiff = Infinity;
  for (const r of RATIOS) {
    const diff = Math.abs(actual - r.value);
    if (diff < minDiff) { minDiff = diff; closest = r; }
  }
  return closest.key;
}

export function downloadImage(base64, mimeType, filename = 'image') {
  let finalFilename = filename;
  const safeMimeType = mimeType || 'image/png';
  
  let ext = 'png';
  if (safeMimeType) {
    if (safeMimeType.includes('jpeg') || safeMimeType.includes('jpg')) ext = 'jpg';
    else if (safeMimeType.includes('webp')) ext = 'webp';
    else if (safeMimeType.includes('gif')) ext = 'gif';
  }

  if (finalFilename.includes('.')) {
    const parts = finalFilename.split('.');
    parts.pop();
    finalFilename = `${parts.join('.')}.${ext}`;
  } else {
    finalFilename = `${finalFilename}.${ext}`;
  }

  const link = document.createElement('a');
  link.href = `data:${safeMimeType};base64,${base64}`;
  link.download = finalFilename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}

export function imageToDataUrl(base64, mimeType) {
  return `data:${mimeType};base64,${base64}`;
}
