// 새로운 보이드 관리 클래스 (키 기반)
import { VOID_COLORS, CONFIG } from "./constants.js";
import { parsePatchLabel } from "./utils.js";

export class VoidManagerV2 {
  constructor() {
    // 보이드 데이터 구조: Map<voidKey, voidData>
    // voidKey: "x,y,layer,voidIndex" (예: "-2,-8,1,0")
    // voidData: { x, y, layer, voidIndex, type, centerX, centerY, radiusX, radiusY, createdAt }
    this.voids = new Map();

    // 각 (x,y,layer)별 보이드 인덱스 카운터
    // locationKey: "x,y,layer" -> nextIndex
    this.voidIndexCounters = new Map();

    this.syncMode = true;

    // bbox 관련 설정
    this.showBbox = false;
    this.autoBboxDetection = false;
    this.bboxes = new Map(); // chipKey -> bbox data
  }

  /**
   * 보이드 키 생성
   */
  createVoidKey(x, y, layer, voidIndex) {
    return `${x},${y},${layer},${voidIndex}`;
  }

  /**
   * 위치 키 생성 (x,y,layer)
   */
  createLocationKey(x, y, layer) {
    return `${x},${y},${layer}`;
  }

  /**
   * 칩 키 생성 (x,y)
   */
  createChipKey(x, y) {
    return `${x},${y}`;
  }

  /**
   * 다음 보이드 인덱스 가져오기
   */
  getNextVoidIndex(x, y, layer) {
    const locationKey = this.createLocationKey(x, y, layer);
    const currentIndex = this.voidIndexCounters.get(locationKey) || 0;
    this.voidIndexCounters.set(locationKey, currentIndex + 1);
    return currentIndex;
  }

  /**
   * 새로운 보이드 생성 (해당 레이어에서만)
   */
  createVoid(patchLabel, type, centerX, centerY, radiusX, radiusY) {
    const { chipCoord, layer } = parsePatchLabel(patchLabel);
    const match = chipCoord.match(/\((-?\d+),(-?\d+)\)/);
    if (!match) {
      console.error("Invalid chip coordinate format:", chipCoord);
      return null;
    }

    const x = parseInt(match[1], 10);
    const y = parseInt(match[2], 10);
    const voidIndex = this.getNextVoidIndex(x, y, layer);

    const voidKey = this.createVoidKey(x, y, layer, voidIndex);
    const voidData = {
      x,
      y,
      layer,
      voidIndex,
      type,
      centerX,
      centerY,
      radiusX,
      radiusY,
      createdAt: Date.now(),
      patchLabel, // 참조용
    };

    this.voids.set(voidKey, voidData);
    console.log(`Created void: ${voidKey}`, voidData);

    return voidData;
  }

  /**
   * 보이드 삭제 (해당 레이어에서만)
   */
  deleteVoid(x, y, layer, centerX, centerY) {
    console.log(
      `DeleteVoid called: x=${x}, y=${y}, layer=${layer}, click=(${centerX},${centerY})`
    );
    console.log(`Total voids: ${this.voids.size}`);

    const voidsToDelete = [];

    // 해당 위치(x,y,layer)의 모든 보이드 검사
    for (const [voidKey, voidData] of this.voids.entries()) {
      console.log(`Checking void: ${voidKey}`, voidData);

      if (voidData.x === x && voidData.y === y && voidData.layer === layer) {
        console.log(`Found matching void at same location: ${voidKey}`);

        // 클릭한 위치가 보이드 내부인지 확인
        const dx = (centerX - voidData.centerX) / voidData.radiusX;
        const dy = (centerY - voidData.centerY) / voidData.radiusY;
        const inside = dx * dx + dy * dy <= 1;

        console.log(`Distance check: dx=${dx}, dy=${dy}, inside=${inside}`);

        if (inside) {
          voidsToDelete.push(voidKey);
          console.log(`Marked for deletion: ${voidKey}`);
        }
      }
    }

    // 삭제 실행
    voidsToDelete.forEach((voidKey) => {
      console.log(`Deleting void: ${voidKey}`);
      this.voids.delete(voidKey);
    });

    console.log(`Deleted ${voidsToDelete.length} voids`);
    return voidsToDelete.length > 0;
  }

