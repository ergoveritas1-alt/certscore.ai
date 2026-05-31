const SOURCE = "certscore-bx01-fingerprint-probe";
const sent = new Map();
const limit = 80;
let count = 0;

function scriptUrlFromStack() {
  const stack = String(new Error().stack || "");
  const match = stack.match(/https?:\/\/[^\s)]+/);
  return match ? match[0].slice(0, 512) : null;
}

function emit(category, api) {
  const key = `${category}:${api}`;
  const current = sent.get(key) || 0;
  sent.set(key, current + 1);
  if (current > 0 || count >= limit) {
    return;
  }
  count += 1;
  window.postMessage(
    {
      api,
      category,
      sampleCount: current + 1,
      scriptUrl: scriptUrlFromStack(),
      source: SOURCE,
      type: "CERTSCORE_BX01_FINGERPRINT_API"
    },
    window.location.origin
  );
}

function wrapPrototype(proto, name, category, api) {
  if (!proto || typeof proto[name] !== "function") {
    return;
  }
  const original = proto[name];
  if (original.__certscoreBx01Wrapped) {
    return;
  }
  const wrapped = function(...args) {
    emit(category, api);
    return Reflect.apply(original, this, args);
  };
  try {
    Object.defineProperty(wrapped, "__certscoreBx01Wrapped", { value: true });
    Object.defineProperty(proto, name, { configurable: true, writable: true, value: wrapped });
  } catch {}
}

function wrapGetter(proto, name, category, api) {
  if (!proto) {
    return;
  }
  const descriptor = Object.getOwnPropertyDescriptor(proto, name);
  if (!descriptor || typeof descriptor.get !== "function" || descriptor.get.__certscoreBx01Wrapped) {
    return;
  }
  const original = descriptor.get;
  const wrapped = function() {
    emit(category, api);
    return Reflect.apply(original, this, []);
  };
  try {
    Object.defineProperty(wrapped, "__certscoreBx01Wrapped", { value: true });
    Object.defineProperty(proto, name, { ...descriptor, get: wrapped });
  } catch {}
}

wrapPrototype(window.HTMLCanvasElement && HTMLCanvasElement.prototype, "toDataURL", "canvas_webgl", "HTMLCanvasElement.toDataURL");
wrapPrototype(window.HTMLCanvasElement && HTMLCanvasElement.prototype, "toBlob", "canvas_webgl", "HTMLCanvasElement.toBlob");
wrapPrototype(window.CanvasRenderingContext2D && CanvasRenderingContext2D.prototype, "getImageData", "canvas_webgl", "CanvasRenderingContext2D.getImageData");
wrapPrototype(window.WebGLRenderingContext && WebGLRenderingContext.prototype, "getParameter", "canvas_webgl", "WebGLRenderingContext.getParameter");
wrapPrototype(window.WebGL2RenderingContext && WebGL2RenderingContext.prototype, "getParameter", "canvas_webgl", "WebGL2RenderingContext.getParameter");
wrapPrototype(window.OfflineAudioContext && OfflineAudioContext.prototype, "startRendering", "audio", "OfflineAudioContext.startRendering");
wrapPrototype(window.AudioContext && AudioContext.prototype, "createOscillator", "audio", "AudioContext.createOscillator");
wrapGetter(window.Navigator && Navigator.prototype, "plugins", "fonts_plugins", "Navigator.plugins");
wrapGetter(window.Navigator && Navigator.prototype, "mimeTypes", "fonts_plugins", "Navigator.mimeTypes");
wrapGetter(window.Navigator && Navigator.prototype, "hardwareConcurrency", "hardware", "Navigator.hardwareConcurrency");
wrapGetter(window.Navigator && Navigator.prototype, "deviceMemory", "hardware", "Navigator.deviceMemory");
wrapGetter(window.Navigator && Navigator.prototype, "languages", "timezone_locale", "Navigator.languages");
wrapGetter(window.Screen && Screen.prototype, "width", "screen_viewport", "Screen.width");
wrapGetter(window.Screen && Screen.prototype, "height", "screen_viewport", "Screen.height");

const originalResolvedOptions = Intl.DateTimeFormat.prototype.resolvedOptions;
if (typeof originalResolvedOptions === "function" && !originalResolvedOptions.__certscoreBx01Wrapped) {
  const wrapped = function(...args) {
    emit("timezone_locale", "Intl.DateTimeFormat.resolvedOptions");
    return Reflect.apply(originalResolvedOptions, this, args);
  };
  try {
    Object.defineProperty(wrapped, "__certscoreBx01Wrapped", { value: true });
    Object.defineProperty(Intl.DateTimeFormat.prototype, "resolvedOptions", { configurable: true, writable: true, value: wrapped });
  } catch {}
}

const originalEstimate = navigator.storage && navigator.storage.estimate;
if (typeof originalEstimate === "function" && !originalEstimate.__certscoreBx01Wrapped) {
  const wrapped = function(...args) {
    emit("storage", "StorageManager.estimate");
    return Reflect.apply(originalEstimate, this, args);
  };
  try {
    Object.defineProperty(wrapped, "__certscoreBx01Wrapped", { value: true });
    Object.defineProperty(navigator.storage, "estimate", { configurable: true, writable: true, value: wrapped });
  } catch {}
}
