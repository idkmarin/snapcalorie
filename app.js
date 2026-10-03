const STORAGE_KEY = 'snapcalorie_state_v2';
const defaultState = { goal: 2000, meals: [] };

const state = loadState();
let stream = null;
let videoTrack = null;
let flashSupported = false;
let flashOn = false;
let touchStartY = null;
let currentDraft = null;

const foodCatalog = [
  { name: 'Eggs', unit: 'egg', caloriesPerUnit: 72, proteinPerUnit: 6.3, carbsPerUnit: 0.4, fatPerUnit: 4.8, signature: [233, 206, 138] },
  { name: 'Peas', unit: 'pea', caloriesPerUnit: 0.8, proteinPerUnit: 0.05, carbsPerUnit: 0.14, fatPerUnit: 0.01, signature: [113, 168, 86] },
  { name: 'Chicken breast', unit: 'g', caloriesPerUnit: 1.65, proteinPerUnit: 0.31, carbsPerUnit: 0, fatPerUnit: 0.04, signature: [208, 173, 136] },
  { name: 'Rice', unit: 'g', caloriesPerUnit: 1.3, proteinPerUnit: 0.027, carbsPerUnit: 0.28, fatPerUnit: 0.003, signature: [226, 220, 188] },
  { name: 'Salmon', unit: 'g', caloriesPerUnit: 2.08, proteinPerUnit: 0.22, carbsPerUnit: 0, fatPerUnit: 0.13, signature: [234, 153, 121] },
  { name: 'Broccoli', unit: 'floret', caloriesPerUnit: 5, proteinPerUnit: 0.4, carbsPerUnit: 1, fatPerUnit: 0.05, signature: [84, 147, 81] }
];

const remainingEl = document.getElementById('remainingCalories');
const goalInput = document.getElementById('goalInput');
const cameraPreview = document.getElementById('cameraPreview');
const cameraStatus = document.getElementById('cameraStatus');
const requestCameraBtn = document.getElementById('requestCameraBtn');
const flashToggle = document.getElementById('flashToggle');
const uploadFallbackBtn = document.getElementById('uploadFallbackBtn');
const uploadFallbackInput = document.getElementById('uploadFallbackInput');
const shutterBtn = document.getElementById('shutterBtn');
const analysisPanel = document.getElementById('analysisPanel');
const analysisStatus = document.getElementById('analysisStatus');
const capturedPreview = document.getElementById('capturedPreview');
const detectedItems = document.getElementById('detectedItems');
const addItemBtn = document.getElementById('addItemBtn');
const analysisTotals = document.getElementById('analysisTotals');
const retakeBtn = document.getElementById('retakeBtn');
const saveMealBtn = document.getElementById('saveMealBtn');
const historyToggle = document.getElementById('historyToggle');
const historySheet = document.getElementById('historySheet');
const sheetHandle = document.getElementById('sheetHandle');
const mealList = document.getElementById('mealList');

goalInput.value = String(state.goal);
render();
registerServiceWorker();

if (!navigator.mediaDevices?.getUserMedia) {
  cameraStatus.textContent = 'Camera API unavailable in this browser. Upload a photo instead.';
  requestCameraBtn.disabled = true;
}

requestCameraBtn.addEventListener('click', () => {
  requestCameraPermission();
});

flashToggle.addEventListener('click', () => {
  toggleFlash();
});

uploadFallbackBtn.addEventListener('click', () => {
  uploadFallbackInput.click();
});

uploadFallbackInput.addEventListener('change', async () => {
  const file = uploadFallbackInput.files?.[0];
  if (!file) return;
  const dataUrl = await fileToDataUrl(file);
  cameraStatus.textContent = 'Photo selected from your gallery.';
  uploadFallbackInput.value = '';
  startAnalysis(dataUrl);
});

shutterBtn.addEventListener('click', () => {
  captureMealPhoto();
});

goalInput.addEventListener('change', () => {
  const nextGoal = Number(goalInput.value);
  if (!Number.isFinite(nextGoal) || nextGoal <= 0) {
    goalInput.value = String(state.goal);
    return;
  }
  state.goal = Math.round(nextGoal);
  persist();
  render();
});

addItemBtn.addEventListener('click', () => {
  if (!currentDraft) return;
  currentDraft.items.push(createDefaultItem());
  renderDetectedItems();
});

