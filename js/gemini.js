/* js/gemini.js */
import { geminiConfig } from '../Data/gemini.js';

// Keys for localStorage overrides
const KEYS = {
  API_KEY: 'antigravity_gemini_api_key',
  MODEL_NAME: 'antigravity_gemini_model_name',
  THINKING_LEVEL: 'antigravity_gemini_thinking_level',
  API_VERSION: 'antigravity_gemini_api_version'
};

/**
 * Retrieve configurations: checks localStorage first, then falls back to Data/gemini.js static config
 */
export function getApiKey() {
  return localStorage.getItem(KEYS.API_KEY) || geminiConfig.apiKey || '';
}

export function getModelName() {
  return localStorage.getItem(KEYS.MODEL_NAME) || geminiConfig.modelName || 'gemini-3.5-flash';
}

export function getThinkingLevel() {
  return localStorage.getItem(KEYS.THINKING_LEVEL) || geminiConfig.thinkingLevel || 'medium';
}

export function getApiVersion() {
  return localStorage.getItem(KEYS.API_VERSION) || geminiConfig.apiVersion || 'v1beta';
}

/**
 * Save configurations to localStorage
 */
export function saveConfigToLocal(apiKey, modelName, thinkingLevel, apiVersion) {
  localStorage.setItem(KEYS.API_KEY, (apiKey || '').trim());
  localStorage.setItem(KEYS.MODEL_NAME, (modelName || 'gemini-3.5-flash').trim());
  localStorage.setItem(KEYS.THINKING_LEVEL, thinkingLevel || 'medium');
  localStorage.setItem(KEYS.API_VERSION, (apiVersion || 'v1beta').trim());
}

/**
 * Clear localStorage overrides and fall back to Data/gemini.js
 */
export function clearLocalOverrides() {
  Object.values(KEYS).forEach(k => localStorage.removeItem(k));
}

/**
 * Generates the source code of Data/gemini.js with the current values for downloading
 */
export function generateConfigFileContent(apiKey, modelName, thinkingLevel, apiVersion) {
  return `/* Data/gemini.js */

// Google Gemini API 구성 기본값 설정
// 웹서비스로 배포(호스팅) 시 이 파일에 입력된 API 키는 외부로 노출되므로 보안에 주의하십시오.
export const geminiConfig = {
  apiKey: '${apiKey.replace(/'/g, "\\'")}',
  modelName: '${modelName.replace(/'/g, "\\'")}',
  thinkingLevel: '${thinkingLevel.replace(/'/g, "\\'")}',
  apiVersion: '${apiVersion.replace(/'/g, "\\'")}'
};
`;
}

/**
 * Test if the API key is valid by calling a lightweight models list or simple check
 */
export async function testApiKey(apiKey, apiVersion = 'v1beta') {
  if (!apiKey) return false;
  
  const url = `https://generativelanguage.googleapis.com/${apiVersion}/models?key=${apiKey}`;
  try {
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`API Key validation failed: ${response.statusText}`);
    }
    const data = await response.json();
    return data && data.models && data.models.length > 0;
  } catch (error) {
    console.error('API Key test error:', error);
    throw error;
  }
}

/**
 * Call Gemini API to generate an image based on a prompt
 */
export async function generateSpriteSheet(apiKey, model, prompt) {
  if (!apiKey) {
    throw new Error('Gemini API Key가 설정되지 않았습니다.');
  }

  const modelName = model || getModelName();
  const apiVersion = getApiVersion();
  const thinkingLevel = getThinkingLevel();
  
  const url = `https://generativelanguage.googleapis.com/${apiVersion}/models/${modelName}:generateContent?key=${apiKey}`;

  const requestBody = {
    contents: [
      {
        parts: [
          {
            text: prompt
          }
        ]
      }
    ],
    generationConfig: {
      responseModalities: ["IMAGE"],
      thinking_config: {
        thinking_level: thinkingLevel
      }
    }
  };

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(requestBody)
    });

    if (!response.ok) {
      const errorText = await response.text();
      let errorJson;
      try {
        errorJson = JSON.parse(errorText);
      } catch (e) {}
      const msg = errorJson?.error?.message || response.statusText || '알 수 없는 오류';
      throw new Error(`이미지 생성 실패 (${response.status}): ${msg}`);
    }

    const result = await response.json();
    
    // Extract base64 image data from the response candidates
    const candidate = result.candidates?.[0];
    const part = candidate?.content?.parts?.find(p => p.inlineData);
    
    if (!part || !part.inlineData || !part.inlineData.data) {
      // Fallback check
      const textPart = candidate?.content?.parts?.find(p => p.text);
      if (textPart) {
        throw new Error(`모델이 이미지를 생성하는 대신 텍스트로 응답했습니다: "${textPart.text}"`);
      }
      throw new Error('응답 데이터에 생성된 이미지 정보가 포함되어 있지 않습니다.');
    }

    return part.inlineData.data; // Raw base64 string
  } catch (error) {
    console.error('Gemini Generate Content error:', error);
    throw error;
  }
}

/**
 * Call Gemini API to perform inpainting (Image-to-Image with Mask)
 */
export async function inpaintSprite(apiKey, model, baseImageBase64, maskImageBase64, prompt) {
  if (!apiKey) {
    throw new Error('Gemini API Key가 설정되지 않았습니다.');
  }

  const modelName = model || getModelName();
  const apiVersion = getApiVersion();
  const thinkingLevel = getThinkingLevel();
  
  const url = `https://generativelanguage.googleapis.com/${apiVersion}/models/${modelName}:generateContent?key=${apiKey}`;

  const requestBody = {
    contents: [
      {
        parts: [
          {
            inlineData: {
              mimeType: "image/png",
              data: baseImageBase64
            }
          },
          {
            inlineData: {
              mimeType: "image/png",
              data: maskImageBase64
            }
          },
          {
            text: `Regenerate the masked area (indicated in white in the mask image) based on this prompt: "${prompt}". Keep all other parts of the image exactly the same.`
          }
        ]
      }
    ],
    generationConfig: {
      responseModalities: ["IMAGE"],
      thinking_config: {
        thinking_level: thinkingLevel
      }
    }
  };

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(requestBody)
    });

    if (!response.ok) {
      const errorText = await response.text();
      let errorJson;
      try {
        errorJson = JSON.parse(errorText);
      } catch (e) {}
      const msg = errorJson?.error?.message || response.statusText || '알 수 없는 오류';
      throw new Error(`인페인팅 실패 (${response.status}): ${msg}`);
    }

    const result = await response.json();
    const candidate = result.candidates?.[0];
    const part = candidate?.content?.parts?.find(p => p.inlineData);

    if (!part || !part.inlineData || !part.inlineData.data) {
      const textPart = candidate?.content?.parts?.find(p => p.text);
      if (textPart) {
        throw new Error(`모델이 인페인팅 이미지를 생성하는 대신 텍스트로 응답했습니다: "${textPart.text}"`);
      }
      throw new Error('인페인팅 이미지 데이터를 가져오는 데 실패했습니다.');
    }

    return part.inlineData.data;
  } catch (error) {
    console.error('Gemini Inpaint Content error:', error);
    throw error;
  }
}
