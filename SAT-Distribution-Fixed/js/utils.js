// 유틸리티 함수들

/**
 * 좌표를 패딩하여 문자열로 변환 (음수 지원)
 */
export function padCoord(coord) {
  if (coord < 0) {
    return `N${String(Math.abs(coord)).padStart(2, "0")}`;
  }
  return `${String(coord).padStart(2, "0")}`;
}

/**
 * 패치 라벨에서 칩 좌표와 레이어 추출
 */
export function parsePatchLabel(patchLabel) {
  // 예: "XN05_Y07_L03_LEG:good" -> chipCoord: "(-5,7)", layer: 3
  const match = patchLabel.match(/X(N?)(\d+)_Y(N?)(\d+)_L(\d+)/);
  if (match) {
    const xNegative = match[1] === 'N';
    const xValue = parseInt(match[2], 10);
    const yNegative = match[3] === 'N';
    const yValue = parseInt(match[4], 10);
    const layer = parseInt(match[5], 10);
    
    const actualX = xNegative ? -xValue : xValue;
    const actualY = yNegative ? -yValue : yValue;
    
    return { 
      chipCoord: `(${actualX},${actualY})`, 
      layer: layer 
    };
  }
  return { chipCoord: "unknown", layer: 1 };
}

/**
 * 패치 라벨 생성
 */
export function generatePatchLabel(chipCoord, layer) {
  const match = chipCoord.match(/\((-?\d+),(-?\d+)\)/);
  if (match) {
    const x = parseInt(match[1], 10);
    const y = parseInt(match[2], 10);
    
    return `X${padCoord(x)}_Y${padCoord(y)}_L${String(layer).padStart(2, '0')}_LEG:merged`;
  }
  return `merged_${chipCoord}_L${layer}`;
}

/**
 * CSV/Bonding Map 파싱
 */
export function parseBondingMap(text) {
  console.log("Parsing bonding map, text length:", text.length);
  
  const lines = text.trimEnd().split(/\r?\n/);
  console.log("Lines found:", lines.length);
  
  if (lines.length < 2) {
    console.log("Not enough lines for bonding map");
    return [];
  }

  // 첫 행: X 헤더 (빈 문자열도 유지)
  const xHeaders = lines[0]
    .split("\t")
    .slice(1)
    .map((h) => h.trim())
    .map((h) => parseInt(h, 10));
  console.log("X headers:", xHeaders);

  const out = [];
  for (let r = 1; r < lines.length; r++) {
    // 행 전체를 탭 기준으로 그대로 split → 끝의 빈 칸도 유지
    const cells = lines[r].split("\t");
    if (cells.length < 2) continue;

    const y = parseInt((cells[0] || "").trim(), 10);
    if (isNaN(y)) continue;

    // xHeaders 길이에 맞게 순회
    for (let c = 1; c <= xHeaders.length; c++) {
      const val = (cells[c] || "").trim();
      if (!val) continue;
      const x = xHeaders[c - 1];
      if (!isNaN(x)) out.push({ x, y, type: val });
    }
  }
  console.log("Parsed bonding map result:", out);
  console.log("Total coordinates found:", out.length);
  return out;
}

/**
 * CSV (x,y,type) 파싱
 */
export function parseCSV(text) {
  const lines = text.trim().split(/\r?\n/);
  const header = lines[0].split(/[\t,]+/).map(h => h.toLowerCase());
  const xi = header.indexOf("x"), yi = header.indexOf("y"), ti = header.indexOf("type");
  if (xi === -1 || yi === -1) {
    alert("x,y 헤더가 필요합니다.");
    return [];
  }
  const out = [];
  lines.slice(1).forEach((l) => {
    if (!l.trim()) return;
    const c = l.split(/[\t,]+/);
    const x = parseFloat(c[xi]);
    const y = parseFloat(c[yi]);
    if (isNaN(x) || isNaN(y)) return;
    out.push({ x, y, type: ti >= 0 && c[ti] ? c[ti] : "" });
  });
  return out;
}

/**
 * 중복 보이드 제거
 */
export function removeDuplicateVoids(voids, tolerance = 10) {
  const unique = [];
  
  voids.forEach(v => {
    const isDuplicate = unique.some(u => 
      Math.abs(u.centerX - v.centerX) < tolerance &&
      Math.abs(u.centerY - v.centerY) < tolerance &&
      u.type === v.type
    );
    
    if (!isDuplicate) {
      unique.push(v);
    }
  });
  
  return unique;
}