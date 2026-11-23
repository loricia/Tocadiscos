// ===== Tocadiscos: lógica de reproducción y animaciones =====

// Ángulos del brazo (grados, giro respecto a la posición vertical)
const ARM_REST = 2;    // en su soporte, fuera del disco
const ARM_START = 28;  // aguja en el borde exterior del vinilo
const ARM_END = 45;    // aguja cerca de la etiqueta (final de la canción)
const ARM_MOVE_MS = 900; // coincide con la transición CSS del brazo

// Colores del anillo de la etiqueta: magenta, cian, ámbar, violeta
const LABEL_HUES = [330, 182, 41, 270];

const SPEEDS = {
  33: { rate: 1, spin: '1.8s' },
  45: { rate: 1.35, spin: '1.33s' },
};

const $ = (id) => document.getElementById(id);
const audio = $('audio');
const deck = $('deck');
const root = document.documentElement;

const ui = {
  vinyl: $('vinyl'), arm: $('arm'), labelTitle: $('labelTitle'),
  speedBtn: $('speedBtn'), speedValue: $('speedValue'),
  trackTitle: $('trackTitle'), trackSub: $('trackSub'),
  seek: $('seek'), currentTime: $('currentTime'), duration: $('duration'),
  play: $('playBtn'), prev: $('prevBtn'), next: $('nextBtn'), stop: $('stopBtn'),
  shuffle: $('shuffleBtn'), repeat: $('repeatBtn'), volume: $('volume'),
  fileInput: $('fileInput'), playlist: $('playlist'), empty: $('empty'),
  count: $('count'), dropOverlay: $('dropOverlay'),
};

const state = {
  tracks: [],        // { id, name, url, duration, hue }
  current: -1,
  shuffle: false,
  repeat: 'off',     // 'off' | 'all' | 'one'
  speed: 33,
  changing: false,   // el brazo se está levantando para cambiar de disco
  seeking: false,
};

let nextId = 1;
let changeTimer = null;