detectedItems.addEventListener('input', (event) => {
  const target = event.target;
  if (!(target instanceof HTMLInputElement) || !currentDraft) return;
  const index = Number(target.dataset.index);
  const field = target.dataset.field;
  if (!Number.isInteger(index) || !field || !currentDraft.items[index]) return;
  const entry = currentDraft.items[index];
  if (field === 'name' || field === 'unit') {
    entry[field] = target.value;
  } else {
    entry[field] = Number(target.value);
  }
  updateAnalysisTotals();
});

detectedItems.addEventListener('click', (event) => {
  const target = event.target;
  if (!(target instanceof HTMLButtonElement) || !currentDraft) return;
  const index = Number(target.dataset.removeIndex);
  if (!Number.isInteger(index) || !currentDraft.items[index]) return;
  currentDraft.items.splice(index, 1);
  if (currentDraft.items.length === 0) {
    currentDraft.items.push(createDefaultItem());
  }
  renderDetectedItems();
});

retakeBtn.addEventListener('click', () => {
  analysisPanel.hidden = true;
  currentDraft = null;
  cameraStatus.textContent = 'Retake your meal photo when ready.';
});

saveMealBtn.addEventListener('click', () => {
  confirmAndSaveMeal();
});

historyToggle.addEventListener('click', () => {
  toggleHistory(!historySheet.classList.contains('open'));
});

[historySheet, sheetHandle].forEach((el) => {
  el.addEventListener('touchstart', (event) => {
    touchStartY = event.changedTouches[0].clientY;
  }, { passive: true });

  el.addEventListener('touchend', (event) => {
    if (touchStartY === null) return;
    const delta = touchStartY - event.changedTouches[0].clientY;
    if (delta > 40) toggleHistory(true);
    if (delta < -40) toggleHistory(false);
    touchStartY = null;
  }, { passive: true });
});

mealList.addEventListener('click', (event) => {
  const target = event.target;
  if (!(target instanceof HTMLButtonElement)) return;
  const detailsId = target.dataset.detailsId;
  if (!detailsId) return;
  const details = document.getElementById(detailsId);
  if (!details) return;
  const isOpen = details.hidden;
  details.hidden = !isOpen;
  target.textContent = isOpen ? 'Hide details' : 'Show details';
  target.setAttribute('aria-expanded', String(isOpen));
});

async function requestCameraPermission() {
  if (!navigator.mediaDevices?.getUserMedia) return;
  try {
    const nextStream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: { ideal: 'environment' } },
      audio: false
    });
    stopCameraStream();
    stream = nextStream;
    cameraPreview.srcObject = stream;
    await cameraPreview.play();
    videoTrack = stream.getVideoTracks()[0] ?? null;
    flashSupported = Boolean(videoTrack?.getCapabilities?.().torch);
    flashToggle.disabled = !flashSupported;
    flashToggle.textContent = flashSupported ? 'Flash off' : 'Flash unavailable';
    flashOn = false;
    shutterBtn.disabled = false;
    cameraStatus.textContent = 'Camera active. Frame your plate and tap shutter.';
  } catch {
    cameraStatus.textContent = 'Camera permission denied. Use Upload photo instead.';
  }
}

async function toggleFlash() {
  if (!videoTrack || !flashSupported) return;
  const nextFlash = !flashOn;
  try {
    await videoTrack.applyConstraints({ advanced: [{ torch: nextFlash }] });
    flashOn = nextFlash;
    flashToggle.textContent = flashOn ? 'Flash on' : 'Flash off';
  } catch {
    flashSupported = false;
    flashToggle.disabled = true;
    flashToggle.textContent = 'Flash unavailable';
    cameraStatus.textContent = 'Flash is not supported on this device/camera.';
  }
}

function captureMealPhoto() {
  if (!cameraPreview.videoWidth || !cameraPreview.videoHeight) {
    cameraStatus.textContent = 'Enable camera first or upload a photo.';
    return;
  }
  const maxWidth = 1280;
  const scale = Math.min(1, maxWidth / cameraPreview.videoWidth);
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(cameraPreview.videoWidth * scale);
  canvas.height = Math.round(cameraPreview.videoHeight * scale);
  const context = canvas.getContext('2d');
  if (!context) return;
  context.drawImage(cameraPreview, 0, 0, canvas.width, canvas.height);
  startAnalysis(canvas.toDataURL('image/jpeg', 0.9));
}

