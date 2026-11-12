/* Token de GitHub cifrado. El PIN no está en el repo.
   AES-GCM. La clave sale de PBKDF2-SHA256 del PIN (UTF-8),
   200000 iteraciones, 32 bytes, con el salt y el iv de abajo.
   ciphertext es base64 de ciphertext||tag, el formato de WebCrypto.
*/
(function (root, factory) {
  var api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  root.AdminAuth = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  var ENC = {
    alg: "AES-GCM",
    kdf: "PBKDF2-SHA256",
    iterations: 200000,
    salt: "mH5o2OmGIrBfwkT6OzG2xw==",
    iv: "2Gg6WgMk5giaH2nb",
    ciphertext: "rJbTBy9bgRWciAx988nhi9Rd/3bbvKGVpsBS/h5o+ExRGmB9bBkPtcgnAaSstUHjnuVKuDsdk5yWYlIdkPe9KMI249Eb41YxlVkVsA57U6U20OekHTl95Kw7YcKl9t4+XPfHmiKuPCrhSMFzLg=="
  };

  function b64ToBytes(b64) {
    var bin = atob(String(b64).replace(/\s/g, ""));
    var out = new Uint8Array(bin.length);
    for (var i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
    return out;
  }

  async function unlock(pin) {
    var subtle = globalThis.crypto && globalThis.crypto.subtle;
    if (!subtle) throw new Error("PIN incorrecto");
    var material = await subtle.importKey(
      "raw",
      new TextEncoder().encode(String(pin == null ? "" : pin)),
      "PBKDF2",
      false,
      ["deriveKey"]
    );
    var key = await subtle.deriveKey(
      {
        name: "PBKDF2",
        salt: b64ToBytes(ENC.salt),
        iterations: ENC.iterations,
        hash: "SHA-256"
      },
      material,
      { name: "AES-GCM", length: 256 },
      false,
      ["decrypt"]
    );
    var plain = await subtle.decrypt(
      { name: "AES-GCM", iv: b64ToBytes(ENC.iv) },
      key,
      b64ToBytes(ENC.ciphertext)
    );
    var token = new TextDecoder().decode(plain).replace(/^\uFEFF/, "").trim().replace(/^Bearer\s+/i, "");
    if (!token) throw new Error("PIN incorrecto");
    return token;
  }

  return { unlock: unlock };
});
