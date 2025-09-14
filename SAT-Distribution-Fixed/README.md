# SAT - Semiconductor Analysis Tool

웨이퍼 패치 분석 및 보이드 검출 도구

## 🚀 빠른 시작

### Windows에서 실행

1. **SAT-App.bat** 파일을 더블클릭하여 실행
2. 자동으로 브라우저가 열리고 애플리케이션이 시작됩니다
3. 사용이 끝나면 콘솔 창에서 `Ctrl+C`를 눌러 종료

### 수동 실행 (Python)

```bash
python launch_app.py
```

## 📋 시스템 요구사항

- **Python 3.7 이상**
- **웹 브라우저** (Chrome, Firefox, Edge 등)
- **메모리**: 최소 4GB RAM (대용량 TIFF 파일 처리 시 8GB 이상 권장)

## 🏗️ 프로젝트 구조

### 📁 파일 구조
```
SAT/
├── SAT-App.bat              # Windows 실행 파일
├── launch_app.py            # Python 런처
├── range_server_custom.py   # Range 요청 지원 서버
├── index_v2.html           # 메인 웹 인터페이스
├── js/
│   ├── voidManager_v2.js   # 보이드 관리 모듈
│   ├── constants.js        # 상수 정의
│   └── utils.js           # 유틸리티 함수
├── test/                   # 테스트 파일들
├── generate_realistic_wafer_fast.py  # 샘플 이미지 생성
├── realistic_wafer_sample_fast.tif   # 테스트용 TIFF (12.7MB)
└── sample_chip_coordinates.csv       # 테스트용 칩 좌표
```

## 🔧 기능

### 1. TIFF 파일 로드
- 대용량 멀티페이지 TIFF 파일 지원
- Range 요청을 통한 효율적인 메모리 사용
- 실시간 로딩 진행률 표시

### 2. 패치 추출
- CSV 좌표 기반 자동 패치 추출
- 사용자 정의 패치 크기 및 향상 설정
- 배치 처리 지원

### 3. 보이드 검출 및 분석
- **void**: 일반적인 보이드 (빨간색 타원)
- **crack**: 크랙 (초록색 타원)  
- **particle**: 파티클 (파란색 타원)
- **bbox**: 경계 상자 (주황색 사각형)

### 4. 데이터 내보내기
- ZIP 형태로 패치 및 메타데이터 내보내기
- split/[type]/layer_XX/ 구조로 체계적 저장
- merge 마스크 자동 생성 (split/[type]/merge/)
- JSON 형태의 보이드 데이터 내보내기

## 🎯 주요 기능

### 📊 이미지 처리
- **멀티페이지 TIFF 로드**: 여러 레이어 이미지 지원
- **실시간 그리드 표시**: 드래그 가능한 격자 오버레이
- **이미지 향상**: 대비/밝기 조정, 타겟 정규화

### 🎯 칩 좌표 관리
- **CSV 파일 로드**: x,y,type 형식 지원
- **엑셀 복붙**: 직접 데이터 붙여넣기
- **Bonding Map**: 탭 구분 매트릭스 형식 지원
- **음수 좌표 지원**: 패딩된 좌표 형식 (XN05_Y07)

### 🔍 보이드 마킹 시스템
- **타입별 마킹**: void, crack, particle
- **레이어 간 동기화**: 한 레이어 마킹 → 모든 레이어 표시
- **실시간 동기화**: 이동/크기 조절 시 즉시 반영
- **점선 표시**: 다른 레이어 보이드를 반투명 점선으로 표시

### ⚙️ 고급 기능
- **패치 추출**: 칩별 이미지 추출 및 ZIP 다운로드
- **보이드 머지**: 모든 레이어 보이드 통합
- **JSON 내보내기**: 보이드 데이터 저장
- **키보드 단축키**: 1,2,3 키로 보이드 타입 변경

## 🔧 개발 정보

### 🏛️ 아키텍처 (리팩토링 버전)

#### 클래스 구조
- **`WaferApp`**: 메인 애플리케이션 클래스
- **`VoidManager`**: 보이드 관리 및 동기화
- **`ImageProcessor`**: 이미지 로드 및 처리 (static methods)

#### 모듈 구조
- **`constants.js`**: 색상, 키맵, 설정값
- **`utils.js`**: 파싱, 좌표 변환 함수
- **`voidManager.js`**: 보이드 CRUD 및 동기화
- **`imageProcessor.js`**: TIFF 로드, 스케일링, 향상

### 🎨 UI 구성
- **왼쪽 패널**: 데이터 로드, 그리드 설정, 이미지 향상
- **중앙 캔버스**: 웨이퍼 이미지 및 그리드 표시
- **오른쪽 패널**: 패치 뷰어, 보이드 마킹 컨트롤

### 📝 주요 개선사항 (리팩토링)
1. **모듈화**: 1350줄 → 4개 모듈로 분리
2. **클래스 기반**: 전역 변수 → 캡슐화
3. **타입 안전성**: 일관된 데이터 구조
4. **성능 최적화**: throttling, 메모리 관리
5. **유지보수성**: 명확한 책임 분리

## 🧪 테스트 데이터

### 샘플 파일
- **`realistic_wafer_sample_fast.tif`**: 4000x4000px, 8페이지
- **`sample_chip_coordinates.csv`**: 225개 칩 좌표 (-9~9 범위)

### 테스트 시나리오
1. TIFF 로드 → CSV 로드 → Extract Patches
2. 보이드 마킹 → 레이어 간 동기화 확인
3. 보이드 이동/크기조절 → 실시간 동기화 확인
4. Merge All → 모든 레이어 통합 확인

## 🚨 알려진 이슈

### 원본 버전 (`index.html`)
- ✅ 모든 기능 작동
- ❌ 코드 복잡도 높음 (1350줄)
- ❌ 유지보수 어려움

### 리팩토링 버전 (`index_refactored.html`)
- ✅ 깔끔한 구조
- ✅ 모듈화된 코드
- ⚠️ 일부 기능 테스트 필요

## 📈 향후 개발 계획

1. **자동 결함 검출**: AI 기반 보이드 자동 인식
2. **통계 분석**: 칩별/레이어별 결함률 리포트
3. **데이터베이스 연동**: 분석 결과 영구 저장
4. **협업 기능**: 다중 사용자 동시 분석
5. **API 연동**: 제조 시스템과 연계

## 🔗 기술 스택

- **Frontend**: Vanilla JavaScript (ES6 Modules)
- **Image Processing**: UTIF.js (TIFF 처리)
- **File Handling**: JSZip.js, FileSaver.js
- **Canvas API**: 이미지 렌더링 및 상호작용
- **CSS Grid/Flexbox**: 반응형 레이아웃