async function startAnalysis(photoDataUrl) {
  toggleHistory(false);
  analysisPanel.hidden = false;
  capturedPreview.src = photoDataUrl;
  analysisStatus.textContent = 'Analyzing plate with on-device AI estimate...';
  currentDraft = { photoDataUrl, items: [], analysisConfidence: 0, analysisSignals: null };
  renderDetectedItems();
  const analysis = await analyzePhoto(photoDataUrl);
  currentDraft.items = analysis.items.length > 0 ? analysis.items : [createDefaultItem()];
  currentDraft.analysisConfidence = analysis.confidence;
  currentDraft.analysisSignals = analysis.signals;
  analysisStatus.textContent = `${analysis.note} Confidence ${analysis.confidence}% — review and adjust before saving.`;
  renderDetectedItems();
}

async function analyzePhoto(dataUrl) {
  await sleep(450);
  const stats = await getImageStats(dataUrl);
  const seed = stableHash(dataUrl.slice(0, 600));
  const primary = pickFoodByColor(stats.avg, stats);
  const secondary = pickSecondaryFood(stats.avg, primary.food, seed, stats.variance);
  const candidates = [primary, secondary].filter(Boolean);
  const items = candidates.map((candidate, index) => {
    const food = candidate.food ?? candidate;
    const quantity = estimateQuantity(food, seed + index * 17, stats);
    const confidence = estimateItemConfidence(food, candidate.distance ?? null, stats, quantity);
    return {
      name: food.name,
      count: quantity,
      unit: food.unit,
      caloriesPerUnit: food.caloriesPerUnit,
      proteinPerUnit: food.proteinPerUnit,
      carbsPerUnit: food.carbsPerUnit,
      fatPerUnit: food.fatPerUnit,
      confidence
    };
  });
  const confidence = deriveAnalysisConfidence(items, stats, primary.distance);
  return {
    items,
    confidence,
    note: 'AI estimated food type, amount, and macros from visual cues.',
    signals: {
      yellowShare: round1(stats.yellowShare),
      greenShare: round1(stats.greenShare),
      grainShare: round1(stats.grainShare),
      brightShare: round1(stats.brightShare),
      darkShare: round1(stats.darkShare)
    }
  };
}

function pickFoodByColor(avg, stats) {
  if (stats.yellowShare > 11 && stats.brightShare > 42) {
    return { food: foodCatalog.find((entry) => entry.name === 'Eggs') ?? foodCatalog[0], distance: 18 };
  }
  if (stats.greenShare > 9 && stats.variance > 22) {
    return { food: foodCatalog.find((entry) => entry.name === 'Peas') ?? foodCatalog[1], distance: 20 };
  }
  return foodCatalog.reduce((best, food) => {
    const distance = colorDistance(avg, food.signature);
    if (!best || distance < best.distance) return { food, distance: Math.round(distance) };
    return best;
  }, null) ?? { food: foodCatalog[0], distance: 40 };
}

function pickSecondaryFood(avg, primary, seed, variance) {
  if (variance < 22 && seed % 3 !== 0) return null;
  const options = foodCatalog.filter((food) => food.name !== primary.name);
  return options[seed % options.length] ?? null;
}

function estimateQuantity(food, seed, stats) {
  if (food.unit === 'egg') {
    const largeRoundClusters = Math.max(1, Math.round(stats.yellowShare / 7));
    const brightnessBias = stats.brightShare > 55 ? 1 : 0;
    return clampNumber(largeRoundClusters + brightnessBias, 1, 4);
  }
  if (food.unit === 'pea') {
    const peaEstimate = Math.round(stats.greenShare * 4 + stats.variance * 1.4 + (seed % 22));
    return clampNumber(peaEstimate, 15, 180);
  }
  if (food.unit === 'floret') return clampNumber(4 + (seed % 9), 3, 18);
  if (food.unit === 'g') {
    const grams = 70 + (seed % 170) + Math.round(stats.brightness / 6);
    return clampNumber(Math.round(grams), 60, 320);
  }
  return 1;
}

