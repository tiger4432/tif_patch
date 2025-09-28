// 보이드 관리 클래스
import { VOID_COLORS, CONFIG } from '../js/constants.js';
import { parsePatchLabel, generatePatchLabel, removeDuplicateVoids } from '../js/utils.js';

export class VoidManager {
  constructor() {
    this.voidRecords = [];
    this.voidIdCounter = 0;
    this.voidGroupCounter = 0;
    this.syncMode = true;
    this.syncThrottleTimer = null;
    this.selectedVoid = null;
    this.resizeMode = false;
  }

  /**
   * 새로운 보이드 생성
   */
  createVoid(patchLabel, type, centerX, centerY, radiusX, radiusY) {
    const { chipCoord, layer } = parsePatchLabel(patchLabel);
    const groupId = ++this.voidGroupCounter;
    
    const newVoid = {
      id: ++this.voidIdCounter,
      groupId: groupId,
      patchLabel,
      chipCoord,
      layer,
      type,
      centerX,
      centerY,
      radiusX,
      radiusY,
    };
    
    this.voidRecords.push(newVoid);
    return newVoid;
  }

  /**
   * 보이드 삭제
   */
  deleteVoid(voidToDelete) {
    this.voidRecords = this.voidRecords.filter(v => v.id !== voidToDelete.id);
  }

  /**
   * 그룹 기반 보이드 업데이트
   */
  updateSyncedVoids(movedVoid) {
    if (!movedVoid || !this.syncMode) return;
    
    if (movedVoid.groupId) {
      this.voidRecords.forEach(v => {
        if (v.id === movedVoid.id) return;
        if (v.groupId === movedVoid.groupId) {
          v.centerX = movedVoid.centerX;
          v.centerY = movedVoid.centerY;
          v.radiusX = movedVoid.radiusX;
          v.radiusY = movedVoid.radiusY;
        }
      });
    } else {
      // 거리 기반 fallback
      const { chipCoord } = parsePatchLabel(movedVoid.patchLabel);
      
      this.voidRecords.forEach(v => {
        if (v.id === movedVoid.id) return;
        if (v.chipCoord !== chipCoord) return;
        if (v.type !== movedVoid.type) return;
        
        const distance = Math.sqrt(
          Math.pow(v.centerX - movedVoid.centerX, 2) + 
          Math.pow(v.centerY - movedVoid.centerY, 2)
        );
        
        if (distance < CONFIG.DISTANCE_THRESHOLD) {
          v.centerX = movedVoid.centerX;
          v.centerY = movedVoid.centerY;
          v.radiusX = movedVoid.radiusX;
          v.radiusY = movedVoid.radiusY;
        }
      });
    }
  }

  /**
   * 같은 칩의 모든 레이어에 보이드 동기화
   */
  syncToAllLayers(newVoid, allLayers) {
    if (!newVoid || !this.syncMode || !allLayers) return;
    
    allLayers.forEach(layerInfo => {
      if (layerInfo.label === newVoid.patchLabel) return;
      
      const existingVoid = this.voidRecords.find(v => 
        v.patchLabel === layerInfo.label && 
        v.groupId === newVoid.groupId
      );
      
      if (!existingVoid) {
        const { chipCoord, layer } = parsePatchLabel(layerInfo.label);
        const syncedVoid = {
          id: ++this.voidIdCounter,
          groupId: newVoid.groupId,
          patchLabel: layerInfo.label,
          chipCoord: chipCoord,
          layer: layer,
          type: newVoid.type,
          centerX: newVoid.centerX,
          centerY: newVoid.centerY,
          radiusX: newVoid.radiusX,
          radiusY: newVoid.radiusY,
        };
        
        this.voidRecords.push(syncedVoid);
      }
    });
  }

  /**
   * 특정 패치의 보이드들 가져오기
   */
  getVoidsForPatch(patchLabel) {
    return this.voidRecords.filter(v => v.patchLabel === patchLabel);
  }

  /**
   * 다른 레이어의 보이드들 가져오기 (점선용)
   */
  getOtherLayerVoids(chipCoord, layer) {
    return this.voidRecords.filter(v => v.chipCoord === chipCoord && v.layer !== layer);
  }

