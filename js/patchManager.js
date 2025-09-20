// 패치 추출, 표시, void 이벤트 관리 모듈
import { VOID_COLORS, CONFIG } from "./constants.js";
import { padCoord, parsePatchLabel } from "./utils.js";
import { ImageProcessor } from "./imageProcessor.js";

export class PatchManager {
  constructor(voidManager, app) {
    this.voidManager = voidManager;
    this.app = app; // WaferApp 참조

    // 패치 데이터
    this.allPatchPages = [];
    this.currentPatchPage = 0;
  }

  /**
   * allPatchCanvases 접근자
   */
  get allPatchCanvases() {
    return window.allPatchCanvases || [];
  }

  /**
   * 패치 추출 메인 로직
   */
  async extractPatches() {
    if (!this.app.pages.length) {
      alert("TIFF 파일을 먼저 로드해주세요!");
      return;
    }
    if (!this.app.csvRows.length) {
      alert("CSV 데이터를 먼저 로드해주세요!");
      return;
    }

    // 기존 보이드 데이터 초기화
    this.voidManager.voids.clear();
    this.voidManager.voidIndexCounters.clear();
    console.log("Void data cleared for new patch extraction");

    this.allPatchPages = [];
    const cellW = +document.getElementById("cellW").value;
    const cellH = +document.getElementById("cellH").value;
    const tMean = parseFloat(document.getElementById("targetMean").value);
    const tStd = parseFloat(document.getElementById("targetStd").value);
    const pad = parseInt(document.getElementById("padPx").value, 10);
    window.allPatchCanvases = [];

    this.app.csvRows.forEach((r) => {
      const pageData = {
        coord: `(${r.x},${r.y})`,
        layers: [],
        type: r.type,
      };

      this.app.pages.forEach((src, pageIdx) => {
        const gx = this.app.origin.x + (r.x - this.app.refGrid.x) * cellW;
        const gy = this.app.origin.y + (r.y - this.app.refGrid.y) * cellH;

        console.log(gx, gy, cellW, cellH);

        const titleH = 40;
        const patchSize = 300; // 고정 패치 크기
        const c = document.createElement("canvas");
        c.width = patchSize;
        c.height = (patchSize * cellH) / cellW + titleH;
        const ctx = c.getContext("2d");

        const label = `X${padCoord(r.x)}_Y${padCoord(r.y)}_L${String(
          pageIdx + 1
        ).padStart(2, "0")}_LEG:${r.type || "NA"}`;
        ctx.fillStyle = "#000";
        ctx.fillRect(0, 0, patchSize, titleH);
        ctx.fillStyle = "#fff";
        ctx.font = "20px sans-serif";
        ctx.textBaseline = "middle";
        ctx.fillText(label, 6, titleH / 2);

        ctx.drawImage(
          src,
          gx,
          gy,
          cellW,
          cellH,
          0,
          titleH,
          patchSize,
          (patchSize * cellH) / cellW
        );

        // 이미지 향상 먼저 수행
        const subImg = ctx.getImageData(0, titleH, c.width, c.height);
        const tmp = document.createElement("canvas");
        tmp.width = c.width;
        tmp.height = c.height;
        tmp.getContext("2d").putImageData(subImg, 0, 0);
        ImageProcessor.enhanceToTarget(
          tmp.getContext("2d"),
          tMean,
          tStd,
          pad
        );
        ctx.putImageData(
          tmp.getContext("2d").getImageData(0, 0, c.width, c.height),
          0,
          titleH
        );

        // 보정 완료된 이미지 데이터 저장
        const enhancedImageData = ctx.getImageData(0, 0, c.width, c.height);

        // 원본 캔버스 (void 마킹 없음) 복사본 생성
        const originalCanvas = document.createElement("canvas");
        originalCanvas.width = c.width;
        originalCanvas.height = c.height;
        originalCanvas.getContext("2d").putImageData(enhancedImageData, 0, 0);

        this.attachVoidEvents(c, label, enhancedImageData);

        pageData.layers.push({
          canvas: c,
          originalCanvas: originalCanvas, // 원본 캔버스 추가
          label,
          type: r.type || "NA",
          layer: pageIdx + 1,
          imageData: enhancedImageData,
        });

        const typeFolder = r.type
          ? r.type.replace(/[^a-zA-Z0-9_-]/g, "_")
          : "NA";
        window.allPatchCanvases.push({
          canvas: c,
          originalCanvas: originalCanvas, // 원본 캔버스 추가
          layer: pageIdx + 1,
          label,
          type: r.type || "NA", // 원본 type 사용
          typeFolder: typeFolder, // 폴더명용은 별도 필드
        });
      });

      this.allPatchPages.push(pageData);
    });

    this.currentPatchPage = 0;
    await this.showPatchPage(0);

    // 보이드 데이터 초기화 후 패치 뷰어 갱신
    this.refreshCurrentPatches();

    console.log(
      `패치 추출 완료: ${this.allPatchPages.length}개 좌표, 총 ${
        this.allPatchPages.length * this.app.pages.length
      }개 패치`
    );
  }

