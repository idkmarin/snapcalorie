const STORAGE_KEY = 'snapcalorie_state_v1';
const defaultState = {
  goal: 2000,
  meals: []
};

const state = loadState();
let manualMode = false;

const remainingEl = document.getElementById('remainingCalories');
const goalInput = document.getElementById('goalInput');
const mealPhoto = document.getElementById('mealPhoto');
const photoStatus = document.getElementById('photoStatus');
const mealForm = document.getElementById('mealForm');
const mealName = document.getElementById('mealName');
const mealCalories = document.getElementById('mealCalories');
const mealList = document.getElementById('mealList');
const manualModeBtn = document.getElementById('manualModeBtn');
const historyToggle = document.getElementById('historyToggle');
const historySheet = document.getElementById('historySheet');
const sheetHandle = document.getElementById('sheetHandle');

goalInput.value = state.goal;
render();
registerServiceWorker();

mealPhoto.addEventListener('change', () => {
  const file = mealPhoto.files?.[0];
  photoStatus.textContent = file ? `Photo ready: ${file.name}` : 'No photo selected yet.';
});

goalInput.addEventListener('change', () => {
  const nextGoal = Number(goalInput.value);
  if (!Number.isFinite(nextGoal) || nextGoal <= 0) {
    goalInput.value = state.goal;
    return;
  }
  state.goal = Math.round(nextGoal);
  persist();
  render();
});

manualModeBtn.addEventListener('click', () => {
  manualMode = !manualMode;
  manualModeBtn.textContent = manualMode
    ? 'Manual mode enabled'
    : 'Manual meal entry (forgot photo)';
  if (manualMode) {
    photoStatus.textContent = 'Manual mode: you can save without a photo.';
  } else if (!mealPhoto.files?.[0]) {
    photoStatus.textContent = 'No photo selected yet.';
  }
});

mealForm.addEventListener('submit', (event) => {
  event.preventDefault();
  const name = mealName.value.trim();
  const calories = Number(mealCalories.value);

  if (!name || !Number.isFinite(calories) || calories <= 0) {
    return;
  }

  if (!manualMode && !mealPhoto.files?.[0]) {
    photoStatus.textContent = 'Take a photo or enable manual mode first.';
    return;
  }

  state.meals.unshift({
    id: crypto.randomUUID(),
    name,
    calories: Math.round(calories),
    createdAt: new Date().toISOString(),
    source: manualMode ? 'manual' : 'camera'
  });

  mealForm.reset();
  mealPhoto.value = '';
  manualMode = false;
  manualModeBtn.textContent = 'Manual meal entry (forgot photo)';
  photoStatus.textContent = 'Meal saved.';

  persist();
  render();
});

historyToggle.addEventListener('click', () => toggleHistory(!historySheet.classList.contains('open')));

let touchStartY = null;
const onTouchStart = (event) => {
  touchStartY = event.changedTouches[0].clientY;
};

const onTouchEnd = (event) => {
  if (touchStartY === null) return;
  const delta = touchStartY - event.changedTouches[0].clientY;
  if (delta > 40) toggleHistory(true);
  if (delta < -40) toggleHistory(false);
  touchStartY = null;
};

[historySheet, sheetHandle].forEach((el) => {
  el.addEventListener('touchstart', onTouchStart, { passive: true });
  el.addEventListener('touchend', onTouchEnd, { passive: true });
});

mealList.addEventListener('click', (event) => {
  const target = event.target;
  if (!(target instanceof HTMLButtonElement)) return;
  const mealId = target.dataset.mealId;
  if (!mealId) return;

  if (target.dataset.action === 'delete') {
    state.meals = state.meals.filter((meal) => meal.id !== mealId);
    persist();
    render();
    return;
  }

  if (target.dataset.action === 'edit') {
    const meal = state.meals.find((entry) => entry.id === mealId);
    if (!meal) return;
    const nextName = prompt('Meal name', meal.name);
    if (nextName === null) return;
    const nextCaloriesText = prompt('Calories', String(meal.calories));
    if (nextCaloriesText === null) return;
    const nextCalories = Number(nextCaloriesText);
    if (!nextName.trim() || !Number.isFinite(nextCalories) || nextCalories <= 0) return;

    meal.name = nextName.trim();
    meal.calories = Math.round(nextCalories);
    persist();
    render();
  }
});

function render() {
  const usedCalories = state.meals.reduce((sum, meal) => sum + meal.calories, 0);
  const remaining = state.goal - usedCalories;

  remainingEl.textContent = String(remaining);
  goalInput.value = String(state.goal);

  if (state.meals.length === 0) {
    mealList.innerHTML = '<li class="meal-item">No meals yet. Start with your camera.</li>';
    return;
  }

  mealList.innerHTML = state.meals
    .map(
      (meal) => `
      <li class="meal-item">
        <div class="meal-row">
          <strong>${escapeHtml(meal.name)}</strong>
          <span>${meal.calories} kcal</span>
        </div>
        <small class="muted">${new Date(meal.createdAt).toLocaleString()} • ${meal.source}</small>
        <div class="meal-actions">
          <button data-action="edit" data-meal-id="${meal.id}">Edit</button>
          <button data-action="delete" data-meal-id="${meal.id}">Delete</button>
        </div>
      </li>`
    )
    .join('');
}

function toggleHistory(open) {
  historySheet.classList.toggle('open', open);
  historyToggle.setAttribute('aria-expanded', String(open));
  historySheet.setAttribute('aria-hidden', String(!open));
}

function loadState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { ...defaultState };
    const parsed = JSON.parse(raw);

    if (!Number.isFinite(parsed.goal) || !Array.isArray(parsed.meals)) {
      return { ...defaultState };
    }

    return {
      goal: Math.round(parsed.goal),
      meals: parsed.meals
        .filter((meal) => meal && typeof meal.name === 'string' && Number.isFinite(meal.calories))
        .map((meal) => ({
          id: typeof meal.id === 'string' ? meal.id : crypto.randomUUID(),
          name: meal.name,
          calories: Math.round(meal.calories),
          createdAt: typeof meal.createdAt === 'string' ? meal.createdAt : new Date().toISOString(),
          source: meal.source === 'manual' ? 'manual' : 'camera'
        }))
    };
  } catch {
    return { ...defaultState };
  }
}

function persist() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

function registerServiceWorker() {
  if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
      navigator.serviceWorker.register('/sw.js').catch(() => undefined);
    });
  }
}

function escapeHtml(text) {
  return text
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}