  /**
   * 보이드 수정 (해당 레이어에서만)
   */
  updateVoid(
    x,
    y,
    layer,
    oldCenterX,
    oldCenterY,
    newCenterX,
    newCenterY,
    newRadiusX,
    newRadiusY
  ) {
    for (const [voidKey, voidData] of this.voids.entries()) {
      if (voidData.x === x && voidData.y === y && voidData.layer === layer) {
        // 기존 위치와 일치하는 보이드 찾기
        const dx = (oldCenterX - voidData.centerX) / voidData.radiusX;
        const dy = (oldCenterY - voidData.centerY) / voidData.radiusY;
        const inside = dx * dx + dy * dy <= 1;

        if (inside) {
          voidData.centerX = newCenterX;
          voidData.centerY = newCenterY;
          voidData.radiusX = newRadiusX;
          voidData.radiusY = newRadiusY;
          console.log(`Updated void: ${voidKey}`, voidData);
          return voidData;
        }
      }
    }
    return null;
  }

  /**
   * 특정 패치(x,y,layer)의 보이드들 가져오기 (실선용)
   */
  getSolidVoids(x, y, layer) {
    const result = [];
    for (const [voidKey, voidData] of this.voids.entries()) {
      if (voidData.x === x && voidData.y === y && voidData.layer === layer) {
        result.push(voidData);
      }
    }
    return result;
  }

  /**
   * 같은 칩(x,y)의 다른 레이어 보이드들 가져오기 (점선용)
   */
  getDottedVoids(x, y, currentLayer) {
    if (!this.syncMode) return [];

    const result = [];
    for (const [voidKey, voidData] of this.voids.entries()) {
      if (
        voidData.x === x &&
        voidData.y === y &&
        voidData.layer !== currentLayer
      ) {
        result.push(voidData);
      }
    }
    return result;
  }

  /**
   * 특정 좌표와 클릭 위치로 편집 가능한 보이드 찾기
   */
  findEditableVoid(x, y, layer, clickX, clickY) {
    for (const [voidKey, voidData] of this.voids.entries()) {
      if (voidData.x === x && voidData.y === y && voidData.layer === layer) {
        // 클릭한 위치가 보이드 경계 근처인지 확인
        const dx = clickX - voidData.centerX;
        const dy = clickY - voidData.centerY;
        const angle = Math.atan2(dy, dx);
        const rB =
          (voidData.radiusX * voidData.radiusY) /
          Math.sqrt(
            (voidData.radiusY * Math.cos(angle)) ** 2 +
              (voidData.radiusX * Math.sin(angle)) ** 2
          );
        const dist = Math.hypot(dx, dy);

        // 보이드 내부 또는 경계 근처
        if (dist <= rB + CONFIG.TOLERANCE) {
          return voidData;
        }
      }
    }
    return null;
  }

  /**
   * 보이드 그리기
   */
  drawVoids(ctx, patchLabel) {
    const { chipCoord, layer } = parsePatchLabel(patchLabel);
    const match = chipCoord.match(/\((-?\d+),(-?\d+)\)/);
    if (!match) return;

    const x = parseInt(match[1], 10);
    const y = parseInt(match[2], 10);

    ctx.lineWidth = 2;

    // 1. 현재 레이어의 보이드들 (실선)
    const solidVoids = this.getSolidVoids(x, y, layer);
    solidVoids.forEach((voidData) => {
      ctx.beginPath();
      ctx.strokeStyle = VOID_COLORS[voidData.type] || VOID_COLORS.default;
      ctx.setLineDash([]);
      ctx.globalAlpha = 1.0;

      if (voidData.type === "bbox") {
        // bbox 타입이면 사각형 그리기 (centerX, centerY는 좌상단 좌표, radiusX, radiusY는 너비, 높이)
        ctx.strokeRect(
          voidData.centerX,
          voidData.centerY,
          voidData.radiusX,
          voidData.radiusY
        );
      } else {
        // 일반 void 타입이면 타원 그리기
        ctx.ellipse(
          voidData.centerX,
          voidData.centerY,
          voidData.radiusX,
          voidData.radiusY,
          0,
          0,
          2 * Math.PI
        );
        ctx.stroke();
      }
    });

    // 2. 다른 레이어의 보이드들 (점선)
    if (this.syncMode) {
      const dottedVoids = this.getDottedVoids(x, y, layer);
      dottedVoids.forEach((voidData) => {
        ctx.beginPath();
        ctx.strokeStyle = VOID_COLORS[voidData.type] || VOID_COLORS.default;
        ctx.setLineDash([5, 5]);
        ctx.globalAlpha = 0.5;

        if (voidData.type === "bbox") {
          // bbox 타입이면 사각형 그리기 (점선)
          ctx.strokeRect(
            voidData.centerX,
            voidData.centerY,
            voidData.radiusX,
            voidData.radiusY
          );
        } else {
          // 일반 void 타입이면 타원 그리기 (점선)
          ctx.ellipse(
            voidData.centerX,
            voidData.centerY,
            voidData.radiusX,
            voidData.radiusY,
            0,
            0,
            2 * Math.PI
          );
          ctx.stroke();
        }
      });

      // 상태 복원
      ctx.globalAlpha = 1.0;
      ctx.setLineDash([]);
    }

    // 3. bbox 그리기 (옵션이 활성화된 경우)
    if (this.showBbox) {
      const chipKey = this.createChipKey(x, y);
      const chipBboxes = this.bboxes.get(chipKey) || [];
      console.log(
        `Drawing bbox for chip (${x}, ${y}), key: ${chipKey}, bboxes:`,
        chipBboxes
      );
      chipBboxes.forEach((bbox) => {
        console.log(`Drawing bbox:`, bbox);
        ctx.beginPath();
        ctx.strokeStyle = "#ffaa00"; // 주황색
        ctx.lineWidth = 2;
        ctx.setLineDash([]);
        ctx.globalAlpha = 1.0;
        ctx.strokeRect(bbox.x, bbox.y, bbox.width, bbox.height);
        ctx.stroke();
      });
    }
  }

