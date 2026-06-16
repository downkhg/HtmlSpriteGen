/* js/app.js */

const { getApiKey, getModelName, getThinkingLevel, getApiVersion, saveConfigToLocal, generateConfigFileContent, testApiKey, generateSpriteSheet, inpaintSprite } = window.geminiAPI;
const { applyChromaKey, extractBoundingBoxes, groupBoxesIntoStates } = window.imageProcessor;
const { packSpriteSheet, bakeAtlasCanvas } = window.packer;
const { downloadZip } = window.zipService;
const SpriteCurator = window.SpriteCurator;

// Global Application State
const state = {
  characterId: 'hero_pixel',
  states: [
    { name: 'idle', frames: 4, fps: 6, loop: true, action: 'standing breathing pose', status: 'stable' },
    { name: 'walk', frames: 4, fps: 8, loop: true, action: 'walking loop cycle', status: 'experimental' },
    { name: 'attack', frames: 4, fps: 10, loop: false, action: 'slashing with a sword', status: 'stable' }
  ],
  baseImage: null, // HTMLImageElement
  chromaCanvas: null, // Offscreen transparent canvas
  stateFramesMap: new Map(), // stateName -> Array of frames
  curator: null, // SpriteCurator instance
  activeStateName: '',
  bakedResult: null,
  
  // Inpainting draw state
  isDrawingMask: false,
  isPainting: false,
  brushMode: 'draw', // 'draw' or 'erase'
  brushSize: 12,
  maskCanvas: null,
  maskCtx: null
};

// Initialize Application on load
document.addEventListener('DOMContentLoaded', () => {
  loadProjectSettings();
  initUI();
  updateApiKeyStatus();
  renderStatesConfigList();
  
  // Create SpriteCurator instance
  state.curator = new SpriteCurator('curatorCanvas', 'playerCanvas', handleCurationDataChanged);
  
  // Set default active state
  state.activeStateName = state.states[0].name;
});

/**
 * Helper to load images using promises for clean async/await try-catch error handling
 */
function loadImage(src) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('이미지 로딩 및 디코딩에 실패했습니다.'));
    img.src = src;
  });
}

let debugWindowCount = 0;

/**
 * Creates and displays a stackable, draggable floating debug window alert
 * containing the generated image with a download button and the prompt used.
 */
function createDebugWindow(base64Data, title = '생성된 이미지 디버그', promptText = '') {
  debugWindowCount++;
  
  const debugWin = document.createElement('div');
  debugWin.className = 'debug-window';
  
  // Staggered positioning
  const offset = (debugWindowCount % 6) * 30;
  debugWin.style.position = 'fixed';
  debugWin.style.top = `calc(15% + ${offset}px)`;
  debugWin.style.left = `calc(20% + ${offset}px)`;
  debugWin.style.width = '440px';
  debugWin.style.background = 'rgba(15, 15, 25, 0.98)';
  debugWin.style.border = '2px solid var(--accent)';
  debugWin.style.borderRadius = '12px';
  debugWin.style.boxShadow = '0 20px 40px rgba(0,0,0,0.6)';
  debugWin.style.zIndex = 10000 + debugWindowCount;
  debugWin.style.display = 'flex';
  debugWin.style.flexDirection = 'column';
  debugWin.style.overflow = 'hidden';
  debugWin.style.fontFamily = 'var(--font-main, sans-serif)';
  debugWin.style.color = '#fff';
  
  const header = document.createElement('div');
  header.style.display = 'flex';
  header.style.justifyContent = 'space-between';
  header.style.alignItems = 'center';
  header.style.padding = '10px 16px';
  header.style.background = 'linear-gradient(90deg, rgba(168, 85, 247, 0.25), rgba(168, 85, 247, 0.05))';
  header.style.borderBottom = '1px solid rgba(255,255,255,0.1)';
  header.style.cursor = 'move';
  header.style.userSelect = 'none';
  
  header.innerHTML = `
    <span style="font-size: 13px; font-weight: 600; color: #e9d5ff; letter-spacing: 0.5px;">${title} (#${debugWindowCount})</span>
    <button class="debug-close-btn" style="background: none; border: none; color: #9ca3af; font-size: 20px; cursor: pointer; padding: 0 4px; transition: color 0.2s;">&times;</button>
  `;
  
  const content = document.createElement('div');
  content.style.padding = '16px';
  content.style.display = 'flex';
  content.style.flexDirection = 'column';
  content.style.gap = '12px';
  content.style.alignItems = 'center';
  
  const imgUrl = `data:image/png;base64,${base64Data}`;
  
  let promptSection = '';
  if (promptText) {
    promptSection = `
    <div style="width: 100%; box-sizing: border-box; text-align: left;">
      <label style="font-size: 11px; color: #a78bfa; font-weight: 600; display: block; margin-bottom: 4px;">사용한 전체 생성 프롬프트:</label>
      <textarea style="width: 100%; height: 65px; font-family: monospace; font-size: 11px; background: #09090b; border: 1px solid rgba(255,255,255,0.08); border-radius: 6px; color: #cbd5e1; padding: 6px; resize: vertical; box-sizing: border-box;" readonly>${promptText}</textarea>
    </div>
    `;
  }
  
  content.innerHTML = `
    <div style="width: 100%; max-height: 280px; overflow: auto; background: #09090b; border: 1px solid rgba(255,255,255,0.08); border-radius: 6px; display: flex; justify-content: center; align-items: center; padding: 8px; box-sizing: border-box;">
      <img src="${imgUrl}" style="max-width: 100%; height: auto; display: block; image-rendering: pixelated;" />
    </div>
    ${promptSection}
    <div style="display: flex; gap: 10px; width: 100%; box-sizing: border-box;">
      <a href="${imgUrl}" download="${title.replace(/\s+/g, '_')}_${debugWindowCount}.png" class="btn btn-primary" style="flex: 1; text-align: center; font-size: 12px; padding: 10px; text-decoration: none; display: inline-block; line-height: 1.2;">
        💾 이미지 다운로드
      </a>
      <button class="btn debug-close-btn-action" style="flex: 1; font-size: 12px; padding: 10px;">닫기</button>
    </div>
  `;
  
  // Close hover color transition
  const closeX = header.querySelector('.debug-close-btn');
  closeX.addEventListener('mouseover', () => closeX.style.color = '#ef4444');
  closeX.addEventListener('mouseout', () => closeX.style.color = '#9ca3af');
  
  debugWin.appendChild(header);
  debugWin.appendChild(content);
  
  // Dragging logic
  let isDragging = false;
  let startX, startY;
  
  header.addEventListener('mousedown', (e) => {
    if (e.target.tagName === 'BUTTON') return;
    isDragging = true;
    startX = e.clientX - debugWin.offsetLeft;
    startY = e.clientY - debugWin.offsetTop;
    // Bring clicked window to the very front
    debugWin.style.zIndex = 10100 + debugWindowCount;
  });
  
  const onMouseMove = (e) => {
    if (!isDragging) return;
    debugWin.style.left = `${e.clientX - startX}px`;
    debugWin.style.top = `${e.clientY - startY}px`;
  };
  
  const onMouseUp = () => {
    isDragging = false;
  };
  
  document.addEventListener('mousemove', onMouseMove);
  document.addEventListener('mouseup', onMouseUp);
  
  const closeWin = () => {
    document.removeEventListener('mousemove', onMouseMove);
    document.removeEventListener('mouseup', onMouseUp);
    if (debugWin.parentNode) {
      document.body.removeChild(debugWin);
    }
  };
  
  header.querySelector('.debug-close-btn').addEventListener('click', closeWin);
  content.querySelector('.debug-close-btn-action').addEventListener('click', closeWin);
  
  document.body.appendChild(debugWin);
}

