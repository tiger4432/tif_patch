// 새로운 보이드 관리 클래스 (키 기반)
import { VOID_COLORS, CONFIG, BIN_RULES } from "./constants.js";
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
    this.enableBboxControl = true;
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

    if (radiusX == 0 || radiusY == 0) {
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
   * 보이드 삭제 (해당 레이어에서만) - 가장 안쪽(작은) void 우선
   */
  deleteVoid(x, y, layer, centerX, centerY) {
    console.log(
      `DeleteVoid called: x=${x}, y=${y}, layer=${layer}, click=(${centerX},${centerY})`
    );
    console.log(`Total voids: ${this.voids.size}`);

    const candidates = this.findTargetVoids(x, y, layer, centerX, centerY, 0);

    if (candidates.length > 0) {
      const smallestVoid = candidates[0]; // 이미 면적 순으로 정렬됨

      console.log(
        `Deleting smallest void: ${smallestVoid.voidKey}, area: ${smallestVoid.area}`
      );
      this.voids.delete(smallestVoid.voidKey);

      console.log(`Deleted 1 void (smallest)`);
      return true;
    }

    console.log(`No voids found to delete`);
    return false;
  }

  /**
   * 보이드 수정 (해당 레이어에서만) - 가장 안쪽(작은) void 우선
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
    const candidates = this.findTargetVoids(
      x,
      y,
      layer,
      oldCenterX,
      oldCenterY,
      0
    );

    if (candidates.length > 0) {
      const smallestVoid = candidates[0]; // 이미 면적 순으로 정렬됨

      smallestVoid.voidData.centerX = newCenterX;
      smallestVoid.voidData.centerY = newCenterY;
      smallestVoid.voidData.radiusX = newRadiusX;
      smallestVoid.voidData.radiusY = newRadiusY;
      console.log(
        `Updated smallest void: ${smallestVoid.voidKey}`,
        smallestVoid.voidData
      );
      return smallestVoid.voidData;
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
   * 특정 좌표와 클릭 위치에서 대상 보이드들 찾기 - 가장 안쪽(작은) void 우선
   */
  findTargetVoids(x, y, layer, clickX, clickY, tolerance = CONFIG.TOLERANCE) {
    const candidateVoids = [];

    for (const [voidKey, voidData] of this.voids.entries()) {
      if (voidData.x === x && voidData.y === y && voidData.layer === layer) {
        let inside = false;

        if (voidData.type === "bbox") {
          // bbox 타입은 사각형 범위 체크
          inside =
            clickX >= voidData.centerX - tolerance &&
            clickX <= voidData.centerX + voidData.radiusX + tolerance &&
            clickY >= voidData.centerY - tolerance &&
            clickY <= voidData.centerY + voidData.radiusY + tolerance;
        } else {
          // 일반 void는 타원 범위 체크
          const dx = (clickX - voidData.centerX) / voidData.radiusX;
          const dy = (clickY - voidData.centerY) / voidData.radiusY;
          inside =
            dx * dx + dy * dy <=
            1 + tolerance / Math.min(voidData.radiusX, voidData.radiusY);
        }

        if (inside) {
          // 보이드 크기 계산 (타원 면적 또는 bbox 면적)
          const area =
            voidData.type === "bbox"
              ? voidData.radiusX * voidData.radiusY
              : Math.PI * voidData.radiusX * voidData.radiusY;

          candidateVoids.push({ voidKey, voidData, area });
        }
      }
    }

    // 면적 순으로 정렬 (작은 것부터)
    candidateVoids.sort((a, b) => a.area - b.area);
    return candidateVoids;
  }

  /**
   * 편집 가능한 보이드 찾기 (가장 안쪽 void 반환)
   */
  findEditableVoid(x, y, layer, clickX, clickY) {
    const candidates = this.findTargetVoids(x, y, layer, clickX, clickY);
    return candidates.length > 0 ? candidates[0].voidData : null;
  }

  /**
   * 실제 크기 계산 (캔버스 픽셀을 실제 길이로 변환)
   * @param {number} canvasSize - 캔버스 크기 (픽셀)
   * @param {number} realChipSize - 실제 칩 크기 (예: μm 단위)
   * @param {number} canvasChipSize - 캔버스에서 칩 크기 (픽셀)
   * @returns {number} 실제 크기
   */
  calculateRealSize(canvasSize, realChipSize, canvasChipSize) {
    if (!canvasChipSize || canvasChipSize === 0) return 0;
    return (canvasSize * realChipSize) / canvasChipSize;
  }

  /**
   * 통합된 보이드 그리기 함수
   * @param {CanvasRenderingContext2D} ctx - 캔버스 컨텍스트
   * @param {Array} voids - 그릴 보이드들의 배열
   * @param {Object} options - 그리기 옵션
   * @param {number} options.titleOffset - Y축 오프셋 (기본값: 0)
   * @param {boolean} options.solidOnly - 실선만 그리기 (기본값: false)
   * @param {boolean} options.dottedOnly - 점선만 그리기 (기본값: false)
   * @param {number} options.alpha - 투명도 (기본값: 1.0)
   * @param {Array} options.lineDash - 선 스타일 (기본값: [])
   * @param {number} options.realChipSize - 실제 칩 크기 (μm 단위, 기본값: 1000)
   * @param {number} options.canvasChipSize - 캔버스에서 칩 크기 (픽셀, 기본값: 100)
   * @param {boolean} options.showSizes - dela void 크기 표시 여부 (기본값: false)
   */
  drawVoidsUnified(ctx, voids, options = {}) {
    const {
      titleOffset = 0,
      solidOnly = false,
      dottedOnly = false,
      alpha = 1.0,
      lineDash = [],
      realChipSize = 1000, // μm
      canvasChipSize = 100, // pixels
      showSizes = false,
      scaleFactor = 1,
    } = options;

    if (!voids || voids.length === 0) return;

    // 컨텍스트 상태 저장
    ctx.save();

    ctx.lineWidth = 2;
    ctx.globalAlpha = alpha;
    ctx.setLineDash(lineDash);

    voids.forEach((voidData) => {
      ctx.beginPath();
      ctx.strokeStyle = VOID_COLORS[voidData.type] || VOID_COLORS.default;

      if (voidData.type === "bbox") {
        // bbox 타입이면 사각형 그리기
        ctx.strokeRect(
          voidData.centerX * scaleFactor,
          (voidData.centerY + titleOffset) * scaleFactor,
          voidData.radiusX * scaleFactor,
          voidData.radiusY * scaleFactor
        );
      } else {
        // 일반 void 타입이면 타원 그리기
        ctx.ellipse(
          voidData.centerX * scaleFactor,
          (voidData.centerY + titleOffset) * scaleFactor,
          voidData.radiusX * scaleFactor,
          voidData.radiusY * scaleFactor,
          0,
          0,
          2 * Math.PI
        );
      }
      ctx.stroke();

      // dela void의 크기 표시
      if (showSizes && voidData.type === "dela") {
        ctx.setLineDash([]); // 텍스트는 실선으로
        ctx.fillStyle = VOID_COLORS[voidData.type] || "#0000ff";
        ctx.font = "14px Arial";
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";

        // 실제 크기 계산 (직경 단위)
        const realDiameterX = this.calculateRealSize(
          voidData.radiusX * 2,
          realChipSize,
          canvasChipSize
        );
        const realDiameterY = this.calculateRealSize(
          voidData.radiusY * 2,
          realChipSize,
          canvasChipSize
        );

        // 크기 텍스트 생성
        const sizeText = `${realDiameterX.toFixed(1)}×${realDiameterY.toFixed(
          1
        )}μm`;

        // 텍스트 위치 (void 중심 아래쪽)
        const textX = voidData.centerX * scaleFactor;
        const textY = Math.min(
          (voidData.centerY + titleOffset) * scaleFactor +
            voidData.radiusY * scaleFactor +
            12,
          ctx.canvas.height - 20
        );

        // 텍스트 배경 (가독성을 위해)
        const textMetrics = ctx.measureText(sizeText);
        const textWidth = textMetrics.width;
        const textHeight = 10;

        ctx.fillStyle = "rgba(255, 255, 255, 0.8)";
        ctx.fillRect(
          textX - textWidth / 2 - 2,
          textY - textHeight / 2 - 1,
          textWidth + 4,
          textHeight + 2
        );

        // 텍스트 그리기
        ctx.fillStyle = VOID_COLORS[voidData.type] || "#0000ff";
        ctx.fillText(sizeText, textX, textY);

        ctx.setLineDash(lineDash); // 원래 선 스타일로 복원
      }
    });

    // 컨텍스트 상태 복원
    ctx.restore();
  }

  /**
   * 보이드 그리기 (패치 뷰용)
   */
  drawVoids(ctx, patchLabel, options = {}) {
    const { chipCoord, layer } = parsePatchLabel(patchLabel);
    const match = chipCoord.match(/\((-?\d+),(-?\d+)\)/);
    if (!match) return;

    const x = parseInt(match[1], 10);
    const y = parseInt(match[2], 10);

    // 기본 옵션 설정
    const {
      realChipSize = 1000, // μm
      canvasChipSize = 100, // pixels (패치 크기)
      showSizes = true,
      scaleFactor = 1,
    } = options;

    // 1. 현재 레이어의 보이드들 (실선)
    const solidVoids = this.getSolidVoids(x, y, layer);
    this.drawVoidsUnified(ctx, solidVoids, {
      titleOffset: 0,
      alpha: 1.0,
      lineDash: [],
      realChipSize,
      canvasChipSize,
      showSizes,
      scaleFactor,
    });

    // 2. 다른 레이어의 보이드들 (점선) - 동기화 모드일 때만
    if (this.syncMode) {
      const dottedVoids = this.getDottedVoids(x, y, layer);
      this.drawVoidsUnified(ctx, dottedVoids, {
        titleOffset: 0,
        alpha: 0.5,
        lineDash: [5, 5],
        realChipSize,
        canvasChipSize,
        showSizes: false, // 점선 void는 크기 표시 안함
        scaleFactor,
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

    // 해당 칩의 모든 레이어 보이드들 수집
    const allVoids = [];
    for (const [voidKey, voidData] of this.voids.entries()) {
      if (voidData.x === x && voidData.y === y) {
        allVoids.push(voidData);
      }
    }

    // 통합 함수로 그리기
    this.drawVoidsUnified(ctx, allVoids, {
      titleOffset: titleOffset,
      alpha: 1.0,
      lineDash: [],
      scaleFactor: 1,
    });
  }

  /**
   * 특정 타입의 칩들에서 모든 보이드들 수집
   */
  getVoidsByChipType(chipType, allPatchPages) {
    const typeChips = allPatchPages.filter((page) => page.type === chipType);
    const typeVoids = [];

    typeChips.forEach((chip) => {
      const match = chip.coord.match(/\((-?\d+),(-?\d+)\)/);
      if (!match) return;

      const chipX = parseInt(match[1]);
      const chipY = parseInt(match[2]);

      // 해당 칩의 모든 void 수집
      for (const [voidKey, voidData] of this.voids.entries()) {
        if (voidData.x === chipX && voidData.y === chipY) {
          typeVoids.push(voidData);
        }
      }
    });

    return typeVoids;
  }

  /**
   * 동기화 모드 토글
   */
  toggleSyncMode() {
    this.syncMode = !this.syncMode;
    return this.syncMode;
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
   * 특정 칩의 bin 계산 (우선순위가 높은 bin 반환)
   */
  calculateChipBin(chipX, chipY) {
    // 해당 칩의 모든 void 타입 수집
    const voidTypes = new Set();
    for (const [voidKey, voidData] of this.voids.entries()) {
      if (voidData.x === chipX && voidData.y === chipY) {
        voidTypes.add(voidData.type);
      }
    }

    // void가 없으면 기본 bin (BIN1) 반환 - 정상 칩
    if (voidTypes.size === 0) {
      return {
        bin: BIN_RULES.default.bin,
        color: BIN_RULES.default.color,
        name: BIN_RULES.default.name,
        voidTypes: [],
      };
    }

    // void 타입별로 가장 높은 우선순위 bin 찾기
    let highestBin = BIN_RULES.default.bin; // 기본값을 BIN1으로 시작
    let binInfo = BIN_RULES.default;

    for (const voidType of voidTypes) {
      if (BIN_RULES[voidType] && BIN_RULES[voidType].bin > highestBin) {
        highestBin = BIN_RULES[voidType].bin;
        binInfo = BIN_RULES[voidType];
      }
    }

    return {
      bin: highestBin,
      color: binInfo.color,
      name: binInfo.name,
      voidTypes: Array.from(voidTypes),
    };
  }

  /**
   * 모든 칩의 bin 정보 계산 (chipPoints를 기반으로)
   */
  calculateAllChipBins(chipPoints = null) {
    const chipBins = new Map();

    // chipPoints가 제공되지 않으면 void가 있는 칩만 처리
    if (!chipPoints) {
      // 모든 칩 좌표 수집 (void가 있는 칩만)
      const chips = new Set();
      for (const [voidKey, voidData] of this.voids.entries()) {
        chips.add(`${voidData.x},${voidData.y}`);
      }

      // 각 칩의 bin 계산
      for (const chipKey of chips) {
        const [x, y] = chipKey.split(",").map(Number);
        const binInfo = this.calculateChipBin(x, y);
        chipBins.set(chipKey, binInfo);
      }
    } else {
      // chipPoints가 제공되면 모든 칩 처리 (void 없는 칩도 포함)
      chipPoints.forEach((chipPoint) => {
        const { x, y } = chipPoint;
        const chipKey = `${x},${y}`;
        const binInfo = this.calculateChipBin(x, y);
        chipBins.set(chipKey, binInfo);
      });
    }

    return chipBins;
  }

  /**
   * bin 통계 정보
   */
  getBinStats(chipPoints = null) {
    const chipBins = this.calculateAllChipBins(chipPoints);
    const stats = {
      totalChips: chipBins.size,
      byBin: {},
    };

    for (const [chipKey, binInfo] of chipBins.entries()) {
      const binName = binInfo.name;
      if (!stats.byBin[binName]) {
        stats.byBin[binName] = {
          count: 0,
          color: binInfo.color,
          bin: binInfo.bin,
        };
      }
      stats.byBin[binName].count++;
    }

    return stats;
  }

  /**
   * bin map 생성 (2D 그리드 형태) - bonding map에 대응되는 위치만 bin 값 설정
   */
  generateBinMap(chipPoints, gridSettings) {
    if (!chipPoints || !gridSettings) return null;

    const { cols, rows } = gridSettings;
    const binMap = [];

    // 빈 그리드 초기화 (0으로 초기화 - 칩이 없는 위치)
    for (let row = 0; row < rows; row++) {
      binMap[row] = new Array(cols).fill(0);
    }

    // 각 칩 포인트에 대해서만 bin 계산하여 그리드에 설정
    chipPoints.forEach((chipPoint) => {
      const { x: chipX, y: chipY } = chipPoint;
      const binInfo = this.calculateChipBin(chipX, chipY);

      // 칩 좌표를 그리드 인덱스로 변환 (기준점 고려)
      const gridX = chipX - gridSettings.refGrid.x;
      const gridY = chipY - gridSettings.refGrid.y;

      // 그리드 범위 내에 있는지 확인
      if (gridX >= 0 && gridX < cols && gridY >= 0 && gridY < rows) {
        // 칩이 있는 위치에만 bin 값 설정
        binMap[gridY][gridX] = binInfo.bin;
      }
    });

    return binMap;
  }

  /**
   * bin map을 축 표시가 포함된 텍스트 형태로 변환
   */
  binMapToText(binMap, gridSettings) {
    if (!binMap || !gridSettings) return "";

    const { cols, rows, refGrid } = gridSettings;
    const lines = [];

    // X축 헤더 (열 번호)
    const xHeader = [""];
    for (let x = 0; x < cols; x++) {
      xHeader.push((refGrid.x + x).toString());
    }
    lines.push(xHeader.join("\t"));

    // 각 행 (Y축 포함)
    for (let y = 0; y < rows; y++) {
      const rowData = [(refGrid.y + y).toString()]; // Y축 값
      for (let x = 0; x < cols; x++) {
        rowData.push(binMap[y][x].toString());
      }
      lines.push(rowData.join("\t"));
    }

    return lines.join("\n");
  }

  /**
   * bonding map을 축 표시가 포함된 텍스트 형태로 변환
   */
  bondingMapToText(chipPoints, gridSettings) {
    if (!chipPoints || !gridSettings) return "";

    const { cols, rows, refGrid } = gridSettings;
    const bondingMap = [];

    // 빈 그리드 초기화 (0 = 빈 공간)
    for (let row = 0; row < rows; row++) {
      bondingMap[row] = new Array(cols).fill(0);
    }

    // 칩 포인트들을 그리드에 표시 (1 = 칩 존재)
    chipPoints.forEach((chipPoint) => {
      const { x: chipX, y: chipY } = chipPoint;

      // 칩 좌표를 그리드 인덱스로 변환
      const gridX = chipX - refGrid.x;
      const gridY = chipY - refGrid.y;

      // 그리드 범위 내에 있는지 확인
      if (gridX >= 0 && gridX < cols && gridY >= 0 && gridY < rows) {
        bondingMap[gridY][gridX] = 1;
      }
    });

    const lines = [];

    // 헤더와 legend 추가
    lines.push("# Bonding Map (Tab-separated)");
    lines.push(`# Grid Size: ${cols} x ${rows}`);
    lines.push(`# Reference Grid: (${refGrid.x}, ${refGrid.y})`);
    lines.push("# Legend: 0=No Chip, 1=Chip Present");
    lines.push(`# Total Chips: ${chipPoints.length}`);
    lines.push("");

    // X축 헤더 (열 번호)
    const xHeader = ["Y\\X"];
    for (let x = 0; x < cols; x++) {
      xHeader.push((refGrid.x + x).toString());
    }
    lines.push(xHeader.join("\t"));

    // 각 행 (Y축 포함)
    for (let y = 0; y < rows; y++) {
      const rowData = [(refGrid.y + y).toString()]; // Y축 값
      for (let x = 0; x < cols; x++) {
        rowData.push(bondingMap[y][x].toString());
      }
      lines.push(rowData.join("\t"));
    }

    return lines.join("\n");
  }

  /**
   * bin map을 CSV 형태 문자열로 변환 (하위 호환성)
   */
  binMapToCSV(binMap) {
    if (!binMap) return "";

    return binMap.map((row) => row.join("\t")).join("\n");
  }

  /**
   * bonding map을 CSV 형태 문자열로 변환 (하위 호환성)
   */
  bondingMapToCSV(chipPoints, gridSettings) {
    if (!chipPoints || !gridSettings) return "";

    const { cols, rows } = gridSettings;
    const bondingMap = [];

    // 빈 그리드 초기화 (0 = 빈 공간)
    for (let row = 0; row < rows; row++) {
      bondingMap[row] = new Array(cols).fill(0);
    }

    // 칩 포인트들을 그리드에 표시 (1 = 칩 존재)
    chipPoints.forEach((chipPoint) => {
      const { x: chipX, y: chipY } = chipPoint;

      // 칩 좌표를 그리드 인덱스로 변환
      const gridX = chipX - gridSettings.refGrid.x;
      const gridY = chipY - gridSettings.refGrid.y;

      // 그리드 범위 내에 있는지 확인
      if (gridX >= 0 && gridX < cols && gridY >= 0 && gridY < rows) {
        bondingMap[gridY][gridX] = 1;
      }
    });

    return bondingMap.map((row) => row.join("\t")).join("\n");
  }

  /**
   * 디버그 정보 출력
   */
  debug(chipPoints = null) {
    console.log("=== VOID MANAGER V2 DEBUG ===");
    console.log("Total voids:", this.voids.size);
    console.log("Void index counters:", this.voidIndexCounters);
    console.log("Sync mode:", this.syncMode);
    console.log("Statistics:", this.getStats());
    console.log("Bin Statistics:", this.getBinStats(chipPoints));

    // 모든 보이드 출력
    for (const [voidKey, voidData] of this.voids.entries()) {
      console.log(`${voidKey}:`, voidData);
    }
  }
}