  /**
   * void 이벤트 연결
   */
  attachVoidEvents(canvas, patchLabel, imageData) {
    const ctx = canvas.getContext("2d");
    const { chipCoord, layer } = parsePatchLabel(patchLabel);
    const match = chipCoord.match(/\((-?\d+),(-?\d+)\)/);
    if (!match) return;

    const x = parseInt(match[1], 10);
    const y = parseInt(match[2], 10);

    const repaint = () => {
      ctx.putImageData(imageData, 0, 0);
      this.voidManager.drawVoids(ctx, patchLabel);
    };

    // 보이드 마킹
    canvas.addEventListener("mousedown", (e) => {
      if (!this.app.voidMarkMode) return;

      const rect = canvas.getBoundingClientRect();
      const scaleX = canvas.width / rect.width;
      const scaleY = canvas.height / rect.height;
      const sx = (e.clientX - rect.left) * scaleX;
      const sy = (e.clientY - rect.top) * scaleY;

      const drag = (me) => {
        const cx = (me.clientX - rect.left) * scaleX;
        const cy = (me.clientY - rect.top) * scaleY;
        repaint();
        const selType =
          document.getElementById("voidTypeSelect").value || "default";
        ctx.strokeStyle = VOID_COLORS[selType] || VOID_COLORS.default;
        ctx.lineWidth = 2;
        ctx.beginPath();

        if (selType === "bbox") {
          // bbox 타입이면 사각형 그리기
          ctx.strokeRect(
            Math.min(sx, cx),
            Math.min(sy, cy),
            Math.abs(cx - sx),
            Math.abs(cy - sy)
          );
        } else {
          // 일반 void 타입이면 타원 그리기
          ctx.ellipse(
            (sx + cx) / 2,
            (sy + cy) / 2,
            Math.abs(cx - sx) / 2,
            Math.abs(cy - sy) / 2,
            0,
            0,
            2 * Math.PI
          );
          ctx.stroke();
        }
      };

      const up = (ue) => {
        document.removeEventListener("mousemove", drag);
        document.removeEventListener("mouseup", up);
        const ex = (ue.clientX - rect.left) * scaleX;
        const ey = (ue.clientY - rect.top) * scaleY;
        const type =
          document.getElementById("voidTypeSelect").value || "void";

        let newVoid;

        if (type === "bbox") {
          // bbox 타입이면 사각형으로 저장
          const rectX = Math.min(sx, ex);
          const rectY = Math.min(sy, ey);
          const rectW = Math.abs(ex - sx);
          const rectH = Math.abs(ey - sy);

          // bbox는 centerX, centerY에 좌상단 좌표를 저장하고 radiusX, radiusY에 너비, 높이를 저장
          newVoid = this.voidManager.createVoid(
            patchLabel,
            type,
            rectX, // centerX에 x 좌표
            rectY, // centerY에 y 좌표
            rectW, // radiusX에 width
            rectH // radiusY에 height
          );
        } else {
          // 일반 void 타입이면 타원으로 저장
          const centerX = (sx + ex) / 2;
          const centerY = (sy + ey) / 2;
          const radiusX = Math.abs(ex - sx) / 2;
          const radiusY = Math.abs(ey - sy) / 2;

          newVoid = this.voidManager.createVoid(
            patchLabel,
            type,
            centerX,
            centerY,
            radiusX,
            radiusY
          );
        }

        if (newVoid) {
          this.refreshCurrentPatches();
          this.app.updateVoidJsonDisplay(); // JSON 업데이트 추가
        } else {
          repaint();
        }
      };

      // void 마킹 모드일 때만 void 이벤트 연결
      if (this.app.voidMarkMode) {
        document.addEventListener("mousemove", drag);
        document.addEventListener("mouseup", up);
      }
    });

    // 보이드 삭제 (해당 레이어에서만)
    canvas.addEventListener("click", (e) => {
      if (!this.app.deleteVoidMode) return;

      const rect = canvas.getBoundingClientRect();
      const scaleX = canvas.width / rect.width;
      const scaleY = canvas.height / rect.height;
      const clickX = (e.clientX - rect.left) * scaleX;
      const clickY = (e.clientY - rect.top) * scaleY;

      console.log(
        `Attempting to delete void at (${x},${y},${layer}) click:(${clickX},${clickY})`
      );

      const deleted = this.voidManager.deleteVoid(
        x,
        y,
        layer,
        clickX,
        clickY
      );

      console.log(`Delete result: ${deleted}`);

      if (deleted) {
        this.refreshCurrentPatches();
        this.app.updateVoidJsonDisplay(); // JSON 업데이트 추가
      }
    });

    // 보이드 편집 (해당 레이어에서만)
    canvas.addEventListener("mousedown", (e) => {
      if (this.app.voidMarkMode || this.app.deleteVoidMode) return;

      const rect = canvas.getBoundingClientRect();
      const scaleX = canvas.width / rect.width;
      const scaleY = canvas.height / rect.height;
      const clickX = (e.clientX - rect.left) * scaleX;
      const clickY = (e.clientY - rect.top) * scaleY;

      const editableVoid = this.voidManager.findEditableVoid(
        x,
        y,
        layer,
        clickX,
        clickY
      );
      if (!editableVoid) return;

      this.app.selectedVoid = editableVoid;
      const originalCenterX = editableVoid.centerX;
      const originalCenterY = editableVoid.centerY;

      // 이동 vs 크기조절 판단
      const dx = clickX - editableVoid.centerX;
      const dy = clickY - editableVoid.centerY;
      const angle = Math.atan2(dy, dx);
      const rB =
        (editableVoid.radiusX * editableVoid.radiusY) /
        Math.sqrt(
          (editableVoid.radiusY * Math.cos(angle)) ** 2 +
            (editableVoid.radiusX * Math.sin(angle)) ** 2
        );
      const dist = Math.hypot(dx, dy);

      this.app.resizeMode = Math.abs(dist - rB) <= CONFIG.TOLERANCE;
      const offsetX = clickX - editableVoid.centerX;
      const offsetY = clickY - editableVoid.centerY;

      const moveHandler = (me) => {
        const mx = (me.clientX - rect.left) * scaleX;
        const my = (me.clientY - rect.top) * scaleY;

        if (this.app.resizeMode) {
          const newRadiusX = Math.abs(mx - editableVoid.centerX);
          const newRadiusY = Math.abs(my - editableVoid.centerY);

          if (me.shiftKey) {
            const r = Math.max(newRadiusX, newRadiusY);
            editableVoid.radiusX = editableVoid.radiusY = r;
          } else {
            editableVoid.radiusX = newRadiusX;
            editableVoid.radiusY = newRadiusY;
          }
        } else {
          editableVoid.centerX = mx - offsetX;
          editableVoid.centerY = my - offsetY;
        }

        repaint();
      };

      const upHandler = () => {
        document.removeEventListener("mousemove", moveHandler);
        document.removeEventListener("mouseup", upHandler);

        // 변경사항 저장 (실제로는 이미 editableVoid 객체가 수정되었음)
        this.refreshCurrentPatches();
        this.app.updateVoidJsonDisplay(); // JSON 업데이트 추가
        this.app.selectedVoid = null;
      };

      document.addEventListener("mousemove", moveHandler);
      document.addEventListener("mouseup", upHandler);
    });
  }

