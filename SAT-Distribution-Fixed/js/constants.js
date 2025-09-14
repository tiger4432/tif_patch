// 상수 정의
export const VOID_COLORS = {
  void: "cyan",
  crack: "magenta", 
  particle: "lime",
  bbox: "orange",
  default: "yellow"
};

export const VOID_KEY_MAP = {
  "1": "void",
  "2": "crack", 
  "3": "particle",
  "Numpad1": "void",
  "Numpad2": "crack", 
  "Numpad3": "particle"
};

export const CONFIG = {
  MAX_DISPLAY_SIZE: 1024,
  SYNC_THROTTLE_MS: 100,
  DISTANCE_THRESHOLD: 30,
  TOLERANCE: 8,
  // 압축 설정
  COMPRESSION: {
    SMALL_FILE_MAX: 2048,    // 작은 파일용 최대 크기
    MEDIUM_FILE_MAX: 4096,   // 중간 파일용 최대 크기  
    LARGE_FILE_MAX: 6144,    // 큰 파일용 최대 크기
    VIRTUAL_WAFER_SIZE: 8192 // 가상 웨이퍼 크기
  }
};