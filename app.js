// ============================================================
// CONFIG
// ============================================================
const EXPERIMENT_CONFIG = {
  fixationMinMs: 500,
  stimulusDurationMs: 5000,
  preloadTimeoutMs: 15000,
  cacheTrialsAhead: 1,
  videoMuted: true,
  videoPlaysInline: true,

  googleScriptUrl: "https://script.google.com/macros/s/AKfycbwblulXoXKB2D0XqFCVHurkKCtWHGyvza4AnH9AotXXHWedzhqKTRiBSc4kx3k04IXr/exec",
  saveToGoogleDrive: true,

  maleVideosCsvPath: "maleVideos.csv",
  femaleVideosCsvPath: "femaleVideos.csv",
  conditionCsvPath: "conditionFile.csv",
  scalesFolder: "scales",

  // Block 1 is always first. Blocks 2-4 are randomized by default.
  randomizeBlocksAfterBlock1: true,

  // DEVELOPER TESTING:
  // Leave these as null for real participants.
  // Set debugStartAtBlockId to 1, 2, 3, or 4 to jump to the first trial in that block.
  // You can also use URL parameters like: index.html?block=2 or index.html?trial=10
  debugStartAtBlockId: null,
  debugStartAtTrialIndex: null,

  // DEVELOPER TESTING:
  // Set to null for real participants.
  // Set to 1 to run only 1 trial per block.
  debugTrialsPerBlock: null,

  // Optional participant ID prompt at start.
  askForParticipantId: true,

  // If true, Block 1 generates the actual set of 12 videos for each condition row.
  // Later blocks reuse those same 12 videos, but reshuffle their positions.
  reuseBlock1VideoSetsAcrossBlocks: true,

  // Scale filenames can be corrected here if needed.
  scaleDefinitions: {
    // ratioScale uses letter responses a-m.
    ratioScale: { text: "Ratio", image: "scales/ratioScale.png", responseKeys: ["a","b","c","d","e","f","g","h","i","j","k","l","m"] },

    // gender uses 0/1 if this scale is added to any block later.
    gender: { text: "Gender", image: "scales/gender.png", responseKeys: ["0", "1"] },
    genderScale: { text: "Gender", image: "scales/genderScale.png", responseKeys: ["0", "1"] },

    mascScale: { text: "Masculinity", image: "scales/mascScale.png", min: 1, max: 7, step: 1 },
    typicalityScale: { text: "Typicality", image: "scales/typicalityScale.png", min: 1, max: 7, step: 1 },
    like1: { text: "Liking", image: "scales/like1.png", min: 1, max: 7, step: 1 },
    power1: { text: "Power 1", image: "scales/power1.png", min: 1, max: 7, step: 1 },
    power2: { text: "Power 2", image: "scales/power2.png", min: 1, max: 7, step: 1 },
    power3: { text: "Power 3", image: "scales/power3.png", min: 1, max: 7, step: 1 },
    power4: { text: "Power 4", image: "scales/power4.png", min: 1, max: 7, step: 1 },
    power5: { text: "Power 5", image: "scales/power5.png", min: 1, max: 7, step: 1 },
    power6: { text: "Power 6", image: "scales/power6.png", min: 1, max: 7, step: 1 }
  }
};

// ============================================================
// UTILITIES
// ============================================================
const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));
const nowMs = () => performance.now();