  /**
   * 현재 패치들 새로고침
   */
  refreshCurrentPatches() {
    if (
      !this.allPatchPages.length ||
      this.currentPatchPage >= this.allPatchPages.length
    )
      return;

    // 모든 패치 캔버스 업데이트 (저장용 + UI용 통일)
    this.updateAllPatchCanvases();

    // void JSON 업데이트
    this.app.updateVoidJsonDisplay();

    // 패치 뷰어 전체 새로고침 (void 마스크 실시간 업데이트)
    this.showPatchPage(this.currentPatchPage);
  }

  /**
   * 모든 패치 캔버스를 최신 void 상태로 업데이트 (UI와 저장용 통일)
   */
  updateAllPatchCanvases() {
    // 현재 표시 중인 페이지뿐만 아니라 모든 페이지 업데이트
    this.allPatchPages.forEach((page) => {
      page.layers.forEach((layerInfo) => {
        const ctx = layerInfo.canvas.getContext("2d");
        ctx.putImageData(layerInfo.imageData, 0, 0);
        this.voidManager.drawVoids(ctx, layerInfo.label);
      });
    });

    // window.allPatchCanvases의 캔버스들도 업데이트
    if (window.allPatchCanvases) {
      window.allPatchCanvases.forEach((patchInfo) => {
        const ctx = patchInfo.canvas.getContext("2d");
        // 원본 이미지 데이터로 복원 후 void 다시 그리기
        const page = this.allPatchPages.find(p =>
          p.layers.some(l => l.label === patchInfo.label)
        );
        if (page) {
          const layer = page.layers.find(l => l.label === patchInfo.label);
          if (layer) {
            ctx.putImageData(layer.imageData, 0, 0);
            this.voidManager.drawVoids(ctx, patchInfo.label);
          }
        }
      });
    }
  }

