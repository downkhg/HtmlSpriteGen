/* js/imageProcessor.js */

/**
 * Helper to convert HEX color string to RGB object
 */
export function hexToRgb(hex) {
  const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  return result ? {
    r: parseInt(result[1], 16),
    g: parseInt(result[2], 16),
    b: parseInt(result[3], 16)
  } : { r: 0, g: 255, b: 0 }; // Default green
}

/**
 * Remove chroma key color from canvas image data with smooth tolerance falloff and spill suppression
 * @param {CanvasRenderingContext2D} ctx - Source canvas 2D context
 * @param {number} width - Canvas width
 * @param {number} height - Canvas height
 * @param {string} chromaHex - Hex color string (e.g. '#00ff00')
 * @param {number} tolerance - Matching threshold (5 - 150)
 * @param {number} softEdge - Fade range for transparency smoothing (0 - 10)
 * @returns {ImageData} - Returns transparent image data
 */
export function applyChromaKey(ctx, width, height, chromaHex, tolerance, softEdge) {
  const imageData = ctx.getImageData(0, 0, width, height);
  const data = imageData.data;
  const chroma = hexToRgb(chromaHex);
  
  // Define variables for loop efficiency
  const chromaR = chroma.r;
  const chromaG = chroma.g;
  const chromaB = chroma.b;
  const tolSq = tolerance * tolerance;
  // softEdge is in range 0-10, scale it for RGB distance square
  const softRange = softEdge * 10;
  const maxTol = tolerance + softRange;
  const maxTolSq = maxTol * maxTol;

  const isGreenChroma = (chromaG > chromaR && chromaG > chromaB);

  for (let i = 0; i < data.length; i += 4) {
    const r = data[i];
    const g = data[i+1];
    const b = data[i+2];
    const a = data[i+3];

    if (a === 0) continue;

    // Euclidean distance square in RGB color space
    const dSq = (r - chromaR) ** 2 + (g - chromaG) ** 2 + (b - chromaB) ** 2;

    if (dSq < tolSq) {
      // Fully transparent
      data[i+3] = 0;
    } else if (dSq < maxTolSq && softRange > 0) {
      // Smooth gradient transition
      const d = Math.sqrt(dSq);
      const ratio = (d - tolerance) / softRange;
      data[i+3] = Math.min(a, Math.round(a * ratio));
      
      // Spill suppression for green keying near the edges
      if (isGreenChroma) {
        const avg = (r + b) / 2;
        if (g > avg) {
          // Suppress the green component to average of R and B
          data[i+1] = Math.round(g * (1 - ratio) + avg * ratio);
        }
      }
    } else {
      // Spill suppression even for non-keyed foreground pixels slightly affected by spill
      if (isGreenChroma && g > (r + b) / 2) {
        const avg = (r + b) / 2;
        // Mild suppression for outer outline pixels
        if (dSq < maxTolSq * 1.5) {
          data[i+1] = Math.round(g * 0.9 + avg * 0.1);
        }
      }
    }
  }

  return imageData;
}

/**
 * Connected Component Labeling (CCL) using BFS
 * Finds independent bounding boxes of non-transparent pixel islands.
 * @param {ImageData} imageData - Transparent image data
 * @param {number} noiseThreshold - Minimum pixel count to filter out noise
 * @returns {Array<Object>} - Bounding boxes array [{x, y, w, h, pixelCount}]
 */