/**
 * Display toast notification
 */
function showToast(message, type = 'success') {
  const container = document.getElementById('toastContainer');
  const toast = document.createElement('div');
  toast.className = `toast toast-${type}`;
  toast.innerText = message;
  container.appendChild(toast);
  
  setTimeout(() => {
    toast.style.animation = 'slideIn 0.3s forwards reverse ease';
    setTimeout(() => {
      container.removeChild(toast);
    }, 300);
  }, 3000);
}

const CONFIG_KEYS = {
  PROJECT_SETTINGS: 'antigravity_project_settings'
};

/**
 * Save current project settings to localStorage
 */
function saveProjectSettings() {
  const projectSettings = {
    characterId: document.getElementById('charId').value.trim(),
    states: state.states,
    prompt: document.getElementById('promptInput').value,
    chromaColor: document.getElementById('chromaColor').value,
    tolerance: document.getElementById('toleranceRange').value,
    softEdge: document.getElementById('softEdgeRange').value,
    cclNoise: document.getElementById('cclNoiseRange').value,
    maxAtlasSize: document.getElementById('maxAtlasSize').value,
    atlasPadding: document.getElementById('atlasPadding').value,
    potCheck: document.getElementById('potCheck').checked
  };
  localStorage.setItem(CONFIG_KEYS.PROJECT_SETTINGS, JSON.stringify(projectSettings));
}

/**
 * Load project settings from localStorage
 */
function loadProjectSettings() {
  const data = localStorage.getItem(CONFIG_KEYS.PROJECT_SETTINGS);
  if (!data) return false;
  try {
    const config = JSON.parse(data);
    if (config.characterId) {
      document.getElementById('charId').value = config.characterId;
      state.characterId = config.characterId;
    }
    if (Array.isArray(config.states)) {
      state.states = config.states;
    }
    if (config.prompt !== undefined) {
      document.getElementById('promptInput').value = config.prompt;
    }
    if (config.chromaColor) {
      document.getElementById('chromaColor').value = config.chromaColor;
    }
    if (config.tolerance) {
      document.getElementById('toleranceRange').value = config.tolerance;
      document.getElementById('toleranceVal').innerText = config.tolerance;
    }
    if (config.softEdge) {
      document.getElementById('softEdgeRange').value = config.softEdge;
      document.getElementById('softEdgeVal').innerText = config.softEdge;
    }
    if (config.cclNoise) {
      document.getElementById('cclNoiseRange').value = config.cclNoise;
      document.getElementById('cclNoiseVal').innerText = config.cclNoise;
    }
    if (config.maxAtlasSize) {
      document.getElementById('maxAtlasSize').value = config.maxAtlasSize;
    }
    if (config.atlasPadding) {
      document.getElementById('atlasPadding').value = config.atlasPadding;
    }
    if (config.potCheck !== undefined) {
      document.getElementById('potCheck').checked = config.potCheck;
    }
    return true;
  } catch (e) {
    console.error('Error loading project settings:', e);
    return false;
  }
}

/**
 * Update API Key badge configuration status on top header
 */
function updateApiKeyStatus() {
  const badge = document.getElementById('apiKeyStatusBtn');
  const key = getApiKey();
  if (key) {
    badge.classList.add('configured');
    badge.querySelector('.text').innerText = 'Gemini API Key 설정됨';
  } else {
    badge.classList.remove('configured');
    badge.querySelector('.text').innerText = 'Gemini API Key 필요';
  }
}

/**
 * Render list of input configurations for actions/states in Left Sidebar
 */
function renderStatesConfigList() {
  const container = document.getElementById('stateRowsContainer');
  container.innerHTML = '';
  
  state.states.forEach((item, index) => {
    const row = document.createElement('div');
    row.className = 'state-config-item';
    
    // Style inline to support file:// and look beautiful without specific layout CSS dependencies
    row.style.display = 'grid';
    row.style.gridTemplateColumns = '1fr 60px 60px';
    row.style.gap = '8px';
    row.style.alignItems = 'center';
    row.style.padding = '6px 10px';
    row.style.borderRadius = 'var(--border-radius-sm)';
    row.style.cursor = 'pointer';
    row.style.transition = 'var(--transition-smooth)';
    
    // Highlight if selected as active state
    const isActive = item.name === state.activeStateName;
    if (isActive) {
      row.style.border = '1px solid var(--accent)';
      row.style.background = 'rgba(168, 85, 247, 0.08)';
      row.style.boxShadow = '0 0 8px rgba(168, 85, 247, 0.15)';
    } else {
      row.style.border = '1px solid transparent';
      row.style.background = 'transparent';
    }
    
    row.innerHTML = `
      <input type="text" class="control-input state-name-input" style="padding:6px;" value="${item.name}" placeholder="상태명" data-idx="${index}">
      <input type="number" class="control-input state-frames-input" style="padding:6px; text-align:center;" value="${item.frames}" min="1" max="12" title="프레임 수" data-idx="${index}">
      <input type="number" class="control-input state-fps-input" style="padding:6px; text-align:center;" value="${item.fps}" min="1" max="30" title="기본 FPS" data-idx="${index}">
    `;

    // Click on row to select as active state
    row.addEventListener('click', (e) => {
      if (e.target.tagName !== 'INPUT') {
        state.activeStateName = item.name;
        renderStatesConfigList();
        refreshCurationTabUI();
      }
    });

    container.appendChild(row);
  });

  // Bind key inputs updates
  container.querySelectorAll('.state-name-input').forEach(input => {
    input.addEventListener('change', (e) => {
      const idx = parseInt(e.target.dataset.idx);
      const oldName = state.states[idx].name;
      const newName = e.target.value.trim();
      
      // Update state and activeStateName if it was renamed
      state.states[idx].name = newName;
      if (state.activeStateName === oldName) {
        state.activeStateName = newName;
      }
      
      // Update map keys if frames exist
      if (state.stateFramesMap.has(oldName)) {
        const frames = state.stateFramesMap.get(oldName);
        state.stateFramesMap.delete(oldName);
        state.stateFramesMap.set(newName, frames);
      }
      
      refreshCurationTabUI();
      saveProjectSettings();
    });
  });

  container.querySelectorAll('.state-frames-input').forEach(input => {
    input.addEventListener('change', (e) => {
      const idx = parseInt(e.target.dataset.idx);
      state.states[idx].frames = parseInt(e.target.value) || 4;
      saveProjectSettings();
    });
  });

  container.querySelectorAll('.state-fps-input').forEach(input => {
    input.addEventListener('change', (e) => {
      const idx = parseInt(e.target.dataset.idx);
      state.states[idx].fps = parseInt(e.target.value) || 6;
      refreshCurationTabUI();
      saveProjectSettings();
    });
  });
}