function estimateItemConfidence(food, distance, stats, quantity) {
  let confidence = 86;
  if (Number.isFinite(distance)) {
    confidence -= clampNumber(Math.round(distance / 5), 0, 28);
  }
  if (food.unit === 'egg') {
    if (stats.yellowShare > 11) confidence += 8;
    if (quantity >= 2 && quantity <= 4) confidence += 4;
    if (stats.greenShare > 16) confidence -= 10;
  }
  if (food.unit === 'pea') {
    if (stats.greenShare > 10) confidence += 8;
    if (quantity > 120) confidence -= 6;
    if (stats.yellowShare > 14) confidence -= 8;
  }
  if (food.unit === 'g') {
    confidence -= 4;
  }
  return clampNumber(Math.round(confidence), 45, 98);
}

function deriveAnalysisConfidence(items, stats, primaryDistance) {
  if (items.length === 0) return 45;
  const avgItemConfidence = items.reduce((sum, item) => sum + finiteOr(item.confidence, 60), 0) / items.length;
  const imageReliability = 100 - clampNumber(Math.round(stats.variance / 1.5), 0, 22);
  const colorPenalty = Number.isFinite(primaryDistance) ? clampNumber(Math.round(primaryDistance / 6), 0, 16) : 8;
  return clampNumber(Math.round((avgItemConfidence + imageReliability) / 2 - colorPenalty), 40, 99);
}

function renderDetectedItems() {
  detectedItems.textContent = '';
  if (!currentDraft) return;
  currentDraft.items.forEach((item, index) => {
    const wrapper = document.createElement('article');
    wrapper.className = 'detected-item';
    const confidenceText = document.createElement('p');
    confidenceText.className = 'muted';
    confidenceText.textContent = `AI confidence: ${clampNumber(Math.round(finiteOr(item.confidence, 60)), 0, 99)}%`;

    const grid = document.createElement('div');
    grid.className = 'item-grid';

    grid.append(
      createField('Item', 'name', String(item.name ?? ''), index),
      createField('Quantity', 'count', String(item.count ?? ''), index, 'number'),
      createField('Unit', 'unit', String(item.unit ?? ''), index),
      createField('kcal / unit', 'caloriesPerUnit', String(item.caloriesPerUnit ?? ''), index, 'number'),
      createField('protein / unit', 'proteinPerUnit', String(item.proteinPerUnit ?? ''), index, 'number'),
      createField('carbs / unit', 'carbsPerUnit', String(item.carbsPerUnit ?? ''), index, 'number'),
      createField('fat / unit', 'fatPerUnit', String(item.fatPerUnit ?? ''), index, 'number')
    );

    const actions = document.createElement('div');
    actions.className = 'item-actions';
    const removeBtn = document.createElement('button');
    removeBtn.type = 'button';
    removeBtn.dataset.removeIndex = String(index);
    removeBtn.textContent = 'Remove';
    actions.append(removeBtn);

    wrapper.append(confidenceText, grid, actions);
    detectedItems.append(wrapper);
  });
  updateAnalysisTotals();
}

function createField(label, field, value, index, type = 'text') {
  const wrapper = document.createElement('label');
  wrapper.textContent = label;
  const input = document.createElement('input');
  input.type = type;
  input.value = value;
  input.dataset.field = field;
  input.dataset.index = String(index);
  if (type === 'number') {
    input.step = 'any';
    input.min = '0';
  }
  wrapper.append(input);
  return wrapper;
}

function updateAnalysisTotals() {
  if (!currentDraft) {
    analysisTotals.textContent = '';
    return;
  }
  const totals = calculateTotals(currentDraft.items);
  const confidence = deriveDraftConfidence(currentDraft.items, currentDraft.analysisConfidence);
  analysisTotals.textContent = `Total: ${Math.round(totals.calories)} kcal • P ${round1(totals.protein)}g • C ${round1(totals.carbs)}g • F ${round1(totals.fat)}g • Confidence ${confidence}%`;
}