  /**
   * 칩별 보이드 머지
   */
  mergeChipVoids(allPages) {
    const voidsByChip = {};
    this.voidRecords.forEach(v => {
      if (!voidsByChip[v.chipCoord]) {
        voidsByChip[v.chipCoord] = [];
      }
      voidsByChip[v.chipCoord].push(v);
    });

    Object.keys(voidsByChip).forEach(chipCoord => {
      const chipVoids = voidsByChip[chipCoord];
      const uniqueVoids = removeDuplicateVoids(chipVoids);
      
      const chipLayers = this.getChipLayers(chipCoord, allPages);
      chipLayers.forEach(layer => {
        uniqueVoids.forEach(originalVoid => {
          const existingVoid = this.voidRecords.find(v => 
            v.chipCoord === chipCoord && 
            v.layer === layer &&
            Math.abs(v.centerX - originalVoid.centerX) < 5 &&
            Math.abs(v.centerY - originalVoid.centerY) < 5 &&
            v.type === originalVoid.type
          );
          
          if (!existingVoid) {
            const newPatchLabel = generatePatchLabel(chipCoord, layer);
            this.voidRecords.push({
              id: ++this.voidIdCounter,
              patchLabel: newPatchLabel,
              chipCoord: chipCoord,
              layer: layer,
              type: originalVoid.type,
              centerX: originalVoid.centerX,
              centerY: originalVoid.centerY,
              radiusX: originalVoid.radiusX,
              radiusY: originalVoid.radiusY,
            });
          }
        });
      });
    });
  }

  /**
   * 특정 칩의 모든 레이어 번호 가져오기
   */
  getChipLayers(chipCoord, allPages) {
    const layers = new Set();
    this.voidRecords.forEach(v => {
      if (v.chipCoord === chipCoord) {
        layers.add(v.layer);
      }
    });
    
    // 기본적으로 모든 페이지 레이어 포함
    if (allPages) {
      for (let i = 1; i <= allPages; i++) {
        layers.add(i);
      }
    }
    
    return Array.from(layers);
  }

  /**
   * 보이드 그리기
   */
  drawAllVoids(ctx, patchLabel) {
    ctx.lineWidth = 2;
    
    const { chipCoord, layer } = parsePatchLabel(patchLabel);
    
    // 현재 레이어의 보이드 (실선)
    this.getVoidsForPatch(patchLabel).forEach(v => {
      ctx.beginPath();
      const color = VOID_COLORS[v.type] || VOID_COLORS.default;
      ctx.strokeStyle = color;
      ctx.setLineDash([]);
      ctx.ellipse(v.centerX, v.centerY, v.radiusX, v.radiusY, 0, 0, 2 * Math.PI);
      ctx.stroke();
    });

    // 동기화 모드일 때 다른 레이어의 보이드 (점선)
    if (this.syncMode) {
      this.getOtherLayerVoids(chipCoord, layer).forEach(v => {
        ctx.beginPath();
        const color = VOID_COLORS[v.type] || VOID_COLORS.default;
        ctx.strokeStyle = color;
        ctx.globalAlpha = 0.5;
        ctx.setLineDash([5, 5]);
        ctx.ellipse(v.centerX, v.centerY, v.radiusX, v.radiusY, 0, 0, 2 * Math.PI);
        ctx.stroke();
        ctx.globalAlpha = 1.0;
        ctx.setLineDash([]);
      });
    }
  }

  /**
   * 동기화 모드 토글
   */
  toggleSyncMode() {
    this.syncMode = !this.syncMode;
    return this.syncMode;
  }

  /**
   * throttled 새로고침
   */
  throttledRefresh(refreshCallback) {
    if (!this.syncMode) return;
    
    if (this.syncThrottleTimer) {
      clearTimeout(this.syncThrottleTimer);
    }
    
    this.syncThrottleTimer = setTimeout(() => {
      refreshCallback();
      this.syncThrottleTimer = null;
    }, CONFIG.SYNC_THROTTLE_MS);
  }
}