/**
 * Initialize event listeners and UI bindings
 */
function initUI() {
  // --- 1. Tab Router switching ---
  // --- 0. Project Settings auto-save and Import/Export ---
  document.getElementById('charId').addEventListener('input', () => {
    state.characterId = document.getElementById('charId').value.trim() || 'hero_pixel';
    saveProjectSettings();
  });

  // Save when prompt changes
  document.getElementById('promptInput').addEventListener('input', saveProjectSettings);

  // Save settings when atlas packing options change
  document.getElementById('maxAtlasSize').addEventListener('change', saveProjectSettings);
  document.getElementById('atlasPadding').addEventListener('input', saveProjectSettings);
  document.getElementById('potCheck').addEventListener('change', saveProjectSettings);
  
  // Export project settings
  document.getElementById('exportProjConfigBtn').addEventListener('click', () => {
    const projectSettings = {
      characterId: document.getElementById('charId').value.trim(),
      states: state.states,
      prompt: document.getElementById('promptInput').value,
      chromaColor: document.getElementById('chromaColor').value,
      tolerance: document.getElementById('toleranceRange').value,
      softEdge: document.getElementById('softEdgeRange').value,
      cclNoise: document.getElementById('cclNoiseRange').value,
      maxAtlasSize: document.getElementById('maxAtlasSize').value,
      atlasPadding: document.getElementById('atlasPadding').value,
      potCheck: document.getElementById('potCheck').checked
    };
    const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(projectSettings, null, 2));
    const downloadAnchor = document.createElement('a');
    downloadAnchor.setAttribute("href", dataStr);
    downloadAnchor.setAttribute("download", `${projectSettings.characterId}_settings.json`);
    document.body.appendChild(downloadAnchor);
    downloadAnchor.click();
    downloadAnchor.remove();
    showToast('프로젝트 설정이 파일로 내보내졌습니다.');
  });

  // Import project settings
  const importInput = document.getElementById('importProjConfigFileInput');
  document.getElementById('importProjConfigBtn').addEventListener('click', () => {
    importInput.click();
  });

  importInput.addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        localStorage.setItem(CONFIG_KEYS.PROJECT_SETTINGS, event.target.result);
        if (loadProjectSettings()) {
          renderStatesConfigList();
          refreshCurationTabUI();
          showToast('프로젝트 설정을 파일에서 성공적으로 가져왔습니다!');
        } else {
          showToast('유효하지 않은 프로젝트 설정 파일입니다.', 'error');
        }
      } catch (err) {
        showToast('설정 파일 가져오기 실패: ' + err.message, 'error');
      }
    };
    reader.readAsText(file);
    e.target.value = ''; // Reset file input
  });

  // --- 1. Tab Router switching ---
  document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      const targetPanelId = e.currentTarget.dataset.tab;
      
      // Active tab styling
      document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
      e.currentTarget.classList.add('active');
      
      // Active panel display
      document.querySelectorAll('.app-tab-panel').forEach(p => p.classList.remove('active'));
      document.getElementById(targetPanelId).classList.add('active');
      
      // Hook: when entering specific tabs
      if (targetPanelId === 'curation-tab') {
        refreshCurationTabUI();
      } else if (targetPanelId === 'export-tab') {
        triggerAtlasPacking();
      }
    });
  });

  // Add state button
  document.getElementById('addStateBtn').addEventListener('click', () => {
    const defaultActions = ['walk', 'attack', 'jump', 'die', 'hurt', 'run', 'shoot'];
    const usedNames = state.states.map(s => s.name);
    let newName = 'action';
    for (const act of defaultActions) {
      if (!usedNames.includes(act)) {
        newName = act;
        break;
      }
    }
    if (usedNames.includes(newName)) {
      newName = `action_${state.states.length}`;
    }
    
    // Idle/Attack are stable, jump/walk experimental
    const isStable = ['idle', 'attack', 'die'].includes(newName);
    
    state.states.push({
      name: newName,
      frames: 4,
      fps: 6,
      loop: true,
      action: `${newName} animation loop`,
      status: isStable ? 'stable' : 'experimental'
    });
    renderStatesConfigList();
    saveProjectSettings();
  });

  // Remove state button (selected/active state)
  document.getElementById('removeStateBtn').addEventListener('click', () => {
    if (state.states.length <= 1) {
      showToast('최소 하나의 액션 상태가 필요합니다.', 'error');
      return;
    }

    const activeIdx = state.states.findIndex(s => s.name === state.activeStateName);
    if (activeIdx !== -1) {
      const deletedName = state.activeStateName;
      state.states.splice(activeIdx, 1);
      state.stateFramesMap.delete(deletedName);
      
      // Select the first remaining state as active
      state.activeStateName = state.states[0].name;
      
      renderStatesConfigList();
      refreshCurationTabUI();
      saveProjectSettings();
      showToast(`'${deletedName}' 액션이 목록에서 삭제되었습니다.`);
    }
  });

  // --- 2. API Key Dialog overlay ---
  const keyBtn = document.getElementById('apiKeyStatusBtn');
  const keyDialog = document.getElementById('apiKeyDialogContainer');
  const keyClose = document.getElementById('apiKeyDialogClose');
  const keyCancel = document.getElementById('apiKeyCancelBtn');
  const keySave = document.getElementById('apiKeySaveBtn');
  const keyTest = document.getElementById('apiKeyTestBtn');
  const keyInput = document.getElementById('apiKeyInput');
  const modelNameInput = document.getElementById('modelNameInput');
  const apiVersionInput = document.getElementById('apiVersionInput');
  const thinkingLevelInput = document.getElementById('thinkingLevelInput');

  keyBtn.addEventListener('click', () => {
    keyInput.value = getApiKey();
    modelNameInput.value = getModelName();
    apiVersionInput.value = getApiVersion();
    thinkingLevelInput.value = getThinkingLevel();
    keyDialog.style.display = 'flex';
  });

  const closeDialog = () => {
    keyDialog.style.display = 'none';
  };
  keyClose.addEventListener('click', closeDialog);
  keyCancel.addEventListener('click', closeDialog);

  keySave.addEventListener('click', () => {
    const apiKeyVal = keyInput.value;
    const modelVal = modelNameInput.value.trim();
    const versionVal = apiVersionInput.value.trim();
    const levelVal = thinkingLevelInput.value;

    // 1. Save to local storage for instant session access
    saveConfigToLocal(apiKeyVal, modelVal, levelVal, versionVal);
    updateApiKeyStatus();

    // 2. Automatically trigger downloading the gemini.js config file to let the user save it to the Data/ folder
    const fileContent = generateConfigFileContent(apiKeyVal, modelVal, levelVal, versionVal);
    const blob = new Blob([fileContent], { type: 'text/javascript' });
    const downloadUrl = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = downloadUrl;
    anchor.download = 'gemini.js';
    document.body.appendChild(anchor);
    anchor.click();
    document.body.removeChild(anchor);
    URL.revokeObjectURL(downloadUrl);

    closeDialog();
    showToast('Gemini API 설정이 임시 저장되었으며, gemini.js 파일 다운로드가 시작되었습니다. Data/ 폴더에 덮어씌우세요!');
  });

  keyTest.addEventListener('click', async () => {
    const testKey = keyInput.value.trim();
    const versionVal = apiVersionInput.value.trim();
    if (!testKey) {
      showToast('API Key를 입력해주세요.', 'error');
      return;
    }
    keyTest.disabled = true;
    keyTest.innerText = '검증 중...';
    try {
      const ok = await testApiKey(testKey, versionVal);
      if (ok) {
        showToast('API Key가 유효합니다! 연동 성공.');
      } else {
        showToast('유효하지 않은 API Key입니다.', 'error');
      }
    } catch (err) {
      showToast(`인증 실패: ${err.message}`, 'error');
    } finally {
      keyTest.disabled = false;
      keyTest.innerText = '연동 테스트';
    }
  });

  // Download Config button
  document.getElementById('downloadConfigBtn').addEventListener('click', () => {
    const keyVal = keyInput.value;
    const modelVal = modelNameInput.value.trim();
    const versionVal = apiVersionInput.value.trim();
    const levelVal = thinkingLevelInput.value;

    const fileContent = generateConfigFileContent(keyVal, modelVal, levelVal, versionVal);
    const blob = new Blob([fileContent], { type: 'text/javascript' });
    const downloadUrl = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = downloadUrl;
    anchor.download = 'gemini.js';
    document.body.appendChild(anchor);
    anchor.click();
    document.body.removeChild(anchor);
    URL.revokeObjectURL(downloadUrl);
    showToast('gemini.js 설정 파일을 다운로드했습니다. Data 폴더에 덮어씌우세요.');
  });

  // --- 3. AI Image Generation trigger ---
  const generateBtn = document.getElementById('generateSheetBtn');
  generateBtn.addEventListener('click', async () => {
    const key = getApiKey();
    if (!key) {
      showToast('Gemini API Key가 필요합니다. 상단 헤더 버튼을 클릭해 입력해주세요.', 'error');
      keyDialog.style.display = 'flex';
      return;
    }

    const promptText = document.getElementById('promptInput').value.trim();
    if (!promptText) {
      showToast('생성할 캐릭터 프롬프트를 입력해주세요.', 'error');
      return;
    }

    // Capture character ID
    state.characterId = document.getElementById('charId').value.trim() || 'hero_pixel';

    // Build optimized sprite sheet prompt
    // Organize rows by states
    const rowsDescription = state.states.map(s => `- Row of 2D pixel-art sprite sheet of the character doing: ${s.name} (${s.frames} horizontal frames)`).join('\n');
    const fullPrompt = `${promptText}
Sprite sheet rows configuration:
${rowsDescription}
All sprites MUST be aligned horizontally in rows against a solid green screen (#00FF00) background. Ensure each state forms a complete horizontal row. Style: clean, pixel-perfect.`;

    const loader = document.getElementById('generateLoader');
    const loaderText = document.getElementById('generateLoaderText');
    
    loader.classList.add('active');
    loaderText.innerText = 'Gemini AI로 스프라이트 생성 중... (10~20초 소요)';
    generateBtn.disabled = true;

    try {
      const base64Data = await generateSpriteSheet(key, getModelName(), fullPrompt);
      
      // Show debugging modal window with image and download options
      createDebugWindow(base64Data, 'AI 생성 스프라이트 시트 원본', fullPrompt);
      
      // Load generated image using promise helper
      const img = await loadImage(`data:image/png;base64,${base64Data}`);
      state.baseImage = img;
      runImagePipeline();
      loader.classList.remove('active');
      generateBtn.disabled = false;
      showToast('스프라이트 시트가 성공적으로 생성 및 분할되었습니다!');
      
      // Auto navigate to curation tab
      document.querySelector('[data-tab="curation-tab"]').click();
    } catch (error) {
      loader.classList.remove('active');
      generateBtn.disabled = false;
      showToast(`에셋 생성 오류: ${error.message}`, 'error');
    }
  });

  // --- 4. Local File Image loader ---
  const fileLoader = document.getElementById('localFileLoad');
  fileLoader.addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (!file) return;

    state.characterId = document.getElementById('charId').value.trim() || 'hero_pixel';

    const reader = new FileReader();
    reader.onload = (event) => {
      const img = new Image();
      img.onload = () => {
        state.baseImage = img;
        runImagePipeline();
        showToast('로컬 스프라이트 시트 이미지가 로드되었습니다.');
        document.querySelector('[data-tab="curation-tab"]').click();
      };
      img.src = event.target.result;
    };
    reader.readAsDataURL(file);
  });

  // --- 5. Chroma key and CCL parameter live updates ---
  const toleranceRange = document.getElementById('toleranceRange');
  const toleranceVal = document.getElementById('toleranceVal');
  const softRange = document.getElementById('softEdgeRange');
  const softEdgeVal = document.getElementById('softEdgeVal');
  const chromaColorInput = document.getElementById('chromaColor');

  const onFilterParamsChanged = () => {
    toleranceVal.innerText = toleranceRange.value;
    softEdgeVal.innerText = softRange.value;
    if (state.baseImage) {
      runImagePipeline(false); // run pipeline without changing manual curation offsets if possible
      state.curator.renderCurator();
    }
    saveProjectSettings();
  };

  toleranceRange.addEventListener('input', onFilterParamsChanged);
  softRange.addEventListener('input', onFilterParamsChanged);
  chromaColorInput.addEventListener('change', onFilterParamsChanged);

  // Noise Filter slider
  const noiseRange = document.getElementById('cclNoiseRange');
  const noiseVal = document.getElementById('cclNoiseVal');
  noiseRange.addEventListener('input', () => {
    noiseVal.innerText = noiseRange.value;
    if (state.baseImage) {
      runImagePipeline(false);
      state.curator.renderCurator();
    }
    saveProjectSettings();
  });

  // Color picker (Eyedropper API if available)
  const eyedropperBtn = document.getElementById('colorPickerBtn');
  if (window.EyeDropper) {
    eyedropperBtn.addEventListener('click', async () => {
      try {
        const eyeDropper = new EyeDropper();
        const result = await eyeDropper.open();
        chromaColorInput.value = result.sRGBHex;
        onFilterParamsChanged();
      } catch (err) {
        console.warn('Eyedropper canceled or failed:', err);
      }
    });
  } else {
    eyedropperBtn.style.display = 'none';
  }

  // --- 6. Curation Viewport Background QA switching ---
  document.getElementById('vpBgChecker').addEventListener('click', (e) => {
    setActiveBgBtn(e.target);
    state.curator.setBgType('checkerboard');
  });
  document.getElementById('vpBgWhite').addEventListener('click', (e) => {
    setActiveBgBtn(e.target);
    state.curator.setBgType('white');
  });
  document.getElementById('vpBgBlack').addEventListener('click', (e) => {
    setActiveBgBtn(e.target);
    state.curator.setBgType('black');
  });

  const setActiveBgBtn = (btn) => {
    document.querySelectorAll('#vpBgChecker, #vpBgWhite, #vpBgBlack').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
  };

  // Zoom bindings
  document.getElementById('vpZoomIn').addEventListener('click', () => {
    state.curator.setZoom(state.curator.zoom + 0.5);
  });
  document.getElementById('vpZoomOut').addEventListener('click', () => {
    state.curator.setZoom(state.curator.zoom - 0.5);
  });

  // --- 7. Curation transform input nudging ---
  const inputNudgeX = document.getElementById('nudgeX');
  const inputNudgeY = document.getElementById('nudgeY');
  const inputScale = document.getElementById('nudgeScale');
  const inputRotate = document.getElementById('nudgeRotate');

  const onNudgeInputsChanged = () => {
    const nx = parseInt(inputNudgeX.value) || 0;
    const ny = parseInt(inputNudgeY.value) || 0;
    const sc = parseFloat(inputScale.value) || 1.0;
    const rot = parseInt(inputRotate.value) || 0;

    state.curator.updateSelectedFrameNudge(nx, ny, sc, rot);
  };

  inputNudgeX.addEventListener('input', onNudgeInputsChanged);
  inputNudgeY.addEventListener('input', onNudgeInputsChanged);
  inputScale.addEventListener('input', onNudgeInputsChanged);
  inputRotate.addEventListener('input', onNudgeInputsChanged);

  // Reset nudge offsets button
  document.getElementById('resetNudgeBtn').addEventListener('click', () => {
    inputNudgeX.value = 0;
    inputNudgeY.value = 0;
    inputScale.value = 1.0;
    inputRotate.value = 0;
    state.curator.updateSelectedFrameNudge(0, 0, 1.0, 0);
  });

  // Apply nudge to all frames in the active state
  document.getElementById('applyAllNudgeBtn').addEventListener('click', () => {
    const frame = state.curator.getSelectedFrame();
    if (!frame) return;
    
    const frames = state.stateFramesMap.get(state.activeStateName) || [];
    frames.forEach(f => {
      if (f.index !== frame.index) {
        f.nudgeX = frame.nudgeX;
        f.nudgeY = frame.nudgeY;
        f.scale = frame.scale;
        f.rotate = frame.rotate;
      }
    });
    
    state.curator.renderCurator();
    showToast('현재 오프셋 설정을 이 상태의 모든 프레임에 복사했습니다.');
  });

  // --- 8. Preview Loop Player control binds ---
  const playBtn = document.getElementById('btnPlayerPlay');
  playBtn.addEventListener('click', () => {
    state.curator.isPlaying = !state.curator.isPlaying;
    playBtn.innerText = state.curator.isPlaying ? '일시정지' : '재생';
  });

  const playerFpsRange = document.getElementById('playerFpsRange');
  const playerFpsVal = document.getElementById('playerFpsVal');
  playerFpsRange.addEventListener('input', () => {
    playerFpsVal.innerText = playerFpsRange.value;
    state.curator.playerFps = parseInt(playerFpsRange.value);
  });

  const playerLoopCheck = document.getElementById('playerLoopCheck');
  playerLoopCheck.addEventListener('change', () => {
    state.curator.playerLoop = playerLoopCheck.checked;
  });

  // --- 9. Bake & ZIP Download trigger ---
  document.getElementById('bakeAtlasBtn').addEventListener('click', () => {
    triggerAtlasPacking();
  });

  document.getElementById('downloadZipBtn').addEventListener('click', async () => {
    if (!state.bakedResult) return;
    const downloadBtn = document.getElementById('downloadZipBtn');
    downloadBtn.disabled = true;
    downloadBtn.innerText = '압축 파일 빌드 중...';
    try {
      await downloadZip(state.characterId, document.getElementById('atlasCanvas'), state.bakedResult.manifest);
      showToast('아틀라스와 매니페스트 파일이 다운로드되었습니다.');
    } catch (err) {
      showToast(`다운로드 오류: ${err.message}`, 'error');
    } finally {
      downloadBtn.disabled = false;
      downloadBtn.innerText = '아틀라스 & 매니페스트 ZIP 다운로드';
    }
  });

  // --- 10. Inpainting Drawing Canvas Setup ---
  const genCanvas = document.getElementById('generationCanvas');
  const genCtx = genCanvas.getContext('2d');
  
  genCanvas.addEventListener('mousedown', (e) => {
    if (!state.isDrawingMask) return;
    state.isPainting = true;
    paintMask(e, genCanvas);
  });

  genCanvas.addEventListener('mousemove', (e) => {
    if (!state.isDrawingMask || !state.isPainting) return;
    paintMask(e, genCanvas);
  });

  const stopPainting = () => {
    state.isPainting = false;
  };
  genCanvas.addEventListener('mouseup', stopPainting);
  genCanvas.addEventListener('mouseleave', stopPainting);

  // Inpaint menu triggers
  document.getElementById('btnBrushMask').addEventListener('click', (e) => {
    state.brushMode = 'draw';
    document.querySelectorAll('#btnBrushMask, #btnEraserMask').forEach(b => b.style.borderColor = 'var(--border-glass)');
    e.target.style.borderColor = 'var(--accent)';
  });
  
  document.getElementById('btnEraserMask').addEventListener('click', (e) => {
    state.brushMode = 'erase';
    document.querySelectorAll('#btnBrushMask, #btnEraserMask').forEach(b => b.style.borderColor = 'var(--border-glass)');
    e.target.style.borderColor = 'var(--accent)';
  });

  document.getElementById('btnClearMask').addEventListener('click', () => {
    if (state.maskCtx) {
      state.maskCtx.clearRect(0, 0, state.maskCanvas.width, state.maskCanvas.height);
      redrawGenerationCanvas();
    }
  });

  // Cancel/Exit inpainting mode
  document.getElementById('btnCancelInpaint').addEventListener('click', () => {
    state.isDrawingMask = false;
    document.getElementById('inpaintingToolbar').classList.remove('active');
    redrawGenerationCanvas();
  });

  // Run Gemini Inpainting trigger
  document.getElementById('btnRunInpaint').addEventListener('click', async () => {
    const key = getApiKey();
    const prompt = document.getElementById('inpaintPrompt').value.trim();
    if (!prompt) {
      showToast('수정 지시어 프롬프트를 입력해주세요.', 'error');
      return;
    }
    
    // Check if mask is empty
    if (!hasMaskData()) {
      showToast('수정할 캔버스 영역에 마스크 붓칠을 먼저 해주세요.', 'error');
      return;
    }

    const loader = document.getElementById('generateLoader');
    const loaderText = document.getElementById('generateLoaderText');
    
    loader.classList.add('active');
    loaderText.innerText = '마스크 영역 인페인팅 재생성 중...';
    
    try {
      // 1. Get original image base64
      const originalBase64 = getCanvasBase64(state.baseImage);
      
      // 2. Get mask image base64 (black background, white mask)
      const maskBase64 = getMaskBase64();
      
      // 3. Call inpaint API
      const resultBase64 = await inpaintSprite(key, getModelName(), originalBase64, maskBase64, prompt);
      
      // Show debugging modal window with image and download options
      createDebugWindow(resultBase64, '인페인팅 수정 이미지 원본', prompt);
      
      // 4. Load output using promise helper
      const img = await loadImage(`data:image/png;base64,${resultBase64}`);
      state.baseImage = img;
      
      // Reset mask canvas
      state.maskCtx.clearRect(0, 0, state.maskCanvas.width, state.maskCanvas.height);
      state.isDrawingMask = false;
      document.getElementById('inpaintingToolbar').classList.remove('active');
      
      runImagePipeline();
      loader.classList.remove('active');
      showToast('인페인팅 수정 작업이 반영되었습니다!');
    } catch (err) {
      loader.classList.remove('active');
      showToast(`인페인팅 실패: ${err.message}`, 'error');
    }
  });
}