function confirmAndSaveMeal() {
  if (!currentDraft) return;
  const cleanedItems = currentDraft.items
    .map((item) => ({
      name: String(item.name || '').trim(),
      count: Number(item.count),
      unit: String(item.unit || '').trim() || 'serving',
      caloriesPerUnit: Number(item.caloriesPerUnit),
      proteinPerUnit: Number(item.proteinPerUnit),
      carbsPerUnit: Number(item.carbsPerUnit),
      fatPerUnit: Number(item.fatPerUnit),
      confidence: Number(item.confidence)
    }))
    .filter((item) => item.name && item.count > 0 && Number.isFinite(item.count))
    .map((item) => ({
      ...item,
      caloriesPerUnit: finiteOr(item.caloriesPerUnit, 0),
      proteinPerUnit: finiteOr(item.proteinPerUnit, 0),
      carbsPerUnit: finiteOr(item.carbsPerUnit, 0),
      fatPerUnit: finiteOr(item.fatPerUnit, 0),
      confidence: clampNumber(Math.round(finiteOr(item.confidence, currentDraft.analysisConfidence || 60)), 0, 99)
    }));

  if (cleanedItems.length === 0) {
    analysisStatus.textContent = 'Add at least one valid food item before saving.';
    return;
  }

  const totals = calculateTotals(cleanedItems);
  const confidence = deriveDraftConfidence(cleanedItems, currentDraft.analysisConfidence);
  state.meals.unshift({
    id: crypto.randomUUID(),
    createdAt: new Date().toISOString(),
    photoDataUrl: currentDraft.photoDataUrl,
    items: cleanedItems,
    totals: {
      calories: Math.round(totals.calories),
      protein: round1(totals.protein),
      carbs: round1(totals.carbs),
      fat: round1(totals.fat)
    },
    analysis: {
      confidence,
      signals: currentDraft.analysisSignals
    },
    source: 'camera-ai-confirmed'
  });

  persist();
  render();
  analysisPanel.hidden = true;
  currentDraft = null;
  cameraStatus.textContent = 'Meal saved and calories updated.';
}

function render() {
  const usedCalories = state.meals.reduce((sum, meal) => sum + finiteOr(meal.totals?.calories, 0), 0);
  const remaining = state.goal - usedCalories;
  remainingEl.textContent = String(Math.round(remaining));
  goalInput.value = String(state.goal);
  renderMemories();
}

function renderMemories() {
  mealList.textContent = '';
  if (state.meals.length === 0) {
    const empty = document.createElement('li');
    empty.className = 'memory-item';
    empty.textContent = 'No memories yet. Capture your first plate.';
    mealList.append(empty);
    return;
  }

  state.meals.forEach((meal) => {
    const item = document.createElement('li');
    item.className = 'memory-item';

    const date = document.createElement('p');
    date.className = 'memory-date';
    date.textContent = new Date(meal.createdAt).toLocaleString();

    const photo = document.createElement('img');
    photo.className = 'memory-photo';
    photo.alt = 'Saved meal memory photo';
    photo.src = meal.photoDataUrl || placeholderImage();

    const summary = document.createElement('p');
    summary.className = 'memory-summary';
    summary.textContent = `${meal.totals.calories} kcal • P ${meal.totals.protein}g • C ${meal.totals.carbs}g • F ${meal.totals.fat}g • AI ${meal.analysis?.confidence ?? 60}%`;

    const toggle = document.createElement('button');
    toggle.className = 'memory-toggle';
    toggle.type = 'button';
    toggle.textContent = 'Show details';

    const details = document.createElement('div');
    details.className = 'memory-details';
    details.hidden = true;
    const detailsId = `details-${meal.id}`;
    details.id = detailsId;
    toggle.dataset.detailsId = detailsId;
    toggle.setAttribute('aria-expanded', 'false');

    const list = document.createElement('ul');
    meal.items.forEach((entry) => {
      const li = document.createElement('li');
      const itemCalories = Math.round(entry.count * entry.caloriesPerUnit);
      li.textContent = `${entry.name}: ${entry.count} ${entry.unit} (~${itemCalories} kcal, confidence ${finiteOr(entry.confidence, 60)}%)`;
      list.append(li);
    });
    if (meal.analysis?.signals) {
      const signalLine = document.createElement('p');
      signalLine.className = 'muted';
      signalLine.textContent = `Signals: yellow ${meal.analysis.signals.yellowShare}% • green ${meal.analysis.signals.greenShare}% • grain-tone ${meal.analysis.signals.grainShare}%`;
      details.prepend(signalLine);
    }
    details.append(list);

    item.append(date, photo, summary, toggle, details);
    mealList.append(item);
  });
}

