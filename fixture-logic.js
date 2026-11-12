/* Reglas puras del fixture: orden, zonas y arrastre de ganadores.
   No toca la red. results.js (ResultsStore) es la única capa de guardado.
*/
(function (root, factory) {
  var api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  root.FixtureLogic = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  function timeValue(time) {
    var match = /^(\d{1,2}):(\d{2})/.exec(time || "");
    if (!match) return 0;
    var hour = Number(match[1]);
    var minute = Number(match[2]);
    if (hour < 6) hour += 24;
    return hour * 60 + minute;
  }

  function compareMatches(a, b) {
    var byTime = timeValue(a.time) - timeValue(b.time);
    if (byTime) return byTime;
    return a.order - b.order;
  }

  function filterMatches(matches, day, category) {
    return matches.filter(function (match) {
      return match.day === day && match.category === category;
    }).sort(compareMatches);
  }

  function zoneNumber(zona) {
    var match = /(\d+)/.exec(zona || "");
    return match ? Number(match[1]) : 0;
  }

  function buildGroups(matches) {
    var categories = ["damas", "masc-a", "masc-b"];
    var groups = { damas: [], "masc-a": [], "masc-b": [] };
    var seen = {};
    matches.forEach(function (match) {
      if (match.day === "domingo" || !match.zona) return;
      var key = match.category + "|" + match.zona;
      if (!seen[key]) {
        seen[key] = [];
        groups[match.category].push({ zona: match.zona, pairs: seen[key] });
      }
      [match.pair1, match.pair2].forEach(function (pair) {
        if (seen[key].indexOf(pair) === -1) seen[key].push(pair);
      });
    });
    categories.forEach(function (category) {
      groups[category].sort(function (a, b) {
        return zoneNumber(a.zona) - zoneNumber(b.zona);
      });
    });
    return groups;
  }

  function findSource(placeholder, category, matches) {
    var text = String(placeholder || "").trim();
    var mine = matches.filter(function (match) {
      return match.category === category && match.day === "domingo";
    });
    var semi = /^Ganador Semifinal (\d+)$/i.exec(text);
    if (semi) {
      var n = Number(semi[1]);
      var exact = mine.filter(function (match) {
        return new RegExp("^Semifinal " + n + "$", "i").test(String(match.round).trim());
      })[0];
      if (exact) return exact.id;
      var plain = mine.filter(function (match) {
        return /^Semifinal$/i.test(String(match.round).trim());
      });
      return plain[n - 1] ? plain[n - 1].id : null;
    }
    var llave = /^Ganador ([A-H])$/.exec(text);
    if (llave) {
      var octavos = mine.filter(function (match) {
        return match.round === "Octavos (Llave " + llave[1] + ")";
      })[0];
      return octavos ? octavos.id : null;
    }
    var cuarto = /^Ganador [A-H]-[A-H] \(Cuartos (\d+)\)$/.exec(text);
    if (cuarto) {
      var found = mine.filter(function (match) {
        return match.round === "Cuartos " + cuarto[1];
      })[0];
      return found ? found.id : null;
    }
    return null;
  }

  function winnerSide(match, record) {
    if (!match || !record || !record.winner) return null;
    if (record.winner === "pair1" || record.winner === match.pair1) return "pair1";
    if (record.winner === "pair2" || record.winner === match.pair2) return "pair2";
    return null;
  }

  function furthestLabel(match, side, matches, results, seen) {
    var text = match[side];
    var guard = match.id + ":" + side;
    var trail = seen || {};
    if (trail[guard]) return text;
    trail[guard] = true;
    var sourceId = findSource(text, match.category, matches);
    if (!sourceId) return text;
    var source = null;
    for (var i = 0; i < matches.length; i++) {
      if (matches[i].id === sourceId) {
        source = matches[i];
        break;
      }
    }
    var record = results && results.matches ? results.matches[sourceId] : null;
    var sideWon = winnerSide(source, record);
    if (!source || !sideWon) return text;
    return furthestLabel(source, sideWon, matches, results, trail);
  }

  function pairView(match, side, matches, results) {
    var raw = match[side];
    var label = furthestLabel(match, side, matches, results);
    return { raw: raw, label: label, resolved: label !== raw };
  }

  return {
    timeValue: timeValue,
    compareMatches: compareMatches,
    filterMatches: filterMatches,
    buildGroups: buildGroups,
    findSource: findSource,
    winnerSide: winnerSide,
    furthestLabel: furthestLabel,
    pairView: pairView
  };
});