/**
 * Check if the user has actually drawn any mask (has non-transparent pixels on mask canvas)
 */
function hasMaskData() {
  if (!state.maskCanvas) return false;
  const data = state.maskCtx.getImageData(0, 0, state.maskCanvas.width, state.maskCanvas.height).data;
  for (let i = 3; i < data.length; i += 4) {
    if (data[i] > 10) return true;
  }
  return false;
}

/**
 * Paint mask overlay on generation canvas
 */
function paintMask(e, canvas) {
  const rect = canvas.getBoundingClientRect();
  
  // Calculate relative coordinate based on canvas scaling
  const scaleX = canvas.width / rect.width;
  const scaleY = canvas.height / rect.height;
  
  const x = (e.clientX - rect.left) * scaleX;
  const y = (e.clientY - rect.top) * scaleY;

  const ctx = state.maskCtx;
  ctx.save();
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  
  if (state.brushMode === 'draw') {
    ctx.globalCompositeOperation = 'source-over';
    ctx.strokeStyle = 'rgba(239, 68, 68, 1.0)'; // Red mask solid internally
    ctx.lineWidth = state.brushSize;
  } else {
    ctx.globalCompositeOperation = 'destination-out';
    ctx.lineWidth = state.brushSize + 4;
  }
  
  if (e.type === 'mousedown') {
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x + 0.1, y);
    ctx.stroke();
  } else {
    // Standard drawing stroke: draw from start points
    // Since mousemove fires frequently, draw small lines
    ctx.beginPath();
    // Use last mouse coordinates
    const prevX = x - e.movementX * scaleX;
    const prevY = y - e.movementY * scaleY;
    ctx.moveTo(prevX, prevY);
    ctx.lineTo(x, y);
    ctx.stroke();
  }
  
  ctx.restore();
  redrawGenerationCanvas();
}

