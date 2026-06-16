/* js/zipService.js */

/**
 * Bundles the generated sprite sheet PNG and manifest JSON into a zip file and triggers download
 * @param {string} characterId - Character name prefix for filename
 * @param {HTMLCanvasElement} atlasCanvas - Packed output canvas
 * @param {Object} manifestObj - Coordinates manifest JSON object
 */
export async function downloadZip(characterId, atlasCanvas, manifestObj) {
  if (!window.JSZip) {
    throw new Error('JSZip 라이브러리가 아직 로드되지 않았습니다. 인터넷 연결 및 CDN 로드를 확인하세요.');
  }

  const zip = new window.JSZip();

  // 1. Convert atlas canvas to image Blob
  const imageBlob = await new Promise((resolve, reject) => {
    atlasCanvas.toBlob((blob) => {
      if (blob) resolve(blob);
      else reject(new Error('Canvas 이미지 변환에 실패했습니다.'));
    }, 'image/png');
  });

  // 2. Add atlas image and manifest layout to Zip
  zip.file('sprite-sheet-alpha.png', imageBlob);
  zip.file('manifest.json.frame_layout', JSON.stringify(manifestObj, null, 2));

  // 3. Generate Zip content as binary Blob
  const zipBlob = await zip.generateAsync({ type: 'blob' });

  // 4. Create local URL and trigger client-side download anchor click
  const downloadUrl = URL.createObjectURL(zipBlob);
  const anchor = document.createElement('a');
  
  anchor.href = downloadUrl;
  anchor.download = `${characterId}_spritesheet.zip`;
  
  document.body.appendChild(anchor);
  anchor.click();
  
  // Cleanup
  document.body.removeChild(anchor);
  URL.revokeObjectURL(downloadUrl);
}
