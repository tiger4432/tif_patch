class QuickloadManager {
    constructor() {
        this.quickloadSlots = new Map();
        this.maxSlots = 5;
        this.init();
    }

    init() {
        this.loadFromStorage();
        this.setupEventListeners();
    }

    setupEventListeners() {
        // Quick save buttons
        for (let i = 1; i <= this.maxSlots; i++) {
            const saveBtn = document.getElementById(`quickSave${i}`);
            const loadBtn = document.getElementById(`quickLoad${i}`);

            if (saveBtn) {
                saveBtn.onclick = () => this.quickSave(i);
            }
            if (loadBtn) {
                loadBtn.onclick = () => this.quickLoad(i);
            }
        }

        // Folder load button
        const folderLoadBtn = document.getElementById('loadFromFolder');
        if (folderLoadBtn) {
            folderLoadBtn.onclick = () => this.loadFromFolder();
        }

        // Update display
        this.updateQuickloadDisplay();
    }

    quickSave(slotNumber) {
        try {
            // 패치가 추출되어 있는지 확인
            if (!window.waferApp?.patchManager?.allPatchPages ||
                window.waferApp.patchManager.allPatchPages.length === 0) {
                alert('저장할 패치 데이터가 없습니다. 먼저 Extract Patches를 실행해주세요.');
                return;
            }

            const saveData = this.serializeCurrentState();
            const timestamp = new Date().toLocaleString('ko-KR');

            const quickSaveData = {
                ...saveData,
                timestamp,
                slotNumber
            };

            this.quickloadSlots.set(slotNumber, quickSaveData);
            this.saveToStorage();
            this.updateQuickloadDisplay();

            console.log(`Quick Save ${slotNumber} 완료:`, saveData.metadata.tiffFileName);
            alert(`슬롯 ${slotNumber}에 저장 완료!\n파일: ${saveData.metadata.tiffFileName}\n패치: ${saveData.patches.length}개\n보이드: ${saveData.voids.length}개`);
        } catch (error) {
            console.error('Quick Save 실패:', error);
            alert('저장에 실패했습니다: ' + error.message);
        }
    }

    async quickLoad(slotNumber) {
        try {
            const saveData = this.quickloadSlots.get(slotNumber);
            if (!saveData) {
                alert(`슬롯 ${slotNumber}에 저장된 데이터가 없습니다.`);
                return;
            }

            await this.restoreAppState(saveData);
            console.log(`Quick Load ${slotNumber} 완료:`, saveData.metadata.tiffFileName);
            alert(`슬롯 ${slotNumber}에서 로드 완료!\n파일: ${saveData.metadata.tiffFileName}\n패치: ${saveData.patches.length}개`);
        } catch (error) {
            console.error('Quick Load 실패:', error);
            alert('로드에 실패했습니다: ' + error.message);
        }
    }

    serializeCurrentState() {
        const app = window.waferApp;

        // 패치 데이터 직렬화 (캔버스를 base64로 변환)
        const patches = app.patchManager.allPatchPages.map(page => ({
            coord: page.coord,
            type: page.type,
            layers: page.layers.map(layer => ({
                label: layer.label,
                type: layer.type,
                layer: layer.layer,
                canvasData: layer.canvas.toDataURL(), // Canvas를 base64로 변환
                imageData: this.imageDataToArray(layer.imageData) // ImageData 직렬화
            }))
        }));

        // 보이드 데이터
        const voids = app.voidManager.exportVoids();

        // 앱 상태 메타데이터
        const metadata = {
            tiffFileName: app.currentTiffFileName,
            currentPatchPage: app.patchManager.currentPatchPage,
            csvRows: app.csvRows,
            chipPoints: app.chipPoints,
            gridSettings: {
                cols: +document.getElementById('cols').value,
                rows: +document.getElementById('rows').value,
                cellW: +document.getElementById('cellW').value,
                cellH: +document.getElementById('cellH').value
            },
            origin: { ...app.origin },
            refGrid: { ...app.refGrid }
        };

        return {
            patches,
            voids,
            metadata,
            version: 'v2_quickload'
        };
    }

    async restoreAppState(saveData) {
        const app = window.waferApp;

        // 메타데이터 복원
        app.currentTiffFileName = saveData.metadata.tiffFileName;
        app.csvRows = saveData.metadata.csvRows;
        app.chipPoints = saveData.metadata.chipPoints;
        app.origin = { ...saveData.metadata.origin };
        app.refGrid = { ...saveData.metadata.refGrid };

        // UI 설정 복원
        document.getElementById('cols').value = saveData.metadata.gridSettings.cols;
        document.getElementById('rows').value = saveData.metadata.gridSettings.rows;
        document.getElementById('cellW').value = saveData.metadata.gridSettings.cellW;
        document.getElementById('cellH').value = saveData.metadata.gridSettings.cellH;

        // 패치 데이터 복원 (비동기 처리)
        const restoredPages = [];
        for (const page of saveData.patches) {
            const restoredLayers = [];
            for (const layer of page.layers) {
                const canvas = await this.base64ToCanvas(layer.canvasData);
                const imageData = this.arrayToImageData(layer.imageData);

                // void 이벤트 다시 연결
                app.attachVoidEvents(canvas, layer.label, imageData);

                restoredLayers.push({
                    canvas,
                    label: layer.label,
                    type: layer.type,
                    layer: layer.layer,
                    imageData
                });
            }

            restoredPages.push({
                coord: page.coord,
                type: page.type,
                layers: restoredLayers
            });
        }

        app.patchManager.allPatchPages = restoredPages;

        // allPatchCanvases도 복원 (FileSaveManager와 호환성 위해)
        window.allPatchCanvases = [];
        restoredPages.forEach(page => {
            page.layers.forEach(layer => {
                window.allPatchCanvases.push({
                    canvas: layer.canvas,
                    originalCanvas: layer.canvas, // 원본과 동일하게 설정
                    layer: layer.layer,
                    label: layer.label,
                    type: layer.type,
                    typeFolder: layer.type
                });
            });
        });

        // 보이드 데이터 복원
        app.voidManager.voids.clear();
        app.voidManager.voidIndexCounters.clear();
        app.loadVoidDataFromJson(saveData.voids);

        // 현재 패치 페이지 설정
        app.patchManager.currentPatchPage = saveData.metadata.currentPatchPage || 0;

        // UI 업데이트
        await app.patchManager.showPatchPage(app.patchManager.currentPatchPage);
        app.updateVoidJsonDisplay();

        console.log('Quick Load 완료: 패치와 보이드 데이터 복원됨');
    }

    async loadFromFolder() {
        const folderPath = document.getElementById('folderPath').value.trim();
        if (!folderPath) {
            alert('폴더 경로를 입력해주세요. (예: /extracted_patches_folder)');
            return;
        }

        try {
            const loadBtn = document.getElementById('loadFromFolder');
            const originalText = loadBtn.textContent;
            loadBtn.textContent = 'Loading...';
            loadBtn.disabled = true;

            console.log('폴더에서 로딩 시작:', folderPath);

            // 1. 메타데이터 로드
            const metadata = await this.loadMetadataFromFolder(folderPath);
            if (!metadata) {
                throw new Error('metadata.json 파일을 찾을 수 없습니다.');
            }

            // 2. 보이드 데이터 로드
            const voids = await this.loadVoidsFromFolder(folderPath);

            // 3. 패치 파일들을 스캔하여 구조 파악
            const patchStructure = await this.scanPatchStructure(folderPath);

            // 4. 패치 데이터 복원
            const restoredPatches = await this.reconstructPatchesFromFiles(folderPath, patchStructure);

            // 5. 앱 상태 복원
            const reconstructedData = {
                patches: restoredPatches,
                voids: voids,
                metadata: metadata,
                version: 'v2_folder_load'
            };

            await this.restoreAppState(reconstructedData);

            console.log('폴더 로딩 완료:', folderPath);
            alert(`폴더에서 로드 완료!\n경로: ${folderPath}\n패치: ${restoredPatches.length}개\n보이드: ${voids.length}개`);

            // CSV 영역도 업데이트 (coordinates 정보 표시)
            if (metadata.csvRows && metadata.csvRows.length > 0) {
                const csvText = this.generateCSVFromCoords(metadata.csvRows);
                document.getElementById('csvPaste').value = csvText;
            }

        } catch (error) {
            console.error('폴더 로딩 실패:', error);
            alert('폴더 로딩에 실패했습니다: ' + error.message);
        } finally {
            const loadBtn = document.getElementById('loadFromFolder');
            loadBtn.textContent = 'Load from Folder';
            loadBtn.disabled = false;
        }
    }

    async loadMetadataFromFolder(folderPath) {
        try {
            const response = await fetch(`http://localhost:8083${folderPath}/metadata.json`);
            if (!response.ok) throw new Error('metadata.json not found');
            return await response.json();
        } catch (error) {
            console.error('메타데이터 로딩 실패:', error);
            return null;
        }
    }

    async loadVoidsFromFolder(folderPath) {
        try {
            const response = await fetch(`http://localhost:8083${folderPath}/voids.json`);
            if (!response.ok) throw new Error('voids.json not found');
            return await response.json();
        } catch (error) {
            console.warn('보이드 데이터 없음:', error);
            return [];
        }
    }

    async scanPatchStructure(folderPath) {
        // no_voids 또는 split 폴더의 구조를 스캔하여 패치 정보 수집
        const structure = new Map(); // coord -> { type, layers: [layer1, layer2, ...] }

        try {
            // 먼저 coordinates.json에서 좌표 정보 가져오기
            const coordsResponse = await fetch(`http://localhost:8083${folderPath}/coordinates.json`);
            if (!coordsResponse.ok) throw new Error('coordinates.json not found');
            const coordinatesData = await coordsResponse.json();

            // coordinates 배열 추출 (coordinatesData.coordinates가 배열)
            const coordinates = coordinatesData.coordinates || coordinatesData;

            // 좌표별로 구조 초기화
            coordinates.forEach(coord => {
                const coordKey = `(${coord.x},${coord.y})`;
                structure.set(coordKey, {
                    type: coord.type || 'NA',
                    x: coord.x,
                    y: coord.y,
                    layers: []
                });
            });

            // no_voids 폴더가 있으면 우선 스캔, 없으면 split 폴더 스캔
            let scanFolder = 'no_voids';
            let typeFolders = await this.listDirectory(`${folderPath}/${scanFolder}`);

            if (typeFolders.length === 0) {
                console.log('no_voids 폴더가 없음, split 폴더 스캔 시도');
                scanFolder = 'split';
                typeFolders = await this.listDirectory(`${folderPath}/${scanFolder}`);
            }

            console.log(`${scanFolder} 폴더에서 ${typeFolders.length}개 타입 폴더 발견:`, typeFolders);

            for (const typeFolder of typeFolders) {
                const layerFolders = await this.listDirectory(`${folderPath}/${scanFolder}/${typeFolder}`);
                console.log(`${typeFolder} 타입에서 ${layerFolders.length}개 레이어 폴더 발견:`, layerFolders);

                for (const layerFolder of layerFolders) {
                    const layerMatch = layerFolder.match(/layer_(\d+)/);
                    if (!layerMatch) {
                        console.warn('레이어 폴더 패턴이 맞지 않음:', layerFolder);
                        continue;
                    }

                    const layerNum = parseInt(layerMatch[1]);
                    const patchFiles = await this.listFiles(`${folderPath}/${scanFolder}/${typeFolder}/${layerFolder}`);
                    console.log(`${layerFolder}에서 ${patchFiles.length}개 패치 파일 발견`);

                    // 각 패치 파일에서 좌표 추출
                    for (const fileName of patchFiles) {
                        // 파일명 패턴: X001_Y002_L01_LEG:good.png
                        const coordMatch = fileName.match(/X(-?\d+)_Y(-?\d+)_L\d+_LEG:/);
                        if (!coordMatch) {
                            console.warn('패치 파일명 패턴이 맞지 않음:', fileName);
                            continue;
                        }

                        const x = parseInt(coordMatch[1]);
                        const y = parseInt(coordMatch[2]);
                        const coordKey = `(${x},${y})`;

                        if (structure.has(coordKey)) {
                            structure.get(coordKey).layers.push({
                                layer: layerNum,
                                fileName: fileName,
                                type: typeFolder,
                                path: `${folderPath}/${scanFolder}/${typeFolder}/${layerFolder}/${fileName}`
                            });
                        } else {
                            console.warn(`좌표 ${coordKey}가 coordinates.json에 없음`);
                        }
                    }
                }
            }

            console.log(`총 ${structure.size}개 좌표의 패치 구조 스캔 완료`);
            return structure;
        } catch (error) {
            console.error('패치 구조 스캔 실패:', error);
            throw error;
        }
    }

    async listDirectory(path) {
        // Range 서버의 디렉토리 리스팅 기능 사용 (구현되어 있다고 가정)
        try {
            const response = await fetch(`http://localhost:8083${path}?list=true`);
            if (!response.ok) throw new Error(`Directory listing failed: ${path}`);
            const data = await response.json();
            return data.directories || [];
        } catch (error) {
            console.warn('디렉토리 리스팅 실패:', path, error);
            return [];
        }
    }

    async listFiles(path) {
        try {
            const response = await fetch(`http://localhost:8083${path}?list=true`);
            if (!response.ok) throw new Error(`File listing failed: ${path}`);
            const data = await response.json();
            return data.files || [];
        } catch (error) {
            console.warn('파일 리스팅 실패:', path, error);
            return [];
        }
    }

    async reconstructPatchesFromFiles(folderPath, patchStructure) {
        const reconstructedPatches = [];

        for (const [coordKey, patchInfo] of patchStructure.entries()) {
            const patchData = {
                coord: coordKey,
                type: patchInfo.type,
                layers: []
            };

            // 레이어 순서대로 정렬
            patchInfo.layers.sort((a, b) => a.layer - b.layer);

            for (const layerInfo of patchInfo.layers) {
                try {
                    // 이미지 파일을 캔버스로 로드
                    const canvas = await this.loadImageToCanvas(layerInfo.path);

                    // 라벨 생성
                    const label = this.generatePatchLabel(patchInfo.x, patchInfo.y, layerInfo.layer, patchInfo.type);

                    // ImageData 생성 (캔버스에서 추출)
                    const ctx = canvas.getContext('2d');
                    const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);

                    // void 이벤트 연결
                    window.waferApp.attachVoidEvents(canvas, label, imageData);

                    patchData.layers.push({
                        canvas: canvas,
                        label: label,
                        type: patchInfo.type,
                        layer: layerInfo.layer,
                        imageData: imageData
                    });

                } catch (error) {
                    console.error('패치 로딩 실패:', layerInfo.path, error);
                }
            }

            if (patchData.layers.length > 0) {
                reconstructedPatches.push(patchData);
            }
        }

        return reconstructedPatches;
    }

    async loadImageToCanvas(imagePath) {
        return new Promise((resolve, reject) => {
            const img = new Image();
            img.onload = function() {
                const canvas = document.createElement('canvas');
                canvas.width = img.width;
                canvas.height = img.height;
                const ctx = canvas.getContext('2d');
                ctx.drawImage(img, 0, 0);
                resolve(canvas);
            };
            img.onerror = () => reject(new Error(`이미지 로딩 실패: ${imagePath}`));
            img.src = `http://localhost:8083${imagePath}`;
        });
    }

    generatePatchLabel(x, y, layer, type) {
        const padCoord = (coord) => coord.toString().padStart(3, '0');
        return `X${padCoord(x)}_Y${padCoord(y)}_L${String(layer).padStart(2, '0')}_LEG:${type}`;
    }

    generateCSVFromCoords(csvRows) {
        // coordinates 데이터를 CSV 형태로 변환
        if (!csvRows || csvRows.length === 0) return '';

        // x, y 범위 계산
        const xValues = csvRows.map(r => r.x);
        const yValues = csvRows.map(r => r.y);
        const minX = Math.min(...xValues);
        const maxX = Math.max(...xValues);
        const minY = Math.min(...yValues);
        const maxY = Math.max(...yValues);

        // 2D 그리드 생성
        const grid = [];

        // 헤더 행 (X 좌표)
        const headerRow = [''];
        for (let x = minX; x <= maxX; x++) {
            headerRow.push(x.toString());
        }
        grid.push(headerRow.join('\t'));

        // 데이터 행들 (Y 좌표별)
        for (let y = minY; y <= maxY; y++) {
            const row = [y.toString()];

            for (let x = minX; x <= maxX; x++) {
                const coord = csvRows.find(r => r.x === x && r.y === y);
                row.push(coord ? (coord.type || 'good') : '');
            }

            grid.push(row.join('\t'));
        }

        return grid.join('\n');
    }

    imageDataToArray(imageData) {
        return {
            width: imageData.width,
            height: imageData.height,
            data: Array.from(imageData.data)
        };
    }

    arrayToImageData(arrayData) {
        const imageData = new ImageData(arrayData.width, arrayData.height);
        imageData.data.set(new Uint8ClampedArray(arrayData.data));
        return imageData;
    }

    async base64ToCanvas(base64Data) {
        return new Promise((resolve) => {
            const canvas = document.createElement('canvas');
            const ctx = canvas.getContext('2d');
            const img = new Image();

            img.onload = function() {
                canvas.width = img.width;
                canvas.height = img.height;
                ctx.drawImage(img, 0, 0);
                resolve(canvas);
            };

            img.onerror = function() {
                // 에러 시 빈 캔버스 반환
                canvas.width = 300;
                canvas.height = 340;
                resolve(canvas);
            };

            img.src = base64Data;
        });
    }

    updateQuickloadDisplay() {
        for (let i = 1; i <= this.maxSlots; i++) {
            const saveBtn = document.getElementById(`quickSave${i}`);
            const loadBtn = document.getElementById(`quickLoad${i}`);
            const slotInfo = document.getElementById(`slotInfo${i}`);

            const saveData = this.quickloadSlots.get(i);

            if (saveData) {
                if (slotInfo) {
                    slotInfo.innerHTML = `
                        <div style="font-size: 11px; color: #666;">
                            ${saveData.fileName}<br>
                            ${saveData.timestamp}
                        </div>
                    `;
                }
                if (loadBtn) {
                    loadBtn.disabled = false;
                    loadBtn.style.opacity = '1';
                }
            } else {
                if (slotInfo) {
                    slotInfo.innerHTML = '<div style="font-size: 11px; color: #999;">Empty</div>';
                }
                if (loadBtn) {
                    loadBtn.disabled = true;
                    loadBtn.style.opacity = '0.5';
                }
            }
        }
    }

    saveToStorage() {
        try {
            const data = {};
            this.quickloadSlots.forEach((value, key) => {
                data[key] = value;
            });
            localStorage.setItem('quickloadSlots', JSON.stringify(data));
        } catch (error) {
            console.error('로컬 스토리지 저장 실패:', error);
        }
    }

    loadFromStorage() {
        try {
            const data = localStorage.getItem('quickloadSlots');
            if (data) {
                const parsed = JSON.parse(data);
                Object.entries(parsed).forEach(([key, value]) => {
                    this.quickloadSlots.set(parseInt(key), value);
                });
            }
        } catch (error) {
            console.error('로컬 스토리지 로드 실패:', error);
        }
    }

    clearSlot(slotNumber) {
        this.quickloadSlots.delete(slotNumber);
        this.saveToStorage();
        this.updateQuickloadDisplay();
    }

    clearAllSlots() {
        if (confirm('모든 퀵로드 슬롯을 지우시겠습니까?')) {
            this.quickloadSlots.clear();
            this.saveToStorage();
            this.updateQuickloadDisplay();
        }
    }
}

// Global instance
window.quickloadManager = new QuickloadManager();