export function extractBoundingBoxes(imageData, noiseThreshold = 16) {
  const width = imageData.width;
  const height = imageData.height;
  const data = imageData.data;
  
  // visited matrix stored as Uint8Array for performance
  const visited = new Uint8Array(width * height);
  const boxes = [];

  // Helper function to check if pixel is foreground (non-transparent)
  const isForeground = (x, y) => {
    const idx = (y * width + x) * 4;
    return data[idx + 3] > 10; // Alpha > 10 considered foreground
  };

  // Queue for BFS traversal
  const queue = new Int32Array(width * height * 2); // Preallocated queue coordinates [x, y, x, y...]
  let head = 0;
  let tail = 0;

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const pos = y * width + x;
      
      if (visited[pos] === 1 || !isForeground(x, y)) {
        continue;
      }

      // Found a new component - start BFS
      visited[pos] = 1;
      head = 0;
      tail = 0;

      // Enqueue start pixel
      queue[tail++] = x;
      queue[tail++] = y;

      let minX = x;
      let maxX = x;
      let minY = y;
      let maxY = y;
      let pixelCount = 0;

      while (head < tail) {
        const cx = queue[head++];
        const cy = queue[head++];
        pixelCount++;

        if (cx < minX) minX = cx;
        if (cx > maxX) maxX = cx;
        if (cy < minY) minY = cy;
        if (cy > maxY) maxY = cy;

        // Traverse 8-neighbors
        for (let dy = -1; dy <= 1; dy++) {
          for (let dx = -1; dx <= 1; dx++) {
            if (dx === 0 && dy === 0) continue;
            
            const nx = cx + dx;
            const ny = cy + dy;

            if (nx >= 0 && nx < width && ny >= 0 && ny < height) {
              const nPos = ny * width + nx;
              if (visited[nPos] === 0 && isForeground(nx, ny)) {
                visited[nPos] = 1;
                queue[tail++] = nx;
                queue[tail++] = ny;
              }
            }
          }
        }
      }

      const w = maxX - minX + 1;
      const h = maxY - minY + 1;

      // Filter out small artifacts / single pixel noise
      if (pixelCount >= noiseThreshold && w > 4 && h > 4) {
        boxes.push({
          x: minX,
          y: minY,
          w: w,
          h: h,
          pixelCount: pixelCount
        });
      }
    }
  }

  return boxes;
}

/**
 * Group raw bounding boxes into horizontal rows and associate them with states.
 * @param {Array<Object>} boxes - Detected bounding boxes
 * @param {Array<Object>} states - Defined state configurations [{name, frames}]
 * @returns {Map<string, Array<Object>>} - Map of state name to ordered frame bounding boxes
 */
export function groupBoxesIntoStates(boxes, states) {
  if (boxes.length === 0) return new Map();

  // 1. Calculate centers
  const boxesWithCenters = boxes.map(box => ({
    ...box,
    centerY: box.y + box.h / 2,
    centerX: box.x + box.w / 2
  }));

  // 2. Sort primarily by Y-center
  boxesWithCenters.sort((a, b) => a.centerY - b.centerY);

  // 3. Group into rows based on Y proximity
  const rows = [];
  let currentRow = [];
  
  // Use average box height as reference for vertical grouping tolerance
  const avgHeight = boxes.reduce((sum, b) => sum + b.h, 0) / boxes.length;
  const yTolerance = avgHeight * 0.5; // tolerance distance is half average height

  for (const box of boxesWithCenters) {
    if (currentRow.length === 0) {
      currentRow.push(box);
    } else {
      const rowCenterY = currentRow.reduce((sum, b) => sum + b.centerY, 0) / currentRow.length;
      if (Math.abs(box.centerY - rowCenterY) < yTolerance) {
        currentRow.push(box);
      } else {
        // Sort current row by X-center before saving
        currentRow.sort((a, b) => a.centerX - b.centerX);
        rows.push(currentRow);
        currentRow = [box];
      }
    }
  }
  
  if (currentRow.length > 0) {
    currentRow.sort((a, b) => a.centerX - b.centerX);
    rows.push(currentRow);
  }

  // 4. Map grouped rows to state list
  const stateFramesMap = new Map();
  
  states.forEach((state, index) => {
    // If we have a row corresponding to this state index
    if (index < rows.length) {
      // Take the frames in this row (up to requested frames limit, or all if not limited)
      const rowFrames = rows[index];
      stateFramesMap.set(state.name, rowFrames.map((f, i) => ({
        index: i,
        sourceX: f.x,
        sourceY: f.y,
        sourceW: f.w,
        sourceH: f.h,
        // Curation overrides defaults
        nudgeX: 0,
        nudgeY: 0,
        scale: 1,
        rotate: 0,
        rejected: false
      })));
    } else {
      // Empty placeholder list if AI didn't generate enough rows
      stateFramesMap.set(state.name, []);
    }
  });

  return stateFramesMap;
}