  /**
   * 패치 페이지 표시
   */
  async showPatchPage(idx) {
    if (!this.allPatchPages.length) return;
    if (idx < 0) idx = 0;
    if (idx >= this.allPatchPages.length)
      idx = this.allPatchPages.length - 1;
    this.currentPatchPage = idx;

    const page = this.allPatchPages[idx];
    const patchesDiv = document.getElementById("patches");
    patchesDiv.innerHTML = "";

    const wrap = document.createElement("div");
    wrap.className = "coord-card";
    wrap.innerHTML = `<h3>Chip ${page.coord}</h3>`;

    const layersWrap = document.createElement("div");
    layersWrap.className = "layers-wrap";

    // void 마스크 먼저 추가 (가장 맨 위, 항상 표시)
    const voidMaskCanvas = this.createVoidMaskCanvas(
      page.coord,
      page.type,
      true
    ); // 항상 생성
    const voidItem = document.createElement("div");
    voidItem.className = "layer-item";
    voidItem.innerHTML = `<div class="layer-label" style="color: #e74c3c">VOID MASK (ALL LAYERS)</div>`;
    voidItem.appendChild(voidMaskCanvas);
    layersWrap.appendChild(voidItem);

    // 기존 레이어들 추가
    page.layers.forEach((l) => {
      const item = document.createElement("div");
      item.className = "layer-item";
      item.innerHTML = `<div class="layer-label">${l.label}</div>`;
      item.appendChild(l.canvas);
      layersWrap.appendChild(item);
    });

    wrap.appendChild(layersWrap);
    patchesDiv.appendChild(wrap);

    document.getElementById("pageInfo").textContent = `Page ${
      this.currentPatchPage + 1
    } / ${this.allPatchPages.length}`;

    // 현재 패치 변경 시 그리드의 초록점 업데이트
    await this.app.drawPage();
  }

