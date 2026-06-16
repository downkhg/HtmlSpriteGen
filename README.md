# Antigravity-Sprite-Web (단독 클라이언트 기반 Web-Sprite-Gen)

Antigravity-Sprite-Web은 파이썬(Python) 기반의 오픈소스 스프라이트 파이프라인 도구인 [sprite-gen](https://github.com/aldegad/sprite-gen)의 핵심 아이디어를 계승 및 발전시켜, 백엔드 서버나 로컬 파이썬 가상환경 설정 없이 오직 웹 브라우저 상에서 단독으로 실행되는 HTML5/JavaScript 기반의 Single Page Application (SPA) 스프라이트 생성 및 큐레이션 파이프라인 도구입니다.

---

## 🌟 주요 특징 (Core Features)

1. **Zero-Install (무설치 개발 환경)**
   - 별도의 라이브러리 설치(`npm`, `pip`), 터미널 실행, 가상환경 세팅 등이 전혀 필요 없습니다. `index.html` 파일을 더블클릭하여 브라우저에서 실행하거나 정적 웹 호스팅 서비스(GitHub Pages 등)에 업로드하는 것만으로 전체 파이프라인을 활용할 수 있습니다.

2. **Gemini AI Studio 통합 및 설정 보존**
   - 사용자가 직접 입력한 Gemini API 키 및 설정 정보(모델명, API 버전, 추론 레벨)를 로컬 브라우저의 `localStorage` 또는 `Data/gemini.js` 파일에 저장하여 세션 간 보존할 수 있습니다.
   - 일부 프레임의 생성 오류는 드래그 마스킹 및 Inpainting 프롬프트를 활용하여 Gemini API를 통해 즉시 정밀하게 부분 재생성(수정)할 수 있습니다.
   
   > [!WARNING]
   > **⚠️ 웹 서비스 배포 시 보안 주의사항 (Security Notice)**
   > - `Data/gemini.js` 파일에 API 키를 직접 작성하여 보관하는 방식은 로컬 개발 및 개인 사용 환경을 위해 설계되었습니다.
   > - 만약 본 프로젝트를 GitHub Pages, Vercel 등 외부 웹 호스팅 서비스를 통해 public 웹 서비스로 배포할 경우, **`Data/gemini.js` 파일에 적힌 API 키가 방문자에게 그대로 노출되어 탈취될 위험이 있습니다.**
   > - 웹 서비스(호스팅) 환경에서 이용 시, `Data/gemini.js` 내의 `apiKey` 필드는 반드시 공란(`''`)으로 유지하고 사용자 각자가 브라우저 다이어로그를 통해 로컬 `localStorage`에만 API 키를 입력하여 사용하도록 안내하십시오. 외부 호스팅 배포 시의 **API 키 보안 문제에 대해서는 본 프로그램이 보장할 수 없음을 명시합니다.**

3. **순수 JS 기반 크로마키 및 자동 프레임 분할 (Connected Component Labeling)**
   - Canvas API를 통한 실시간 픽셀 제어로 크로마키 배경색(녹색 등)을 부드럽게 지우고 외곽 크로마 fringe를 없애는 픽셀 프로세서가 내장되어 있습니다.
   - OpenCV 의존성 없이 불투명 픽셀들이 뭉쳐진 영역을 자동으로 탐색하여 정밀한 바운딩 박스를 찾아내는 BFS(너비 우선 탐색) 기반 **Connected Component Labeling (CCL) 알고리즘**을 자체 구현하였습니다.

4. **비파괴 큐레이터 인터페이스 (Curation Webview)**
   - AI가 생성한 각 프레임에 대해 오프셋(X/Y), 회전, 스케일을 실시간으로 미세조정(Nudge)할 수 있는 기즈모(Gizmo) 드래그 및 입력을 제공합니다.
   - 원하지 않는 프레임은 비활성화(Reject)할 수 있습니다.
   - 상태별 개별 FPS 재생 설정과 루프 토글, 그리고 초록 테두리를 완벽하게 잡아내기 위한 다중 배경 토글(투명 체크보드, 흰색, 검은색) 기능이 내장되어 있습니다.

5. **2D Bin Packing 아틀라스 병합 & 엔진 친화적 출력**
   - 큐레이션이 완료된 프레임들을 Shelf / MaxRects 알고리즘을 사용해 빈 공간 없이 촘촘하게 메인 아틀라스(`sprite-sheet-alpha.png`)로 병합합니다.
   - 유니티 등 게임 엔진에 즉시 적용 가능한 좌표 및 피벗 데이터가 포함된 절대 좌표 기반 매니페스트(`manifest.json`)를 작성합니다.
   - `JSZip`을 연동하여 아틀라스 이미지와 매니페스트 JSON 파일을 하나의 `.zip` 파일로 묶어 즉시 다운로드할 수 있습니다.

---

## 🛠️ 기술 스택 (Tech Stack)

- **UI / Logic**: HTML5, CSS3 (Vanilla Custom Styles, Dark Glassmorphism), Vanilla JS (ES Modules)
- **Graphic Engine**: HTML5 Canvas API (getImageData, putImageData)
- **AI Integration**: Google Gemini AI Studio API (Fetch API)
- **External Library**: [JSZip](https://cdnjs.cloudflare.com/ajax/libs/jszip/3.10.1/jszip.min.js) (CDN 로드, 파일 압축 내보내기용)

---

## 🙏 Acknowledgement (감사의 말)

이 프로젝트는 파이썬 환경의 커맨드 라인 기반 스프라이트 시트 제어 툴로서 뛰어난 워크플로우 아이디어를 보여준 오픈소스 프로젝트 **[sprite-gen (by aldegad)](https://github.com/aldegad/sprite-gen)**에서 영감을 받아 제작되었습니다. 

"한 장의 이미지로 게임에 즉시 쓸 수 있는 아틀라스와 매니페스트를 구출한다"는 훌륭한 파이프라인 개념 및 큐레이션 필요성에 대한 철학적 설계 방향은 본 웹 클라이언트 독립형 SPA로의 전환 및 확장 작업을 수행하는 데 결정적인 기초가 되었습니다. 멋진 아이디어를 오픈소스로 공유해 주신 **aldegad (darkest_alex)** 개발자님께 깊은 감사를 표합니다.