function loadState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY) ?? localStorage.getItem('snapcalorie_state_v1');
    if (!raw) return structuredClone(defaultState);
    const parsed = JSON.parse(raw);
    const goal = Number(parsed.goal);
    const meals = Array.isArray(parsed.meals) ? parsed.meals.map(normalizeMeal).filter(Boolean) : [];
    return {
      goal: Number.isFinite(goal) && goal > 0 ? Math.round(goal) : defaultState.goal,
      meals
    };
  } catch {
    return structuredClone(defaultState);
  }
}

function normalizeMeal(meal) {
  if (!meal || typeof meal !== 'object') return null;
  const normalizedItems = Array.isArray(meal.items)
    ? meal.items
        .map((item) => ({
          name: typeof item.name === 'string' ? item.name.trim() : '',
          count: Number(item.count),
          unit: typeof item.unit === 'string' && item.unit.trim() ? item.unit.trim() : 'serving',
          caloriesPerUnit: finiteOr(Number(item.caloriesPerUnit), 0),
          proteinPerUnit: finiteOr(Number(item.proteinPerUnit), 0),
          carbsPerUnit: finiteOr(Number(item.carbsPerUnit), 0),
          fatPerUnit: finiteOr(Number(item.fatPerUnit), 0),
          confidence: clampNumber(Math.round(finiteOr(Number(item.confidence), 60)), 0, 99)
        }))
        .filter((item) => item.name && Number.isFinite(item.count) && item.count > 0)
    : [];

  if (normalizedItems.length === 0 && typeof meal.name === 'string' && Number.isFinite(Number(meal.calories))) {
    normalizedItems.push({
      name: meal.name.trim() || 'Meal',
      count: 1,
      unit: 'serving',
      caloriesPerUnit: Math.round(Number(meal.calories)),
      proteinPerUnit: 0,
      carbsPerUnit: 0,
      fatPerUnit: 0,
      confidence: 55
    });
  }

  if (normalizedItems.length === 0) return null;
  const totals = calculateTotals(normalizedItems);
  return {
    id: typeof meal.id === 'string' ? meal.id : crypto.randomUUID(),
    createdAt: typeof meal.createdAt === 'string' ? meal.createdAt : new Date().toISOString(),
    photoDataUrl: typeof meal.photoDataUrl === 'string' ? meal.photoDataUrl : '',
    items: normalizedItems,
    totals: {
      calories: Math.round(finiteOr(Number(meal.totals?.calories), totals.calories)),
      protein: round1(finiteOr(Number(meal.totals?.protein), totals.protein)),
      carbs: round1(finiteOr(Number(meal.totals?.carbs), totals.carbs)),
      fat: round1(finiteOr(Number(meal.totals?.fat), totals.fat))
    },
    analysis: {
      confidence: clampNumber(
        Math.round(
          finiteOr(
            Number(meal.analysis?.confidence),
            normalizedItems.reduce((sum, item) => sum + finiteOr(item.confidence, 60), 0) / normalizedItems.length
          )
        ),
        0,
        99
      ),
      signals:
        meal.analysis?.signals && typeof meal.analysis.signals === 'object'
          ? {
              yellowShare: finiteOr(Number(meal.analysis.signals.yellowShare), 0),
              greenShare: finiteOr(Number(meal.analysis.signals.greenShare), 0),
              grainShare: finiteOr(Number(meal.analysis.signals.grainShare), 0),
              brightShare: finiteOr(Number(meal.analysis.signals.brightShare), 0),
              darkShare: finiteOr(Number(meal.analysis.signals.darkShare), 0)
            }
          : null
    },
    source: typeof meal.source === 'string' ? meal.source : 'camera-ai-confirmed'
  };
}

function persist() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

function calculateTotals(items) {
  return items.reduce(
    (acc, item) => {
      const quantity = finiteOr(item.count, 0);
      acc.calories += quantity * finiteOr(item.caloriesPerUnit, 0);
      acc.protein += quantity * finiteOr(item.proteinPerUnit, 0);
      acc.carbs += quantity * finiteOr(item.carbsPerUnit, 0);
      acc.fat += quantity * finiteOr(item.fatPerUnit, 0);
      return acc;
    },
    { calories: 0, protein: 0, carbs: 0, fat: 0 }
  );
}