  /**
   * 실시간 void 마스크 캔버스 생성
   */
  createVoidMaskCanvas(chipCoord, type, forceCreate = false) {
    const match = chipCoord.match(/\((-?\d+),(-?\d+)\)/);
    if (!match) return null;

    const chipX = parseInt(match[1], 10);
    const chipY = parseInt(match[2], 10);
    const cellW = +document.getElementById("cellW").value;
    const cellH = +document.getElementById("cellH").value;

    // 해당 칩에 void가 있는지 확인
    const chipVoids = [];
    for (const [voidKey, voidData] of this.voidManager.voids.entries()) {
      if (voidData.x === chipX && voidData.y === chipY) {
        chipVoids.push(voidData);
      }
    }

    // forceCreate가 false이고 void가 없으면 null 반환 (이전 동작)
    if (!forceCreate && chipVoids.length === 0) {
      return null;
    }

    // 투명 마스크 캔버스 생성 (void가 없어도 빈 캔버스 생성)
    const patchSize = 300;
    const titleH = 40;
    const maskCanvas = document.createElement("canvas");
    maskCanvas.width = patchSize;
    maskCanvas.height = (patchSize * cellH) / cellW + titleH;
    const maskCtx = maskCanvas.getContext("2d");

    // 배경을 투명하게 설정
    maskCtx.clearRect(0, 0, maskCanvas.width, maskCanvas.height);

    // 타이틀 영역 (검은 배경)
    const label = `X${padCoord(chipX)}_Y${padCoord(
      chipY
    )}_L00_LEG:${type}`;
    maskCtx.fillStyle = "#000";
    maskCtx.fillRect(0, 0, patchSize, titleH);
    maskCtx.fillStyle = "#fff";
    maskCtx.font = "20px sans-serif";
    maskCtx.textBaseline = "middle";
    maskCtx.fillText(label, 6, titleH / 2);

    // void 마스크 그리기 (void가 있는 경우에만)
    if (chipVoids.length > 0) {
      // 올바른 patchLabel 형태로 생성: X05_Y07_L01_LEG:type
      const properPatchLabel = `X${padCoord(chipX)}_Y${padCoord(chipY)}_L01_LEG:${type}`;
      // mergeMode = true, titleOffset = 0 (void 좌표가 이미 타이틀 영역 포함)
      this.voidManager.drawVoids(maskCtx, properPatchLabel, true, 0);
    }
    // void가 없으면 타이틀만 있는 빈 캔버스

    return maskCanvas;
  }

  /**
   * Type별 summary 마스크 생성 (모든 void 통합)
   */
  createTypeSummaryMask(chipType) {
    // 해당 타입의 모든 칩들 찾기
    const typeChips = this.allPatchPages.filter(page => page.type === chipType);
    console.log(`Creating summary for type ${chipType}: found ${typeChips.length} chips`);
    if (typeChips.length === 0) {
      console.warn(`No chips found for type: ${chipType}`);
      return null;
    }

    // 첫 번째 칩을 기준으로 캔버스 크기 결정
    const firstChip = typeChips[0];
    console.log(`First chip for type ${chipType}:`, firstChip);
    console.log(`First chip layers count: ${firstChip.layers ? firstChip.layers.length : 'undefined'}`);

    const firstLayer = firstChip.layers && firstChip.layers[0];
    if (!firstLayer) {
      console.warn(`No layers found for chip type ${chipType} - cannot create summary`);
      return null;
    }

    const patchSize = 300;
    const titleH = 40;
    const statsH = 30; // 통계 정보 영역 높이

    // Summary 캔버스 생성 (통계 영역 추가)
    const summaryCanvas = document.createElement("canvas");
    summaryCanvas.width = patchSize;
    summaryCanvas.height = firstLayer.canvas.height + statsH;
    const summaryCtx = summaryCanvas.getContext("2d");

    // 배경을 투명하게 설정
    summaryCtx.clearRect(0, 0, summaryCanvas.width, summaryCanvas.height);

    // 타이틀 영역
    const label = `SUMMARY_${chipType.toUpperCase()}_ALL_VOIDS`;
    summaryCtx.fillStyle = "#000";
    summaryCtx.fillRect(0, 0, patchSize, titleH);
    summaryCtx.fillStyle = "#fff";
    summaryCtx.font = "18px sans-serif";
    summaryCtx.textBaseline = "middle";
    summaryCtx.fillText(label, 6, titleH / 2);

    // 해당 타입의 모든 void들 수집
    const typeVoids = [];
    console.log(`Available voids in voidManager: ${this.voidManager.voids.size}`);

    typeChips.forEach(chip => {
      const match = chip.coord.match(/\((-?\d+),(-?\d+)\)/);
      if (!match) return;

      const chipX = parseInt(match[1]);
      const chipY = parseInt(match[2]);

      console.log(`Checking chip at (${chipX},${chipY}) for voids...`);

      // 해당 칩의 모든 void 수집
      for (const [voidKey, voidData] of this.voidManager.voids.entries()) {
        if (voidData.x === chipX && voidData.y === chipY) {
          typeVoids.push(voidData);
          console.log(`Found void at (${chipX},${chipY}):`, voidData);
        }
      }
    });

    console.log(`${chipType} type summary: found ${typeVoids.length} voids across ${typeChips.length} chips`);

    // 모든 void들을 summary 캔버스에 그리기
    if (typeVoids.length > 0) {
      summaryCtx.lineWidth = 2;
      summaryCtx.globalAlpha = 1.0;
      summaryCtx.setLineDash([]);

      typeVoids.forEach((voidData) => {
        summaryCtx.beginPath();
        summaryCtx.strokeStyle = VOID_COLORS[voidData.type] || VOID_COLORS.default;

        if (voidData.type === "bbox") {
          // bbox는 사각형으로 그리기
          summaryCtx.strokeRect(
            voidData.centerX,
            voidData.centerY,
            voidData.radiusX,
            voidData.radiusY
          );
        } else {
          // 일반 void 타입이면 타원 그리기
          summaryCtx.ellipse(
            voidData.centerX,
            voidData.centerY,
            voidData.radiusX,
            voidData.radiusY,
            0,
            0,
            2 * Math.PI
          );
          summaryCtx.stroke();
        }
      });

      // 통계 정보를 캔버스 맨 아래 별도 영역에 추가
      const statsY = summaryCanvas.height - statsH;
      summaryCtx.fillStyle = "#f8f9fa"; // 밝은 회색 배경
      summaryCtx.fillRect(0, statsY, patchSize, statsH);

      // 테두리 추가
      summaryCtx.strokeStyle = "#dee2e6";
      summaryCtx.lineWidth = 1;
      summaryCtx.strokeRect(0, statsY, patchSize, statsH);

      summaryCtx.fillStyle = "#343a40"; // 진한 회색 텍스트
      summaryCtx.font = "14px sans-serif";
      summaryCtx.textAlign = "center";
      summaryCtx.fillText(`${typeVoids.length} voids in ${typeChips.length} chips`, patchSize / 2, statsY + statsH / 2 + 5);
    } else {
      // void가 없는 경우에도 통계 영역 추가
      const statsY = summaryCanvas.height - statsH;
      summaryCtx.fillStyle = "#f8f9fa";
      summaryCtx.fillRect(0, statsY, patchSize, statsH);

      summaryCtx.strokeStyle = "#dee2e6";
      summaryCtx.lineWidth = 1;
      summaryCtx.strokeRect(0, statsY, patchSize, statsH);

      summaryCtx.fillStyle = "#6c757d"; // 회색 텍스트
      summaryCtx.font = "14px sans-serif";
      summaryCtx.textAlign = "center";
      summaryCtx.fillText(`No voids in ${typeChips.length} chips`, patchSize / 2, statsY + statsH / 2 + 5);
    }

    return summaryCanvas;
  }

