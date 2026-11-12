/* Resultados del fixture.
   Público: lee results.json al cargar (API de GitHub, después raw, después Pages).
   Admin: escribe el mismo archivo en main. El token lo descifra admin-auth.js
   con el PIN y queda solo en memoria o sessionStorage. Nunca se commitea.

   Para cambiar el almacenamiento, reemplazá este archivo y mantené:
     load() -> Promise<{v, matches}>
     saveMatch(id, entry|null) -> Promise<{v, matches}>
     checkToken(token) -> Promise<void>
     getToken/setToken/clearToken/hasToken()
   entry = { winner?: string, score?: string } o null para borrar.
*/
(function (root, factory) {
  var built = factory();
  if (typeof module === "object" && module.exports) {
    module.exports = Object.assign({}, built.api, built.codec);
  }
  root.ResultsStore = built.api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  var REPO = "bizu-ar/ferro-padel";
  var PATH = "results.json";
  var BRANCH = "main";
  var TOKEN_KEY = "ferroPadelAdminToken";
  var API = "https://api.github.com/repos/" + REPO + "/contents/" + PATH;

  function empty() {
    return { v: 1, matches: {} };
  }

  function normalize(data) {
    if (!data || typeof data !== "object" || Array.isArray(data)) return empty();
    var matches = data.matches && typeof data.matches === "object" && !Array.isArray(data.matches)
      ? data.matches
      : {};
    var out = {};
    Object.keys(data).forEach(function (key) { out[key] = data[key]; });
    out.v = 1;
    out.matches = matches;
    return out;
  }

  function utf8ToB64(str) {
    var bytes = new TextEncoder().encode(str);
    var bin = "";
    var size = 0x8000;
    for (var i = 0; i < bytes.length; i += size) {
      bin += String.fromCharCode.apply(null, bytes.subarray(i, i + size));
    }
    return btoa(bin);
  }

  function b64ToUtf8(b64) {
    var bin = atob(String(b64).replace(/\s/g, ""));
    var bytes = new Uint8Array(bin.length);
    for (var i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    return new TextDecoder().decode(bytes);
  }

  function parsePayload(text) {
    var data = JSON.parse(text);
    if (data && data.content && data.encoding === "base64" && data.type === "file") {
      return JSON.parse(b64ToUtf8(data.content));
    }
    return data;
  }

  function authError(status, detail) {
    var message = status === 401
      ? "El token no es válido o venció."
      : "El token no tiene permiso de Contents (lectura y escritura) en bizu-ar/ferro-padel.";
    if (detail && !/github_pat_|ghp_|gho_/.test(detail)) {
      message += " GitHub: " + detail;
    }
    var error = new Error(message);
    error.code = "auth";
    return error;
  }

  async function readDetail(res) {
    try {
      var data = await res.json();
      return data && data.message ? String(data.message) : "";
    } catch (ignore) {
      return "";
    }
  }

  function ghHeaders(token) {
    return {
      Accept: "application/vnd.github+json",
      Authorization: "Bearer " + token,
      "X-GitHub-Api-Version": "2022-11-28"
    };
  }

  function signal() {
    if (typeof AbortSignal !== "undefined" && AbortSignal.timeout) return AbortSignal.timeout(20000);
    return undefined;
  }

  var memoryToken = "";

  function forgetLocalCopy() {
    try { localStorage.removeItem(TOKEN_KEY); }
    catch (ignore) { /* sin localStorage */ }
  }

  function getToken() {
    forgetLocalCopy();
    try {
      var stored = sessionStorage.getItem(TOKEN_KEY);
      if (stored) return stored;
    } catch (ignore) { /* sessionStorage no disponible */ }
    return memoryToken;
  }

  function setToken(token) {
    memoryToken = String(token || "").trim();
    forgetLocalCopy();
    try { sessionStorage.setItem(TOKEN_KEY, memoryToken); }
    catch (ignore) { /* queda solo en memoria */ }
  }

  function clearToken() {
    memoryToken = "";
    forgetLocalCopy();
    try { sessionStorage.removeItem(TOKEN_KEY); }
    catch (ignore) { /* sin sessionStorage */ }
  }

  function hasToken() {
    return !!getToken();
  }

  async function load() {
    var stamp = Date.now();
    var attempts = [
      function () {
        return fetch(API + "?ref=" + BRANCH + "&t=" + stamp, {
          cache: "no-store",
          signal: signal(),
          headers: { Accept: "application/vnd.github.raw" }
        });
      },
      function () {
        return fetch("https://raw.githubusercontent.com/" + REPO + "/" + BRANCH + "/" + PATH + "?t=" + stamp, {
          cache: "no-store",
          signal: signal()
        });
      },
      function () {
        return fetch("results.json?t=" + stamp, { cache: "no-store", signal: signal() });
      }
    ];
    var last = null;
    for (var i = 0; i < attempts.length; i++) {
      try {
        var res = await attempts[i]();
        if (!res.ok) throw new Error(String(res.status));
        var text = await res.text();
        return normalize(parsePayload(text));
      } catch (error) {
        last = error;
      }
    }
    var failed = new Error("No se pudieron cargar los resultados.");
    failed.cause = last;
    throw failed;
  }

  async function checkToken(token) {
    var res = await fetch(API + "?ref=" + BRANCH + "&t=" + Date.now(), {
      cache: "no-store",
      signal: signal(),
      headers: ghHeaders(token)
    });
    if (res.status === 401 || res.status === 403) throw authError(res.status, await readDetail(res));
    if (res.status === 404) return;
    if (!res.ok) throw new Error("GitHub respondió " + res.status + ".");
  }

  function cleanEntry(entry) {
    var out = {};
    if (entry.winner) out.winner = String(entry.winner);
    if (entry.score && String(entry.score).trim()) out.score = String(entry.score).trim();
    var blob = JSON.stringify(out);
    if (/github_pat_|ghp_|gho_/.test(blob)) {
      throw new Error("El resultado no puede incluir un token.");
    }
    return out;
  }

  function sortMatches(matches) {
    var out = {};
    Object.keys(matches).sort().forEach(function (key) { out[key] = matches[key]; });
    return out;
  }

  async function getWithSha(token) {
    var res = await fetch(API + "?ref=" + BRANCH + "&t=" + Date.now(), {
      cache: "no-store",
      signal: signal(),
      headers: ghHeaders(token)
    });
    if (res.status === 401 || res.status === 403) throw authError(res.status, await readDetail(res));
    if (res.status === 404) return { sha: null, data: empty() };
    if (!res.ok) throw new Error("No se pudo leer results.json (" + res.status + ").");
    var body = await res.json();
    var data = body.content ? JSON.parse(b64ToUtf8(body.content)) : empty();
    return { sha: body.sha || null, data: normalize(data) };
  }

  async function saveMatchOnce(id, entry) {
    var token = getToken();
    if (!token) {
      var missing = new Error("Falta el token de GitHub.");
      missing.code = "no-token";
      throw missing;
    }
    var cleaned = entry == null ? null : cleanEntry(entry);
    if (cleaned && !cleaned.winner && !cleaned.score) cleaned = null;
    var last = null;
    for (var attempt = 0; attempt < 4; attempt++) {
      var current = await getWithSha(token);
      var data = normalize(current.data);
      if (cleaned == null) delete data.matches[id];
      else data.matches[id] = cleaned;
      data.matches = sortMatches(data.matches);
      data.updatedAt = new Date().toISOString();
      var payload = {
        message: cleaned ? "Resultado " + id : "Borrar resultado " + id,
        content: utf8ToB64(JSON.stringify(data, null, 2) + "\n"),
        branch: BRANCH
      };
      if (current.sha) payload.sha = current.sha;
      var res = await fetch(API, {
        method: "PUT",
        cache: "no-store",
        signal: signal(),
        headers: Object.assign(ghHeaders(token), { "Content-Type": "application/json" }),
        body: JSON.stringify(payload)
      });
      if (res.status === 409 || res.status === 422) {
        last = new Error("conflicto");
        continue;
      }
      if (res.status === 401 || res.status === 403) throw authError(res.status, await readDetail(res));
      if (!res.ok) throw new Error("No se pudo guardar (" + res.status + ").");
      return normalize(data);
    }
    var conflict = new Error("No se pudo guardar porque el archivo cambió. Intentá de nuevo.");
    conflict.code = "conflict";
    conflict.cause = last;
    throw conflict;
  }

  var chain = Promise.resolve();
  function saveMatch(id, entry) {
    var run = chain.then(function () { return saveMatchOnce(id, entry); });
    chain = run.then(function () {}, function () {});
    return run;
  }

  return {
    api: {
      load: load,
      saveMatch: saveMatch,
      checkToken: checkToken,
      getToken: getToken,
      setToken: setToken,
      clearToken: clearToken,
      hasToken: hasToken
    },
    codec: {
      _utf8ToB64: utf8ToB64,
      _b64ToUtf8: b64ToUtf8,
      _normalize: normalize
    }
  };
});