  /**
   * void 마스크용 보이드 그리기 (모든 레이어 실선)
   */
  drawVoidMask(ctx, chipCoord, titleOffset = 0) {
    const match = chipCoord.match(/\((-?\d+),(-?\d+)\)/);
    if (!match) return;

    const x = parseInt(match[1], 10);
    const y = parseInt(match[2], 10);

    ctx.lineWidth = 2;
    ctx.globalAlpha = 1.0;
    ctx.setLineDash([]);

    // 해당 칩의 모든 레이어 보이드들을 실선으로 그리기
    const allVoids = [];
    for (const [voidKey, voidData] of this.voids.entries()) {
      if (voidData.x === x && voidData.y === y) {
        allVoids.push(voidData);
      }
    }

    allVoids.forEach((voidData) => {
      ctx.beginPath();
      ctx.strokeStyle = VOID_COLORS[voidData.type] || VOID_COLORS.default;

      if (voidData.type === "bbox") {
        // bbox는 사각형으로 그리기
        ctx.strokeRect(
          voidData.centerX,
          voidData.centerY + titleOffset,
          voidData.radiusX,
          voidData.radiusY
        );
      } else {
        // 다른 타입은 타원으로 그리기
        ctx.ellipse(
          voidData.centerX,
          voidData.centerY + titleOffset, // titleH 오프셋 적용
          voidData.radiusX,
          voidData.radiusY,
          0,
          0,
          2 * Math.PI
        );
        ctx.stroke();
      }
    });
  }

  /**
   * 동기화 모드 토글
   */
  toggleSyncMode() {
    this.syncMode = !this.syncMode;
    return this.syncMode;
  }

  /**
   * bbox 표시 모드 토글
   */
  toggleBboxMode() {
    this.showBbox = !this.showBbox;
    return this.showBbox;
  }

  /**
   * 자동 bbox 검출 모드 토글
   */
  toggleAutoBboxDetection() {
    this.autoBboxDetection = !this.autoBboxDetection;
    return this.autoBboxDetection;
  }