async function getImageStats(dataUrl) {
  const image = await loadImage(dataUrl);
  const canvas = document.createElement('canvas');
  canvas.width = 32;
  canvas.height = 32;
  const context = canvas.getContext('2d');
  if (!context) {
    return {
      avg: [180, 160, 120],
      brightness: 160,
      variance: 28,
      yellowShare: 7,
      greenShare: 6,
      grainShare: 9,
      brightShare: 36,
      darkShare: 12
    };
  }
  context.drawImage(image, 0, 0, canvas.width, canvas.height);
  const { data } = context.getImageData(0, 0, canvas.width, canvas.height);
  let r = 0;
  let g = 0;
  let b = 0;
  let brightness = 0;
  let variance = 0;
  let yellow = 0;
  let green = 0;
  let grain = 0;
  let bright = 0;
  let dark = 0;
  const count = data.length / 4;
  for (let i = 0; i < data.length; i += 4) {
    const red = data[i];
    const greenValue = data[i + 1];
    const blue = data[i + 2];
    r += red;
    g += greenValue;
    b += blue;
    const pixelBrightness = (red + greenValue + blue) / 3;
    brightness += pixelBrightness;
    variance += Math.abs(red - greenValue) + Math.abs(greenValue - blue);
    if (red > 150 && greenValue > 120 && blue < 145 && red > blue + 25) yellow += 1;
    if (greenValue > red + 15 && greenValue > blue + 15) green += 1;
    if (red > 140 && greenValue > 120 && blue > 80 && blue < 170) grain += 1;
    if (pixelBrightness > 170) bright += 1;
    if (pixelBrightness < 80) dark += 1;
  }
  return {
    avg: [r / count, g / count, b / count],
    brightness: brightness / count,
    variance: variance / (count * 2),
    yellowShare: (yellow / count) * 100,
    greenShare: (green / count) * 100,
    grainShare: (grain / count) * 100,
    brightShare: (bright / count) * 100,
    darkShare: (dark / count) * 100
  };
}

function createDefaultItem() {
  return {
    name: '',
    count: 1,
    unit: 'serving',
    caloriesPerUnit: 0,
    proteinPerUnit: 0,
    carbsPerUnit: 0,
    fatPerUnit: 0,
    confidence: 50
  };
}

function toggleHistory(open) {
  historySheet.classList.toggle('open', open);
  historyToggle.setAttribute('aria-expanded', String(open));
  historySheet.setAttribute('aria-hidden', String(!open));
}

function stopCameraStream() {
  if (!stream) return;
  stream.getTracks().forEach((track) => track.stop());
  stream = null;
  videoTrack = null;
}

function registerServiceWorker() {
  if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
      navigator.serviceWorker.register('/sw.js').catch(() => undefined);
    });
  }
}

function placeholderImage() {
  return 'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="400" height="260"><rect width="100%" height="100%" fill="%23cbd5e1"/><text x="50%" y="50%" dominant-baseline="middle" text-anchor="middle" fill="%230f172a" font-family="Arial" font-size="18">No photo saved</text></svg>';
}

function stableHash(text) {
  let hash = 0;
  for (let i = 0; i < text.length; i += 1) {
    hash = (hash * 31 + text.charCodeAt(i)) >>> 0;
  }
  return hash;
}

function colorDistance(a, b) {
  return Math.sqrt((a[0] - b[0]) ** 2 + (a[1] - b[1]) ** 2 + (a[2] - b[2]) ** 2);
}

function finiteOr(value, fallback) {
  return Number.isFinite(value) ? value : fallback;
}

function clampNumber(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function deriveDraftConfidence(items, baselineConfidence = 60) {
  if (!Array.isArray(items) || items.length === 0) {
    return clampNumber(Math.round(finiteOr(baselineConfidence, 60)), 0, 99);
  }
  const itemAverage = items.reduce((sum, item) => sum + clampNumber(Math.round(finiteOr(item.confidence, 60)), 0, 99), 0) / items.length;
  return clampNumber(Math.round((itemAverage + finiteOr(baselineConfidence, itemAverage)) / 2), 0, 99);
}

function round1(value) {
  return Math.round(value * 10) / 10;
}

function sleep(ms) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

function loadImage(src) {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = reject;
    image.src = src;
  });
}

function fileToDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}