/**
 * Get base64 string (no header) from an image element
 */
function getCanvasBase64(img) {
  const tempCanvas = document.createElement('canvas');
  tempCanvas.width = img.width;
  tempCanvas.height = img.height;
  const tempCtx = tempCanvas.getContext('2d');
  tempCtx.drawImage(img, 0, 0);
  return tempCanvas.toDataURL('image/png').split(',')[1];
}

/**
 * Get black/white mask base64 string (no header) from mask canvas
 */
function getMaskBase64() {
  const tempCanvas = document.createElement('canvas');
  tempCanvas.width = state.maskCanvas.width;
  tempCanvas.height = state.maskCanvas.height;
  const tempCtx = tempCanvas.getContext('2d');
  
  // Fill black background
  tempCtx.fillStyle = '#000000';
  tempCtx.fillRect(0, 0, tempCanvas.width, tempCanvas.height);
  
  // Draw mask pixels as pure white
  // Create offscreen temp canvas to change color of drawing
  const tempMaskCanvas = document.createElement('canvas');
  tempMaskCanvas.width = state.maskCanvas.width;
  tempMaskCanvas.height = state.maskCanvas.height;
  const tempMaskCtx = tempMaskCanvas.getContext('2d');
  tempMaskCtx.drawImage(state.maskCanvas, 0, 0);
  
  const imgData = tempMaskCtx.getImageData(0, 0, tempMaskCanvas.width, tempMaskCanvas.height);
  const data = imgData.data;
  
  for (let i = 0; i < data.length; i += 4) {
    if (data[i+3] > 10) { // Painted
      data[i] = 255;
      data[i+1] = 255;
      data[i+2] = 255;
      data[i+3] = 255;
    } else {
      data[i+3] = 0;
    }
  }
  tempMaskCtx.putImageData(imgData, 0, 0);
  
  tempCtx.drawImage(tempMaskCanvas, 0, 0);
  return tempCanvas.toDataURL('image/png').split(',')[1];
}