  /**
   * 이미지 데이터에서 edge 검출하여 bbox 후보 생성
   */
  detectBboxFromImage(imageData) {
    const width = imageData.width;
    const height = imageData.height;
    const data = imageData.data;

    // 간단한 Sobel edge detection
    const sobelX = [-1, 0, 1, -2, 0, 2, -1, 0, 1];
    const sobelY = [-1, -2, -1, 0, 0, 0, 1, 2, 1];

    const edges = new Uint8Array(width * height);

    // edge detection
    for (let y = 1; y < height - 1; y++) {
      for (let x = 1; x < width - 1; x++) {
        let gx = 0,
          gy = 0;

        for (let ky = -1; ky <= 1; ky++) {
          for (let kx = -1; kx <= 1; kx++) {
            const idx = ((y + ky) * width + (x + kx)) * 4;
            const gray = (data[idx] + data[idx + 1] + data[idx + 2]) / 3;
            const kernelIdx = (ky + 1) * 3 + (kx + 1);

            gx += gray * sobelX[kernelIdx];
            gy += gray * sobelY[kernelIdx];
          }
        }

        const magnitude = Math.sqrt(gx * gx + gy * gy);
        edges[y * width + x] = magnitude > 25 ? 255 : 0; // threshold
      }
    }

    // 연결된 컴포넌트 찾기 및 bbox 계산
    const visited = new Uint8Array(width * height);
    const components = [];

    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const idx = y * width + x;
        if (edges[idx] && !visited[idx]) {
          const component = this.floodFill(edges, visited, x, y, width, height);
          if (component.length > 100) {
            // minimum component size
            const bbox = this.calculateBbox(component);
            if (bbox.width > 20 && bbox.height > 20) {
              // minimum bbox size
              components.push(bbox);
            }
          }
        }
      }
    }

    // 가장 큰 컴포넌트들을 bbox로 저장
    components.sort((a, b) => b.width * b.height - a.width * a.height);
    const topBboxes = components.slice(0, 3); // 상위 3개

    return topBboxes;
  }

  /**
   * Flood fill for connected component detection
   */
  floodFill(edges, visited, startX, startY, width, height) {
    const stack = [{ x: startX, y: startY }];
    const component = [];

    while (stack.length > 0) {
      const { x, y } = stack.pop();
      const idx = y * width + x;

      if (
        x < 0 ||
        x >= width ||
        y < 0 ||
        y >= height ||
        visited[idx] ||
        !edges[idx]
      ) {
        continue;
      }

      visited[idx] = 1;
      component.push({ x, y });

      // 8-connectivity
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          if (dx === 0 && dy === 0) continue;
          stack.push({ x: x + dx, y: y + dy });
        }
      }
    }

    return component;
  }

  /**
   * Calculate bounding box from component points
   */
  calculateBbox(component) {
    let minX = Infinity,
      minY = Infinity;
    let maxX = -Infinity,
      maxY = -Infinity;

    component.forEach(({ x, y }) => {
      minX = Math.min(minX, x);
      maxX = Math.max(maxX, x);
      minY = Math.min(minY, y);
      maxY = Math.max(maxY, y);
    });

    return {
      x: minX,
      y: minY,
      width: maxX - minX,
      height: maxY - minY,
    };
  }

  /**
   * 수동으로 bbox 추가
   */
  addBbox(chipKey, x, y, width, height) {
    const chipBboxes = this.bboxes.get(chipKey) || [];
    chipBboxes.push({ x, y, width, height });
    this.bboxes.set(chipKey, chipBboxes);
    console.log(`Added bbox to chip ${chipKey}:`, { x, y, width, height });
  }

  /**
   * 테스트용 bbox 추가 (디버깅용)
   */
  addTestBbox(chipX, chipY) {
    const chipKey = this.createChipKey(chipX, chipY);
    // 테스트용 bbox: 중앙에 50x50 크기
    this.addBbox(chipKey, 125, 125, 50, 50);
    console.log(`Added test bbox for chip (${chipX}, ${chipY})`);
  }

  /**
   * bbox 제거
   */
  removeBbox(chipKey, bboxIndex) {
    const chipBboxes = this.bboxes.get(chipKey) || [];
    if (bboxIndex >= 0 && bboxIndex < chipBboxes.length) {
      chipBboxes.splice(bboxIndex, 1);
      if (chipBboxes.length === 0) {
        this.bboxes.delete(chipKey);
      } else {
        this.bboxes.set(chipKey, chipBboxes);
      }
    }
  }

  /**
   * 전체 보이드 데이터 내보내기
   */
  exportVoids() {
    const result = [];
    for (const [voidKey, voidData] of this.voids.entries()) {
      result.push({
        key: voidKey,
        ...voidData,
      });
    }
    return result;
  }

  /**
   * bbox 데이터 내보내기
   */
  exportBboxes() {
    const result = [];
    for (const [chipKey, bboxArray] of this.bboxes.entries()) {
      const [chipX, chipY] = chipKey.split(",").map(Number);
      bboxArray.forEach((bbox, index) => {
        result.push({
          chipKey,
          chipX,
          chipY,
          index,
          ...bbox,
        });
      });
    }
    return result;
  }

  /**
   * 통계 정보
   */
  getStats() {
    const stats = {
      totalVoids: this.voids.size,
      byType: {},
      byChip: {},
      byLayer: {},
    };

    for (const [voidKey, voidData] of this.voids.entries()) {
      // 타입별
      stats.byType[voidData.type] = (stats.byType[voidData.type] || 0) + 1;

      // 칩별
      const chipKey = this.createChipKey(voidData.x, voidData.y);
      stats.byChip[chipKey] = (stats.byChip[chipKey] || 0) + 1;

      // 레이어별
      stats.byLayer[voidData.layer] = (stats.byLayer[voidData.layer] || 0) + 1;
    }

    return stats;
  }

  /**
   * 디버그 정보 출력
   */
  debug() {
    console.log("=== VOID MANAGER V2 DEBUG ===");
    console.log("Total voids:", this.voids.size);
    console.log("Void index counters:", this.voidIndexCounters);
    console.log("Sync mode:", this.syncMode);
    console.log("Statistics:", this.getStats());

    // 모든 보이드 출력
    for (const [voidKey, voidData] of this.voids.entries()) {
      console.log(`${voidKey}:`, voidData);
    }
  }
}