  /**
   * 모든 타입의 summary 마스크 생성
   */
  createAllTypeSummaryMasks() {
    const summaryMasks = new Map();

    // 모든 고유 타입들 추출
    const allTypes = [...new Set(this.allPatchPages.map(page => page.type))];
    console.log(`All patch pages count: ${this.allPatchPages.length}`);
    console.log(`Found unique types: ${allTypes.join(', ')}`);

    allTypes.forEach(chipType => {
      console.log(`Processing type: ${chipType}`);
      const summaryMask = this.createTypeSummaryMask(chipType);
      if (summaryMask) {
        summaryMasks.set(chipType, summaryMask);
        console.log(`Successfully created summary mask for type: ${chipType}`);
      } else {
        console.warn(`Failed to create summary mask for type: ${chipType}`);
      }
    });

    console.log(`Created summary masks for types: ${Array.from(summaryMasks.keys()).join(', ')}`);
    return summaryMasks;
  }

  /**
   * 특정 칩 좌표의 패치로 이동
   */
  async navigateToChipPatch(chipX, chipY) {
    if (this.allPatchPages.length === 0) return;

    // 해당 좌표의 패치 찾기
    const targetCoord = `(${chipX},${chipY})`;
    const patchIndex = this.allPatchPages.findIndex(
      (patch) => patch.coord === targetCoord
    );

    if (patchIndex !== -1) {
      this.currentPatchPage = patchIndex;
      await this.showPatchPage(patchIndex);
      await this.app.drawPage(); // 초록점 업데이트

      console.log(
        `Navigated to patch: ${targetCoord} (index: ${patchIndex})`
      );
    } else {
      console.log(`No patch found for coordinates: ${targetCoord}`);
    }
  }
}