/**
 * Trigger drawing loop for Inpaint mask drawing mode
 */
function redrawGenerationCanvas() {
  if (!state.baseImage) return;
  const canvas = document.getElementById('generationCanvas');
  const ctx = canvas.getContext('2d');
  
  canvas.width = state.baseImage.width;
  canvas.height = state.baseImage.height;
  
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(state.baseImage, 0, 0);
  
  // Draw translucent mask overlay
  if (state.isDrawingMask && state.maskCanvas) {
    ctx.save();
    ctx.globalAlpha = 0.55;
    ctx.drawImage(state.maskCanvas, 0, 0);
    ctx.restore();
  }
}

/**
 * Run Core Image Processing Pipeline: Chroma Keying + Connected Component Labeling
 * @param {boolean} resetCuration - Reset all rotation, scale, offset overrides to defaults
 */
function runImagePipeline(resetCuration = true) {
  if (!state.baseImage) return;

  const w = state.baseImage.width;
  const h = state.baseImage.height;

  // 1. Draw raw image on a rendering canvas
  const canvas = document.getElementById('generationCanvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  ctx.clearRect(0, 0, w, h);
  ctx.drawImage(state.baseImage, 0, 0);

  // Set up inpainting mask canvas of identical size
  if (!state.maskCanvas || state.maskCanvas.width !== w || state.maskCanvas.height !== h) {
    state.maskCanvas = document.createElement('canvas');
    state.maskCanvas.width = w;
    state.maskCanvas.height = h;
    state.maskCtx = state.maskCanvas.getContext('2d');
  }

  // 2. Perform Chroma Key transparency masking
  const chromaHex = document.getElementById('chromaColor').value;
  const tolerance = parseInt(document.getElementById('toleranceRange').value) || 40;
  const softEdge = parseFloat(document.getElementById('softEdgeRange').value) || 1.5;
  
  if (!state.chromaCanvas) {
    state.chromaCanvas = document.createElement('canvas');
  }
  state.chromaCanvas.width = w;
  state.chromaCanvas.height = h;
  const chromaCtx = state.chromaCanvas.getContext('2d');
  chromaCtx.drawImage(state.baseImage, 0, 0);
  
  const transparentData = applyChromaKey(chromaCtx, w, h, chromaHex, tolerance, softEdge);
  chromaCtx.putImageData(transparentData, 0, 0);

  // 3. Extract bounding boxes using Connected Component Labeling (CCL)
  const noiseVal = parseInt(document.getElementById('cclNoiseRange').value) || 16;
  const boxes = extractBoundingBoxes(transparentData, noiseVal);
  state.rawBoundingBoxes = boxes;

  // 4. Sort and group components into states
  const oldCurationMap = state.stateFramesMap;
  const newCurationMap = groupBoxesIntoStates(boxes, state.states);

  if (!resetCuration && oldCurationMap.size > 0) {
    // Preserve manual offsets if frames match coordinates
    newCurationMap.forEach((frames, stateName) => {
      const oldFrames = oldCurationMap.get(stateName) || [];
      frames.forEach((newF, i) => {
        const oldF = oldFrames[i];
        // If old frame coordinates are close, copy curation transformations
        if (oldF && Math.abs(oldF.sourceX - newF.sourceX) < 15 && Math.abs(oldF.sourceY - newF.sourceY) < 15) {
          newF.nudgeX = oldF.nudgeX;
          newF.nudgeY = oldF.nudgeY;
          newF.scale = oldF.scale;
          newF.rotate = oldF.rotate;
          newF.rejected = oldF.rejected;
        }
      });
    });
  }

  state.stateFramesMap = newCurationMap;

  // Render bounding boxes in green/purple outline on generationCanvas for visual feedback
  ctx.save();
  ctx.lineWidth = 1.5;
  
  let frameCount = 0;
  newCurationMap.forEach((frames, stateName) => {
    frames.forEach(f => {
      ctx.strokeStyle = f.rejected ? '#EF4444' : '#10B981';
      ctx.strokeRect(f.sourceX, f.sourceY, f.sourceW, f.sourceH);
      
      // Draw frame index text on canvas
      ctx.fillStyle = '#10B981';
      ctx.font = '10px monospace';
      ctx.fillText(`${stateName}[${f.index}]`, f.sourceX + 2, f.sourceY + 11);
      frameCount++;
    });
  });
  ctx.restore();

  // Setup click-to-draw mask trigger
  state.isDrawingMask = true;
  document.getElementById('inpaintingToolbar').classList.add('active');

  // Load transparent sheet into SpriteCurator
  state.curator.setSourceCanvas(state.chromaCanvas);
  
  // Re-link curation data
  const currentFrames = state.stateFramesMap.get(state.activeStateName) || [];
  state.curator.setStateFrames(currentFrames, state.curator.selectedFrameIndex);
}

/**
 * Handle curation changes emitted from SpriteCurator back to app forms
 */
function handleCurationDataChanged(frame) {
  if (!frame) return;
  
  // Populate nudge inputs
  document.getElementById('nudgeX').value = frame.nudgeX;
  document.getElementById('nudgeY').value = frame.nudgeY;
  document.getElementById('nudgeScale').value = frame.scale.toFixed(2);
  document.getElementById('nudgeRotate').value = frame.rotate;
  
  // Update frame card highlight state in Left Sidebar
  const card = document.querySelector(`.frame-card[data-idx="${frame.index}"]`);
  if (card) {
    if (frame.rejected) {
      card.classList.add('rejected');
      card.querySelector('input').checked = false;
    } else {
      card.classList.remove('rejected');
      card.querySelector('input').checked = true;
    }
  }
}

/**
 * Redraw Curation Tab layouts, selector chips, and frames grid
 */
function refreshCurationTabUI() {
  if (state.states.length === 0) return;

  // 1. Render State selector chips
  const chipsContainer = document.getElementById('curationStateChips');
  chipsContainer.innerHTML = '';

  state.states.forEach(s => {
    const chip = document.createElement('div');
    const isActive = s.name === state.activeStateName;
    chip.className = `state-chip ${isActive ? 'active' : ''}`;
    
    // Status text Stable/Exp
    const statusClass = s.status === 'stable' ? 'stable' : 'experimental';
    const statusText = s.status === 'stable' ? 'Stable' : 'Exp';
    
    chip.innerHTML = `
      <span>${s.name}</span>
      <span class="state-status-badge ${statusClass}">${statusText}</span>
      <span class="delete-state-chip" style="margin-left: 8px; cursor: pointer; color: var(--color-error); font-weight: bold; font-size: 14px; padding: 0 4px;" title="액션 삭제">&times;</span>
    `;
    chip.addEventListener('click', () => {
      state.activeStateName = s.name;
      refreshCurationTabUI();
    });

    // Bind delete action
    chip.querySelector('.delete-state-chip').addEventListener('click', (e) => {
      e.stopPropagation(); // Prevent selecting the state chip when clicking the delete icon
      if (state.states.length <= 1) {
        showToast('최소 하나의 액션 상태가 필요합니다.', 'error');
        return;
      }
      
      const stateIndex = state.states.findIndex(item => item.name === s.name);
      if (stateIndex !== -1) {
        state.states.splice(stateIndex, 1);
        state.stateFramesMap.delete(s.name);
        
        // Reset active state if we deleted the current one
        if (state.activeStateName === s.name) {
          state.activeStateName = state.states[0].name;
        }
        
        refreshCurationTabUI();
        renderStatesConfigList();
        showToast(`'${s.name}' 액션이 목록에서 삭제되었습니다.`);
      }
    });

    chipsContainer.appendChild(chip);
  });

  // Update curation player parameters
  const activeStateConfig = state.states.find(s => s.name === state.activeStateName);
  if (activeStateConfig) {
    document.getElementById('playerFpsRange').value = activeStateConfig.fps;
    document.getElementById('playerFpsVal').innerText = activeStateConfig.fps;
    state.curator.playerFps = activeStateConfig.fps;
  }

  // 2. Render Frame selector cards grid
  const grid = document.getElementById('curationFramesGrid');
  grid.innerHTML = '';

  const frames = state.stateFramesMap.get(state.activeStateName) || [];
  
  if (frames.length === 0) {
    grid.innerHTML = '<div style="color:var(--text-muted); font-size:12px; grid-column:1/-1; text-align:center; padding: 20px;">이 상태에 추출된 프레임이 없습니다. 이미지 파이프라인을 먼저 돌려주세요.</div>';
    state.curator.setStateFrames([], -1);
    return;
  }

  frames.forEach((f) => {
    const card = document.createElement('div');
    card.className = `frame-card ${f.index === state.curator.selectedFrameIndex ? 'active' : ''} ${f.rejected ? 'rejected' : ''}`;
    card.dataset.idx = f.index;

    // Build crop preview canvas internally
    const cardCanvas = document.createElement('canvas');
    cardCanvas.width = 48;
    cardCanvas.height = 48;
    const cardCtx = cardCanvas.getContext('2d');
    cardCtx.imageSmoothingEnabled = false;
    
    if (state.chromaCanvas) {
      cardCtx.drawImage(
        state.chromaCanvas,
        f.sourceX, f.sourceY, f.sourceW, f.sourceH,
        0, 0, 48, 48
      );
    }

    card.innerHTML = `
      <input type="checkbox" class="frame-card-toggle" ${f.rejected ? '' : 'checked'} data-idx="${f.index}">
      <img src="${cardCanvas.toDataURL()}" class="frame-card-img" alt="f-${f.index}">
      <div class="frame-card-index">Frame ${f.index}</div>
    `;

    // Click triggers selection
    card.addEventListener('click', (e) => {
      // Ignore click on checkbox toggle
      if (e.target.type === 'checkbox') return;
      
      state.curator.setSelectedFrameIndex(f.index);
      refreshCurationTabUI();
    });

    // Checkbox toggle rejects/restores frame
    card.querySelector('.frame-card-toggle').addEventListener('change', (e) => {
      const isChecked = e.target.checked;
      f.rejected = !isChecked;
      
      state.curator.updateSelectedFrameNudge(undefined, undefined, undefined, undefined, f.rejected);
      refreshCurationTabUI();
    });

    grid.appendChild(card);
  });

  // Link to curator
  state.curator.setStateFrames(frames, state.curator.selectedFrameIndex);
  
  // Set nudge inputs initial values
  const currentFrame = state.curator.getSelectedFrame();
  if (currentFrame) {
    handleCurationDataChanged(currentFrame);
  }
}

/**
 * Flatten all curated frames across all states, packs them, and writes manifest JSON
 */
function triggerAtlasPacking() {
  if (state.stateFramesMap.size === 0 || !state.chromaCanvas) {
    showToast('아틀라스를 빌드할 스프라이트 데이터가 없습니다. 먼저 1~2단계를 완료하세요.', 'error');
    return;
  }

  // 1. Flatten all non-rejected frames
  const flatFrames = [];
  state.stateFramesMap.forEach((frames, stateName) => {
    // Find state config to fetch target fps and loop parameters
    const config = state.states.find(s => s.name === stateName) || { fps: 6, loop: true };
    
    frames.forEach(f => {
      if (!f.rejected) {
        flatFrames.push({
          ...f,
          characterId: state.characterId,
          stateName: stateName,
          fps: config.fps,
          loop: config.loop
        });
      }
    });
  });

  if (flatFrames.length === 0) {
    showToast('활성화된 스프라이트 프레임이 없습니다. 프레임이 Reject되었는지 확인하세요.', 'error');
    return;
  }

  // 2. Fetch packing settings from sidebar
  const maxSize = parseInt(document.getElementById('maxAtlasSize').value) || 1024;
  const padding = parseInt(document.getElementById('atlasPadding').value) || 4;
  const forcePOT = document.getElementById('potCheck').checked;

  // 3. Run packing algorithms
  const result = packSpriteSheet(flatFrames, maxSize, padding, forcePOT);
  state.bakedResult = result;

  // 4. Render output canvas
  const atlasCanvas = document.getElementById('atlasCanvas');
  bakeAtlasCanvas(atlasCanvas, state.chromaCanvas, result.packedFrames, result.width, result.height);

  // 5. Update text indicators
  document.getElementById('sheetDimensionLabel').innerText = `최종 아틀라스 시트 크기: ${result.width} x ${result.height}px`;
  document.getElementById('manifestOutput').value = JSON.stringify(result.manifest, null, 2);

  // 6. Enable download button
  document.getElementById('downloadZipBtn').disabled = false;
  showToast('아틀라스 텍스처와 매니페스트가 성공적으로 구워졌습니다.');
}
