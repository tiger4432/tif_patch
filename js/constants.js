// 상수 정의
export const VOID_COLORS = {
  void: "orange",
  edge: "lime",
  void39: "#f7e600",
  dela: "blue",
  signal: "red",
  particle: "#660099",
  bbox: "white",
};

// VOID_COLORS에서 자동으로 단축키 맵 생성 (default 제외)
const generateVoidKeyMap = () => {
  const keyMap = {};
  const voidTypes = Object.keys(VOID_COLORS).filter((key) => key !== "default");

  voidTypes.forEach((type, index) => {
    const keyNumber = (index + 1).toString();
    keyMap[keyNumber] = type;
    keyMap[`Numpad${keyNumber}`] = type;
  });

  return keyMap;
};

export const VOID_KEY_MAP = generateVoidKeyMap();

// Bin 분류 규칙
export const BIN_RULES = {
  // void type -> bin 정보 (번호가 클수록 우선순위 높음)
  void39: { bin: 10, color: "#ff0000", name: "BIN10" }, // 빨간색
  signal: { bin: 10, color: "#ff0000", name: "BIN10" }, // 빨간색
  particle: { bin: 6, color: "#800080", name: "BIN6" }, // 보라색
  void: { bin: 4, color: "#ffa500", name: "BIN4" }, // 오렌지색
  edge: { bin: 3, color: "#00ff00", name: "BIN3" }, // 초록색
  dela: { bin: 2, color: "#0000ff", name: "BIN2" }, // 파란색
  // 아무것도 없으면 bin1 (하늘색) - 기본값
  default: { bin: 1, color: "#87ceeb", name: "BIN1" }, // 하늘색
};

export const CONFIG = {
  MAX_DISPLAY_SIZE: 1024,
  SYNC_THROTTLE_MS: 100,
  DISTANCE_THRESHOLD: 30,
  TOLERANCE: 4,
  // 압축 설정
  COMPRESSION: {
    SMALL_FILE_MAX: 2048, // 작은 파일용 최대 크기
    MEDIUM_FILE_MAX: 4096, // 중간 파일용 최대 크기
    LARGE_FILE_MAX: 6144, // 큰 파일용 최대 크기
    VIRTUAL_WAFER_SIZE: 8192, // 가상 웨이퍼 크기
  },
};