// ===== Utilidades =====
function formatTime(sec) {
  if (!isFinite(sec) || sec < 0) return '0:00';
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${m}:${String(s).padStart(2, '0')}`;
}

function cleanName(fileName) {
  return fileName.replace(/\.[^.]+$/, '').replace(/[_]+/g, ' ').trim() || fileName;
}

function isPlaying() {
  return !audio.paused && !audio.ended;
}

// ===== Animación: brazo y vinilo =====
function updateArm() {
  let angle = ARM_REST;
  if (isPlaying() && !state.changing) {
    const progress = audio.duration ? audio.currentTime / audio.duration : 0;
    angle = ARM_START + (ARM_END - ARM_START) * Math.min(Math.max(progress, 0), 1);
  }
  root.style.setProperty('--arm-angle', `${angle}deg`);
}

function updatePlayingState() {
  const playing = isPlaying() && !state.changing;
  deck.classList.toggle('is-playing', playing);
  ui.play.classList.toggle('playing', isPlaying());
  ui.play.setAttribute('aria-label', isPlaying() ? 'Pausar' : 'Reproducir');
  const active = ui.playlist.querySelector('li.active');
  if (active) active.classList.toggle('playing', playing);
  updateArm();
}

// ===== Carga de archivos =====
function addFiles(fileList) {
  const files = [...fileList].filter((f) => f.type.startsWith('audio/') || /\.(mp3|wav|ogg|m4a|aac|flac|opus|webm)$/i.test(f.name));
  if (!files.length) return;

  for (const file of files) {
    const track = {
      id: nextId++,
      name: cleanName(file.name),
      url: URL.createObjectURL(file),
      duration: NaN,
      hue: LABEL_HUES[(nextId - 2) % LABEL_HUES.length],
    };
    state.tracks.push(track);

    // Leer la duración sin reproducir
    const probe = new Audio();
    probe.preload = 'metadata';
    probe.src = track.url;
    probe.addEventListener('loadedmetadata', () => {
      track.duration = probe.duration;
      renderPlaylist();
    }, { once: true });
  }

  renderPlaylist();
  if (state.current === -1) loadTrack(0);
  updateControls();
}

// ===== Lista de reproducción =====
function renderPlaylist() {
  ui.playlist.innerHTML = '';
  state.tracks.forEach((t, i) => {
    const li = document.createElement('li');
    li.style.setProperty('--hue', t.hue);
    if (i === state.current) {
      li.classList.add('active');
      if (isPlaying() && !state.changing) li.classList.add('playing');
    }

    const disc = document.createElement('span');
    disc.className = 'mini-disc';
    const title = document.createElement('span');
    title.className = 'pl-title';
    title.textContent = t.name;
    title.title = t.name;
    const time = document.createElement('span');
    time.className = 'pl-time';
    time.textContent = isFinite(t.duration) ? formatTime(t.duration) : '–:––';
    const remove = document.createElement('button');
    remove.className = 'pl-remove';
    remove.type = 'button';
    remove.textContent = '×';
    remove.setAttribute('aria-label', `Quitar ${t.name}`);
    remove.addEventListener('click', (e) => {
      e.stopPropagation();
      removeTrack(i);
    });

    li.append(disc, title, time, remove);
    li.addEventListener('click', () => playIndex(i));
    ui.playlist.append(li);
  });

  ui.count.textContent = state.tracks.length;
  ui.empty.hidden = state.tracks.length > 0;
}

function removeTrack(i) {
  const [removed] = state.tracks.splice(i, 1);
  URL.revokeObjectURL(removed.url);

  if (!state.tracks.length) {
    clearTimeout(changeTimer);
    state.changing = false;
    audio.pause();
    audio.removeAttribute('src');
    audio.load();
    state.current = -1;
    showTrackInfo();
  } else if (i === state.current) {
    const wasPlaying = isPlaying();
    const nextIndex = Math.min(i, state.tracks.length - 1);
    state.current = -1;
    loadTrack(nextIndex);
    if (wasPlaying) play();
  } else if (i < state.current) {
    state.current--;
  }

  renderPlaylist();
  updateControls();
  updatePlayingState();
}

// ===== Reproducción =====
function loadTrack(i) {
  const t = state.tracks[i];
  if (!t) return;
  state.current = i;
  audio.src = t.url;
  applySpeed();
  root.style.setProperty('--label-hue', t.hue);
  showTrackInfo();
  renderPlaylist();
}

function showTrackInfo() {
  const t = state.tracks[state.current];
  if (!t) {
    ui.trackTitle.textContent = 'Ninguna canción cargada';
    ui.trackSub.textContent = 'Arrastra tus canciones aquí o pulsa «Añadir canciones»';
    ui.labelTitle.textContent = 'Sin disco';
    ui.seek.value = 0;
    ui.currentTime.textContent = '0:00';
    ui.duration.textContent = '0:00';
    return;
  }
  ui.trackTitle.textContent = t.name;
  ui.trackSub.textContent = `Pista ${state.current + 1} de ${state.tracks.length}`;
  ui.labelTitle.textContent = t.name;
}

function play() {
  if (state.current === -1 && state.tracks.length) loadTrack(0);
  if (state.current === -1) return;
  audio.play().catch((err) => {
    if (err.name === 'AbortError') return; // se cambió de pista mientras cargaba
    ui.trackSub.textContent = 'No se puede reproducir este archivo (formato no compatible)';
  });
}

function togglePlay() {
  if (state.changing) return;
  if (isPlaying()) audio.pause();
  else play();
}

function stop() {
  clearTimeout(changeTimer);
  state.changing = false;
  audio.pause();
  if (audio.src) audio.currentTime = 0;
  updatePlayingState();
}

// Cambiar de pista: si estaba sonando, el brazo se levanta, vuelve a su
// soporte, se cambia el disco y la aguja vuelve a bajar.
function playIndex(i) {
  if (!state.tracks[i]) return;
  clearTimeout(changeTimer);

  if (isPlaying() || state.changing) {
    state.changing = true;
    audio.pause(); // al levantar la aguja deja de sonar
    updatePlayingState();
    changeTimer = setTimeout(() => {
      state.changing = false;
      loadTrack(i);
      play();
    }, ARM_MOVE_MS);
  } else {
    loadTrack(i);
    play();
  }
}

function randomIndex() {
  if (state.tracks.length < 2) return state.current;
  let r;
  do { r = Math.floor(Math.random() * state.tracks.length); } while (r === state.current);
  return r;
}

function next(auto = false) {
  const n = state.tracks.length;
  if (!n) return;
  if (state.shuffle) return playIndex(randomIndex());
  const last = state.current >= n - 1;
  if (last && auto && state.repeat === 'off') {
    stop();
    return;
  }
  playIndex(last ? 0 : state.current + 1);
}

function prev() {
  const n = state.tracks.length;
  if (!n) return;
  if (audio.currentTime > 3) {
    audio.currentTime = 0;
    return;
  }
  if (state.shuffle) return playIndex(randomIndex());
  playIndex(state.current <= 0 ? n - 1 : state.current - 1);
}

// ===== Velocidad (33 / 45 RPM) =====
function applySpeed() {
  const s = SPEEDS[state.speed];
  audio.preservesPitch = false; // como un vinilo real: más rápido = más agudo
  audio.playbackRate = s.rate;
  root.style.setProperty('--spin-duration', s.spin);
  ui.speedValue.textContent = state.speed;
  ui.speedBtn.classList.toggle('fast', state.speed === 45);
}

ui.speedBtn.addEventListener('click', () => {
  state.speed = state.speed === 33 ? 45 : 33;
  applySpeed();
});

// ===== Controles =====
function updateControls() {
  const has = state.tracks.length > 0;
  [ui.play, ui.prev, ui.next, ui.stop, ui.seek].forEach((el) => { el.disabled = !has; });
}

ui.play.addEventListener('click', togglePlay);
ui.next.addEventListener('click', () => next());
ui.prev.addEventListener('click', prev);
ui.stop.addEventListener('click', stop);
ui.vinyl.addEventListener('click', togglePlay);
ui.arm.addEventListener('click', togglePlay);

ui.shuffle.addEventListener('click', () => {
  state.shuffle = !state.shuffle;
  ui.shuffle.setAttribute('aria-pressed', state.shuffle);
});

ui.repeat.addEventListener('click', () => {
  state.repeat = { off: 'all', all: 'one', one: 'off' }[state.repeat];
  audio.loop = state.repeat === 'one';
  ui.repeat.setAttribute('aria-pressed', state.repeat !== 'off');
  ui.repeat.classList.toggle('one', state.repeat === 'one');
  ui.repeat.title = { off: 'Repetir: no', all: 'Repetir: todas', one: 'Repetir: una' }[state.repeat];
});

ui.volume.addEventListener('input', () => { audio.volume = Number(ui.volume.value); });
audio.volume = Number(ui.volume.value);

// Barra de progreso
ui.seek.addEventListener('input', () => {
  state.seeking = true;
  if (audio.duration) {
    ui.currentTime.textContent = formatTime((ui.seek.value / 1000) * audio.duration);
  }
});
ui.seek.addEventListener('change', () => {
  if (audio.duration) {
    deck.classList.add('is-seeking');
    audio.currentTime = (ui.seek.value / 1000) * audio.duration;
    setTimeout(() => deck.classList.remove('is-seeking'), 200);
  }
  state.seeking = false;
});

// ===== Eventos del audio =====
audio.addEventListener('play', updatePlayingState);
audio.addEventListener('playing', updatePlayingState);
audio.addEventListener('pause', updatePlayingState);
audio.addEventListener('ended', () => {
  updatePlayingState();
  next(true);
});
audio.addEventListener('loadedmetadata', () => {
  ui.duration.textContent = formatTime(audio.duration);
  const t = state.tracks[state.current];
  if (t && !isFinite(t.duration)) {
    t.duration = audio.duration;
    renderPlaylist();
  }
});
audio.addEventListener('timeupdate', () => {
  if (!state.seeking) {
    ui.currentTime.textContent = formatTime(audio.currentTime);
    ui.seek.value = audio.duration ? Math.round((audio.currentTime / audio.duration) * 1000) : 0;
  }
  updateArm();
});
audio.addEventListener('error', () => {
  if (state.current !== -1 && audio.getAttribute('src')) {
    ui.trackSub.textContent = 'No se puede reproducir este archivo (formato no compatible)';
  }
});

// ===== Añadir archivos: botón y arrastrar y soltar =====
ui.fileInput.addEventListener('change', () => {
  addFiles(ui.fileInput.files);
  ui.fileInput.value = '';
});

let dragDepth = 0;
window.addEventListener('dragenter', (e) => {
  if (![...e.dataTransfer.types].includes('Files')) return;
  e.preventDefault();
  dragDepth++;
  ui.dropOverlay.classList.add('visible');
});
window.addEventListener('dragover', (e) => e.preventDefault());
window.addEventListener('dragleave', () => {
  dragDepth = Math.max(0, dragDepth - 1);
  if (!dragDepth) ui.dropOverlay.classList.remove('visible');
});
window.addEventListener('drop', (e) => {
  e.preventDefault();
  dragDepth = 0;
  ui.dropOverlay.classList.remove('visible');
  if (e.dataTransfer.files.length) addFiles(e.dataTransfer.files);
});

// ===== Atajos de teclado =====
document.addEventListener('keydown', (e) => {
  const tag = e.target.tagName;
  const inRange = tag === 'INPUT' && e.target.type === 'range';
  if (tag === 'TEXTAREA' || (tag === 'INPUT' && !inRange)) return;
  if (!state.tracks.length) return;

  switch (e.code) {
    case 'Space':
      if (tag === 'BUTTON') return; // el botón enfocado ya responde al espacio
      e.preventDefault();
      togglePlay();
      break;
    case 'ArrowRight':
    case 'ArrowLeft':
      if (inRange) return;
      e.preventDefault();
      if (audio.duration) {
        const delta = e.code === 'ArrowRight' ? 5 : -5;
        audio.currentTime = Math.min(Math.max(audio.currentTime + delta, 0), audio.duration);
      }
      break;
    case 'ArrowUp':
    case 'ArrowDown':
      if (inRange) return;
      e.preventDefault();
      audio.volume = Math.min(Math.max(audio.volume + (e.code === 'ArrowUp' ? 0.05 : -0.05), 0), 1);
      ui.volume.value = audio.volume;
      break;
  }
});

// Estado inicial
renderPlaylist();
updateControls();
updatePlayingState();