function shuffleArray(array) {
  const out = array.slice();
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

function sampleWithReplacement(array, count) {
  if (!array.length) throw new Error("Cannot sample from an empty video list.");
  const out = [];
  for (let i = 0; i < count; i++) {
    out.push(array[Math.floor(Math.random() * array.length)]);
  }
  return out;
}

function sampleWithoutReplacementIfPossible(array, count) {
  if (!array.length) throw new Error("Cannot sample from an empty video list.");
  if (count <= array.length) return shuffleArray(array).slice(0, count);
  return sampleWithReplacement(array, count);
}

function preloadImage(src) {
  return new Promise((resolve) => {
    if (!src) return resolve(null);
    const img = new Image();
    img.onload = () => resolve(src);
    img.onerror = () => {
      console.warn("Question image failed to preload:", src);
      resolve(null);
    };
    img.src = src;
  });
}

function safeJsonStringify(obj) {
  return JSON.stringify(obj, null, 2);
}

function downloadTextFile(filename, text, mimeType = "application/json") {
  const blob = new Blob([text], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

function escapeCsvValue(value) {
  const str = String(value ?? "");
  if (/[",\n]/.test(str)) return `"${str.replace(/"/g, '""')}"`;
  return str;
}

// ============================================================
// CSV LOADING
// ============================================================
async function loadCsvRows(csvPath) {
  const response = await fetch(csvPath, { cache: "no-store" });
  if (!response.ok) throw new Error(`Failed to load CSV: ${csvPath} (${response.status})`);

  const csvText = await response.text();
  const rows = parseCsv(csvText);
  if (rows.length < 2) throw new Error(`CSV must contain a header row and data rows: ${csvPath}`);

  const headers = rows[0].map(h => h.trim());
  const objects = [];

  for (let r = 1; r < rows.length; r++) {
    const row = rows[r];
    if (row.every(cell => String(cell).trim() === "")) continue;

    const obj = {};
    for (let c = 0; c < headers.length; c++) {
      obj[headers[c]] = (row[c] ?? "").trim();
    }
    objects.push(obj);
  }

  return objects;
}

function parseCsv(text) {
  const rows = [];
  let row = [];
  let cell = "";
  let inQuotes = false;

  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    const next = text[i + 1];

    if (inQuotes) {
      if (char === '"' && next === '"') {
        cell += '"';
        i++;
      } else if (char === '"') {
        inQuotes = false;
      } else {
        cell += char;
      }
    } else {
      if (char === '"') inQuotes = true;
      else if (char === ",") { row.push(cell); cell = ""; }
      else if (char === "\n") { row.push(cell); rows.push(row); row = []; cell = ""; }
      else if (char === "\r") {}
      else cell += char;
    }
  }

  row.push(cell);
  rows.push(row);
  return rows;
}

// ============================================================
// DYNAMIC TRIAL GENERATION
// ============================================================
async function buildExperimentTrials(config) {
  const [maleRows, femaleRows, conditionRows] = await Promise.all([
    loadCsvRows(config.maleVideosCsvPath),
    loadCsvRows(config.femaleVideosCsvPath),
    loadCsvRows(config.conditionCsvPath)
  ]);

  const maleVideos = maleRows.map((row, idx) => ({ id: `M${idx + 1}`, url: row.video_file, gender: "M" })).filter(v => v.url);
  const femaleVideos = femaleRows.map((row, idx) => ({ id: `F${idx + 1}`, url: row.video_file, gender: "F" })).filter(v => v.url);

  if (!maleVideos.length) throw new Error("No male videos found in maleVideos.csv");
  if (!femaleVideos.length) throw new Error("No female videos found in femaleVideos.csv");

  const ratioConditions = conditionRows
    .filter(row => String(row.video_trial || "1") === "1")
    .map((row, index) => ({
      conditionIndex: index,
      numF: Number(row.num_F),
      numM: Number(row.num_M),
      ratioLabel: `${row.num_F}:${row.num_M}`,
      sourceRow: row
    }));

  if (!ratioConditions.length) throw new Error("No video-trial rows found in conditionFile.csv");

  // Generate the base video groups once. Later blocks reuse these groups but shuffle placement.
  const baseVideoSets = ratioConditions.map(condition => {
    const femaleSet = sampleWithoutReplacementIfPossible(femaleVideos, condition.numF);
    const maleSet = sampleWithoutReplacementIfPossible(maleVideos, condition.numM);
    return shuffleArray([...femaleSet, ...maleSet]);
  });

  const block1Scales = ["ratioScale", ...shuffleArray(["mascScale", "typicalityScale"] )];
  const powerOrderForBlock2 = shuffleArray(["power1", "power2", "power3", "power4", "power5", "power6"]);
  const powerOrderForBlock3 = shuffleArray(["power1", "power2", "power3", "power4", "power5", "power6"]);

  const blockSpecs = [
    { blockId: 1, blockName: "Block 1", scaleKeys: block1Scales },
    { blockId: 2, blockName: "Block 2", scaleKeys: powerOrderForBlock2 },
    { blockId: 3, blockName: "Block 3", scaleKeys: powerOrderForBlock3 },
    { blockId: 4, blockName: "Block 4", scaleKeys: ["like1"] }
  ];

  const laterBlocks = config.randomizeBlocksAfterBlock1
    ? shuffleArray(blockSpecs.slice(1))
    : blockSpecs.slice(1);
  const finalBlockOrder = [blockSpecs[0], ...laterBlocks];

  const trials = [];
  const blockOrderLog = finalBlockOrder.map(b => b.blockId).join("-");

  for (const blockSpec of finalBlockOrder) {
    const randomizedConditions = shuffleArray(ratioConditions);
    let withinBlockTrialIndex = 0;

    for (const condition of randomizedConditions) {
      const baseVideos = baseVideoSets[condition.conditionIndex];
      const videosForThisTrial = shuffleArray(baseVideos).map((videoMeta, slotIndex) => ({
        id: videoMeta.id,
        label: `Clip ${slotIndex + 1}`,
        url: videoMeta.url,
        gender: videoMeta.gender,
        originalVideoId: videoMeta.id
      }));

      const questions = blockSpec.scaleKeys.map((scaleKey, questionIndex) => {
        const def = config.scaleDefinitions[scaleKey];
        if (!def) throw new Error(`Missing scale definition for ${scaleKey}`);
        return {
          questionIndex,
          scaleKey,
          text: def.text || scaleKey,
          image: def.image || `${config.scalesFolder}/${scaleKey}.png`,
          min: Number(def.min ?? 1),
          max: Number(def.max ?? 7),
          step: Number(def.step ?? 1),
          responseKeys: Array.isArray(def.responseKeys) ? def.responseKeys.slice() : null,
          lowLabel: def.lowLabel || "",
          highLabel: def.highLabel || ""
        };
      });

      trials.push({
        trialId: `B${blockSpec.blockId}_C${condition.conditionIndex + 1}_${condition.ratioLabel}`,
        meta: {
          blockId: blockSpec.blockId,
          blockName: blockSpec.blockName,
          blockOrder: blockOrderLog,
          withinBlockTrialIndex,
          conditionIndex: condition.conditionIndex,
          numF: condition.numF,
          numM: condition.numM,
          ratioLabel: condition.ratioLabel,
          scaleOrder: blockSpec.scaleKeys.join("|")
        },
        videos: videosForThisTrial,
        questions
      });

      withinBlockTrialIndex += 1;
    }
  }

  let finalTrials = trials;

  const params = new URLSearchParams(window.location.search);

  let debugTrialsPerBlock = config.debugTrialsPerBlock;

  const debugTrialsParam = params.get("debug_trials");

  if (
    debugTrialsParam !== null &&
    debugTrialsParam !== ""
  ) {
    debugTrialsPerBlock = Number(debugTrialsParam);
  }

  if (
    debugTrialsPerBlock !== null &&
    debugTrialsPerBlock !== undefined
  ) {
    const limit = Number(debugTrialsPerBlock);
    const countsByBlock = {};
    finalTrials = [];

    for (const trial of trials) {
      const blockId = trial.meta.blockId;
      countsByBlock[blockId] = countsByBlock[blockId] || 0;

      if (countsByBlock[blockId] < limit) {
        finalTrials.push(trial);
        countsByBlock[blockId] += 1;
      }
    }

    console.warn(`DEVELOPER TEST MODE: limiting to ${limit} trial(s) per block.`);
  }

  return {
    trials: finalTrials,
    buildInfo: {
      maleVideoCount: maleVideos.length,
      femaleVideoCount: femaleVideos.length,
      conditionCount: ratioConditions.length,
      totalTrials: finalTrials.length,
      blockOrder: blockOrderLog,
      block1ScaleOrder: block1Scales.join("|"),
      block2PowerOrder: powerOrderForBlock2.join("|"),
      block3PowerOrder: powerOrderForBlock3.join("|")
    }
  };
}

// ============================================================
// SIMPLE IN-MEMORY VIDEO CACHE
// ============================================================
class VideoCacheManager {
  constructor() {
    this.cache = new Map();
    this.inFlight = new Map();
  }

  hasTrial(trialIndex) { return this.cache.has(trialIndex); }
  getTrial(trialIndex) { return this.cache.get(trialIndex) || null; }

  async preloadTrial(trialIndex, trialDef, onProgress = null) {
    if (this.cache.has(trialIndex)) return this.cache.get(trialIndex);
    if (this.inFlight.has(trialIndex)) return this.inFlight.get(trialIndex);

    const promise = this._downloadTrial(trialIndex, trialDef, onProgress);
    this.inFlight.set(trialIndex, promise);

    try {
      const result = await promise;
      this.cache.set(trialIndex, result);
      return result;
    } finally {
      this.inFlight.delete(trialIndex);
    }
  }

  async _downloadTrial(trialIndex, trialDef, onProgress = null) {
    const out = [];
    const total = trialDef.videos.length;

    for (let i = 0; i < total; i++) {
      const meta = trialDef.videos[i];
      if (onProgress) onProgress({ done: i, total, label: meta.label, phase: "fetching" });

      const response = await fetch(meta.url, { cache: "force-cache" });
      if (!response.ok) throw new Error(`Failed to fetch video: ${meta.url} (${response.status})`);

      const blob = await response.blob();
      const objectUrl = URL.createObjectURL(blob);
      out.push({ blob, objectUrl, meta });

      if (onProgress) onProgress({ done: i + 1, total, label: meta.label, phase: "ready" });
    }

    return out;
  }

  cleanupTrial(trialIndex) {
    const items = this.cache.get(trialIndex);
    if (!items) return;
    for (const item of items) if (item.objectUrl) URL.revokeObjectURL(item.objectUrl);
    this.cache.delete(trialIndex);
  }

  cleanupAll() {
    for (const trialIndex of this.cache.keys()) this.cleanupTrial(trialIndex);
  }
}

function makeSessionId() {
  return "sess_" + Date.now() + "_" + Math.random().toString(36).slice(2, 10);
}

// ============================================================
// EXPERIMENT CONTROLLER
// ============================================================
class ExperimentController {
  constructor(config) {
    this.config = config;
    this.trials = config.trials;
    this.currentTrialIndex = Number.isInteger(config.startTrialIndex) ? config.startTrialIndex - 1 : -1;
    this.phase = "welcome";
    this.cache = new VideoCacheManager();

    this.data = {
      participantId: "",
      participantStartIso: null,
      participantStartLocal: null,
      participantStartTimestampMs: null,
      sessionId: makeSessionId(),
      experimentStartPerf: null,
      experimentEndPerf: null,
      browser: navigator.userAgent,
      configSnapshot: {
        fixationMinMs: config.fixationMinMs,
        stimulusDurationMs: config.stimulusDurationMs,
        preloadTimeoutMs: config.preloadTimeoutMs,
        buildInfo: config.buildInfo || {}
      },
      trials: []
    };

    this.screens = {
      welcome: document.getElementById("welcome-screen"),
      fixation: document.getElementById("fixation-screen"),
      grid: document.getElementById("grid-screen"),
      questions: document.getElementById("questions-screen"),
      saving: document.getElementById("saving-screen"),
      goodbye: document.getElementById("goodbye-screen")
    };

    this.fixationStatus = document.getElementById("fixation-status");
    this.videoGrid = document.getElementById("video-grid");
    this.trialCounter = document.getElementById("trial-counter");
    this.gridTimer = document.getElementById("grid-timer");
    this.finalDataPreview = document.getElementById("final-data-preview");
    this.responseInstruction = document.getElementById("response-instruction");
    this.questionImage = document.getElementById("question-image");

    this.currentQuestionIndex = 0;
    this.currentTrialQuestions = [];
    this.currentTrialResponses = [];
    this.currentQuestionStartPerf = null;
    this.acceptingQuestionInput = false;
    this.videoElements = [];
    this.currentGridItems = [];

    this._buildReusableGrid();
    this._wireEvents();
  }

  _wireEvents() {
    document.getElementById("start-btn").addEventListener("click", () => {
      this.startExperiment().catch(err => {
        console.error(err);
        alert(`Experiment error: ${err.message || err}`);
      });
    });

    document.getElementById("download-json-btn").addEventListener("click", () => this.downloadData());
    document.getElementById("download-csv-btn").addEventListener("click", () => this.downloadCSV());
    document.getElementById("restart-btn").addEventListener("click", () => window.location.reload());

    document.addEventListener("keydown", (event) => {
      this.handleQuestionKeypress(event).catch(err => {
        console.error(err);
        alert(`Experiment error: ${err.message || err}`);
      });
    });
  }

  async saveCsvToGoogleDrive() {

    const csvText = this.makeCSVText();

    const payload = {
      action: "save_experiment_csv",
      participant_id: this.data.participantId || "unknown",
      session_id: this.data.sessionId || "",
      csv: csvText
    };

    const body = new URLSearchParams();
    body.set("payload", JSON.stringify(payload));

    const response = await fetch(this.config.googleScriptUrl, {
      method: "POST",
      body
    });

    const text = await response.text();

    let result = null;

    try {
      result = JSON.parse(text);
    }
    catch (err) {
      throw new Error("Non-JSON response from Google Script: " + text);
    }

    if (!result || result.status !== "ok") {
      throw new Error(result?.message || "Failed to save CSV.");
    }

    return result;
  }

  _buildReusableGrid() {
    this.videoGrid.innerHTML = "";
    this.videoElements = [];

    for (let i = 0; i < 12; i++) {
      const cell = document.createElement("div");
      cell.className = "video-cell";

      const video = document.createElement("video");
      video.muted = !!this.config.videoMuted;
      video.playsInline = !!this.config.videoPlaysInline;
      video.preload = "auto";
      video.disablePictureInPicture = true;
      video.controls = false;
      video.loop = false;
      video.crossOrigin = "anonymous";

      const label = document.createElement("div");
      label.className = "video-label";
      label.textContent = `Clip ${i + 1}`;

      cell.appendChild(video);
      // cell.appendChild(label); // used for testing/debugging slot labels
      this.videoGrid.appendChild(cell);
      this.videoElements.push({ video, label, cell });
    }
  }

  showScreen(name) {
    for (const key of Object.keys(this.screens)) {
      this.screens[key].classList.toggle("active", key === name);
    }
    this.phase = name;
  }

  async startExperiment() {
    const params = new URLSearchParams(window.location.search);

    const participantParam = params.get("participant");

    if (participantParam !== null && participantParam !== "") {
      this.data.participantId = participantParam;
    }
    else if (this.config.askForParticipantId) {
      const enteredId = window.prompt("Enter participant ID:", "");
      this.data.participantId = enteredId || "";
    }

    const startDate = new Date();

    this.data.participantStartIso = startDate.toISOString();
    this.data.participantStartLocal = startDate.toLocaleString();
    this.data.participantStartTimestampMs = startDate.getTime();

    this.data.experimentStartPerf = nowMs();
    await this.advanceToNextTrial();
  }

  async advanceToNextTrial() {
    this.currentTrialIndex += 1;
    if (this.currentTrialIndex >= this.trials.length) {
      await this.finishExperiment();
      return;
    }

    const trialDef = this.trials[this.currentTrialIndex];
    const trialData = {
      trialIndex: this.currentTrialIndex,
      trialId: trialDef.trialId,
      trialMeta: JSON.parse(JSON.stringify(trialDef.meta || {})),
      videoOrder: trialDef.videos.map((v, slotIndex) => ({
        slotIndex,
        id: v.id,
        gender: v.gender,
        url: v.url
      })),
      fixationShownPerf: null,
      preloadStartPerf: null,
      preloadFinishPerf: null,
      gridShownPerf: null,
      gridEndedPerf: null,
      questionShownPerf: null,
      questionSubmitPerf: null,
      responses: [],
      preloadError: null
    };

    this.data.trials.push(trialData);

    await this.runFixationAndPreload(trialDef, trialData);
    await this.runGridPhase(trialDef, trialData);
    this.showQuestions(trialDef, trialData);

    this._preloadAhead();
    this._cleanupOldTrials();
  }

  async preloadQuestionImages(trialDef) {
    const imagePaths = (trialDef.questions || []).map(q => q.image).filter(src => src && src.trim() !== "");
    await Promise.all(imagePaths.map(src => preloadImage(src)));
  }

  async runFixationAndPreload(trialDef, trialData) {
    this.showScreen("fixation");
    trialData.fixationShownPerf = nowMs();
    trialData.preloadStartPerf = nowMs();
    if (this.fixationStatus) this.fixationStatus.textContent = "";

    const fixationMinPromise = sleep(this.config.fixationMinMs);
    const preloadPromise = Promise.all([
      this.cache.preloadTrial(this.currentTrialIndex, trialDef, info => console.log(`Preparing videos: ${info.done} / ${info.total}`)),
      this.preloadQuestionImages(trialDef)
    ]).then(results => results[0]);

    let preloadResult = null;
    try {
      preloadResult = await Promise.race([
        preloadPromise,
        new Promise((_, reject) => setTimeout(() => reject(new Error("Preload timeout reached.")), this.config.preloadTimeoutMs))
      ]);
    } catch (err) {
      trialData.preloadError = String(err.message || err);
      throw err;
    }

    await fixationMinPromise;
    await this.assignAndWarmVideos(preloadResult);
    trialData.preloadFinishPerf = nowMs();
  }

  async assignAndWarmVideos(preloadedItems) {
    this.currentGridItems = preloadedItems;
    const loadPromises = [];

    for (let i = 0; i < this.videoElements.length; i++) {
      const slot = this.videoElements[i];
      const item = preloadedItems[i];

      slot.video.pause();
      slot.video.removeAttribute("src");
      slot.video.load();

      if (!item) {
        slot.label.textContent = `Clip ${i + 1}`;
        continue;
      }

      slot.label.textContent = item.meta.label || `Clip ${i + 1}`;
      slot.video.currentTime = 0;
      slot.video.src = item.objectUrl;

      const p = new Promise((resolve, reject) => {
        const onReady = () => { cleanup(); resolve(); };
        const onError = () => { cleanup(); reject(new Error(`Video failed to load: ${item.meta.url}`)); };
        const cleanup = () => {
          slot.video.removeEventListener("loadeddata", onReady);
          slot.video.removeEventListener("canplay", onReady);
          slot.video.removeEventListener("error", onError);
        };

        if (slot.video.readyState >= 2) return resolve();
        slot.video.addEventListener("loadeddata", onReady, { once: true });
        slot.video.addEventListener("canplay", onReady, { once: true });
        slot.video.addEventListener("error", onError, { once: true });
        slot.video.load();
      });

      loadPromises.push(p);
    }

    await Promise.all(loadPromises);
  }

  async runGridPhase(trialDef, trialData) {
    this.showScreen("grid");
    this.trialCounter.textContent = "";
    this.gridTimer.textContent = "";
    trialData.gridShownPerf = nowMs();

    await Promise.all(this.videoElements.map(slot => {
      slot.video.currentTime = 0;
      return slot.video.play().catch(() => null);
    }));

    await sleep(this.config.stimulusDurationMs);
    for (const slot of this.videoElements) slot.video.pause();
    trialData.gridEndedPerf = nowMs();
  }

  showQuestions(trialDef, trialData) {
    this.showScreen("questions");
    trialData.questionShownPerf = nowMs();

    this.currentQuestionIndex = 0;
    this.currentTrialQuestions = Array.isArray(trialDef.questions) ? trialDef.questions : [];
    this.currentTrialResponses = [];

    if (this.currentTrialQuestions.length === 0) {
      trialData.questionSubmitPerf = nowMs();
      this.advanceToNextTrial().catch(err => alert(`Experiment error: ${err.message || err}`));
      return;
    }

    this.showCurrentQuestion();
  }

  showCurrentQuestion() {
    const q = this.currentTrialQuestions[this.currentQuestionIndex];
    if (!q) return;

    this.acceptingQuestionInput = false;
    this.currentQuestionStartPerf = null;
    if (this.responseInstruction) this.responseInstruction.classList.add("hidden");

    const revealQuestion = () => {
      if (this.responseInstruction) {

          // ratio scale uses letters
          if (
              q.image &&
              q.image.toLowerCase().includes("ratioscale")
          ) {
              this.responseInstruction.textContent = "Press a letter key to respond";
          }
          else {
              this.responseInstruction.textContent = "Press a number key to respond";
          }

          this.responseInstruction.classList.remove("hidden");
      }
      this.currentQuestionStartPerf = nowMs();
      this.acceptingQuestionInput = true;
    };

    if (q.image) {
      this.questionImage.onload = () => {
        this.questionImage.onload = null;
        this.questionImage.onerror = null;
        revealQuestion();
      };
      this.questionImage.onerror = () => {
        this.questionImage.onload = null;
        this.questionImage.onerror = null;
        console.warn("Question image failed to load:", q.image);
        revealQuestion();
      };
      this.questionImage.src = q.image;
      this.questionImage.style.display = "block";
    } else {
      this.questionImage.removeAttribute("src");
      this.questionImage.style.display = "none";
      revealQuestion();
    }
  }

  async handleQuestionKeypress(event) {
    if (this.phase !== "questions") return;
    if (!this.acceptingQuestionInput) return;

    const q = this.currentTrialQuestions[this.currentQuestionIndex];
    if (!q) return;

    const key = String(event.key).toLowerCase();

    let responseValue = null;

    // Some scales use non-standard responses:
    // - ratioScale: a-m
    // - gender/genderScale: 0/1
    // Other scales default to numeric min/max, usually 1-7.
    if (Array.isArray(q.responseKeys) && q.responseKeys.length > 0) {
      const allowed = q.responseKeys.map(k => String(k).toLowerCase());
      if (!allowed.includes(key)) return;
      responseValue = key;
    } else {
      if (!/^\d$/.test(key)) return;

      const numericValue = Number(key);
      const min = Number(q.min);
      const max = Number(q.max);
      if (numericValue < min || numericValue > max) return;

      responseValue = numericValue;
    }

    event.preventDefault();
    await this.nextQuestion(responseValue);
  }

  async nextQuestion(responseValue) {
    this.acceptingQuestionInput = false;

    const trialData = this.data.trials[this.data.trials.length - 1];
    const q = this.currentTrialQuestions[this.currentQuestionIndex];
    const responsePerf = nowMs();
    const rtMs = this.currentQuestionStartPerf != null ? responsePerf - this.currentQuestionStartPerf : null;

    this.currentTrialResponses.push({
      questionIndex: this.currentQuestionIndex,
      scaleKey: q?.scaleKey || "",
      questionText: q?.text || "",
      questionImage: q?.image || "",
      min: q?.min ?? "",
      max: q?.max ?? "",
      step: q?.step ?? "",
      value: responseValue,
      rtMs
    });

    this.currentQuestionIndex += 1;

    if (this.currentQuestionIndex >= this.currentTrialQuestions.length) {
      trialData.responses = this.currentTrialResponses;
      trialData.questionSubmitPerf = nowMs();
      await this.advanceToNextTrial();
    } else {
      this.showCurrentQuestion();
    }
  }

  async _preloadAhead() {
    const ahead = this.config.cacheTrialsAhead || 0;
    for (let offset = 1; offset <= ahead; offset++) {
      const idx = this.currentTrialIndex + offset;
      if (idx >= this.trials.length) continue;
      if (this.cache.hasTrial(idx)) continue;
      this.cache.preloadTrial(idx, this.trials[idx]).catch(err => console.warn("Ahead-of-time preload failed:", err));
      this.preloadQuestionImages(this.trials[idx]).catch(err => console.warn("Ahead-of-time image preload failed:", err));
    }
  }

  _cleanupOldTrials() {
    const oldestToKeep = this.currentTrialIndex - 1;
    for (const key of Array.from(this.cache.cache.keys())) {
      if (key < oldestToKeep) this.cache.cleanupTrial(key);
    }
  }

  async finishExperiment() {

    this.data.experimentEndPerf = nowMs();
    this.cache.cleanupAll();
    this.showScreen("saving");

    if (this.config.saveToGoogleDrive) {
      try {
        const result = await this.saveCsvToGoogleDrive();
        console.log("Google Drive save result:", result);
        this.showScreen("goodbye");

        this.finalDataPreview.textContent =
          "Thank you. Your responses have been saved.\n\nYou can now close your browser.";

      }
      catch (err) {
        console.error(err);
        this.showScreen("goodbye");

        this.finalDataPreview.textContent =
          "ERROR: Failed to save data. Please notify the researcher.";
      }
    }
    else {

      this.showScreen("goodbye");
      this.finalDataPreview.textContent =
        "Experiment complete.";
    }
  }

  downloadData() {
    const stamp = new Date().toISOString().replace(/[:.]/g, "-");
    downloadTextFile(`experiment_data_${stamp}.json`, safeJsonStringify(this.data));
  }

  makeCSVText() {
    const rows = [];

    const headers = [
      "participantId", "participantStartIso", "participantStartLocal", "participantStartTimestampMs",
      "trialIndex", "withinBlockTrialIndex", "trialId", "blockId", "blockOrder", "conditionIndex", "ratioLabel", "numF", "numM",
      "scaleOrder", "videoOrder", "questionIndex", "scaleKey", "questionText", "questionImage",
      "response", "rtMS"
    ];

    rows.push(headers.map(escapeCsvValue).join(","));

    for (const t of this.data.trials) {
      if (!t.responses || !t.responses.length) continue;

      const meta = t.trialMeta || {};

      const videoOrder = (t.videoOrder || [])
        .map(v => `${v.slotIndex + 1}:${v.gender}:${v.url}`)
        .join("|");

      for (const r of t.responses) {
        rows.push([
          this.data.participantId,
          this.data.participantStartIso,
          this.data.participantStartLocal,
          this.data.participantStartTimestampMs,

          t.trialIndex,
          meta.withinBlockTrialIndex,
          t.trialId,
          meta.blockId,
          meta.blockOrder,
          meta.conditionIndex,
          meta.ratioLabel,
          meta.numF,
          meta.numM,

          meta.scaleOrder,
          videoOrder,

          r.questionIndex,
          r.scaleKey,
          r.questionText,
          r.questionImage,

          r.value,
          r.rtMs
        ].map(escapeCsvValue).join(","));
      }
    }

    return rows.join("\n");
  }

  downloadCSV() {
    downloadTextFile(
      "experiment_data.csv",
      this.makeCSVText(),
      "text/csv"
    );
  }
}


function getDeveloperStartIndex(config, trials) {
  const params = new URLSearchParams(window.location.search);

  const trialParam = params.get("trial");
  if (trialParam !== null && trialParam !== "") {
    const oneBasedTrial = Number(trialParam);
    if (Number.isInteger(oneBasedTrial) && oneBasedTrial >= 1 && oneBasedTrial <= trials.length) {
      return oneBasedTrial - 1;
    }
    console.warn(`Ignoring invalid ?trial=${trialParam}. Expected 1-${trials.length}.`);
  }

  const blockParam = params.get("block");
  const requestedBlock = blockParam !== null && blockParam !== ""
    ? Number(blockParam)
    : config.debugStartAtBlockId;

  if (requestedBlock !== null && requestedBlock !== undefined && requestedBlock !== "") {
    const blockId = Number(requestedBlock);
    const idx = trials.findIndex(t => Number(t?.meta?.blockId) === blockId);
    if (idx >= 0) return idx;
    console.warn(`Could not find block ${requestedBlock}; starting at the beginning.`);
  }

  if (config.debugStartAtTrialIndex !== null && config.debugStartAtTrialIndex !== undefined) {
    const idx = Number(config.debugStartAtTrialIndex);
    if (Number.isInteger(idx) && idx >= 0 && idx < trials.length) return idx;
    console.warn(`Ignoring invalid debugStartAtTrialIndex=${config.debugStartAtTrialIndex}.`);
  }

  return 0;
}

// ============================================================
// STARTUP
// ============================================================
window.addEventListener("DOMContentLoaded", async () => {
  try {
    const built = await buildExperimentTrials(EXPERIMENT_CONFIG);
    const startTrialIndex = getDeveloperStartIndex(EXPERIMENT_CONFIG, built.trials);
    const config = { ...EXPERIMENT_CONFIG, trials: built.trials, buildInfo: built.buildInfo, startTrialIndex };

    if (startTrialIndex > 0) {
      const t = built.trials[startTrialIndex];
      console.warn(`DEVELOPER TEST MODE: starting at trial ${startTrialIndex + 1}/${built.trials.length}, block ${t?.meta?.blockId}.`);
    }
    console.log("Experiment build info:", built.buildInfo);
    window.experimentApp = new ExperimentController(config);
  } catch (err) {
    console.error(err);
    alert(`Failed to initialize experiment: ${err.message || err}`);
  }
});
