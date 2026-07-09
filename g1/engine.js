/*
 * engine.js — 1XC Game slot engine (чистая логика, без DOM).
 * Работает и в браузере (window.SlotEngine), и в Node (module.exports) —
 * поэтому один и тот же движок можно прогнать в Monte-Carlo для замера RTP.
 *
 * Механика (tumbling-слот, 6x5):
 *   - выплата "anywhere": 8+ одинаковых символов в любом месте экрана;
 *   - tumble: выигравшие символы исчезают, остальные падают, сверху досыпаются новые,
 *     цепочка продолжается пока есть выигрыши;
 *   - орбы-множители (2x..1000x) суммируются: в базовой игре множат выигрыш серии,
 *     во фриспинах копятся в общий множитель на весь раунд;
 *   - scatter (символ-молния): 4+ на экране -> 15 фриспинов; 3+ во фриспинах -> +5 спинов.
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.SlotEngine = factory();
}(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  var COLS = 6, ROWS = 5;

  // Платящие символы: id -> выплата по тиру [8-9, 10-11, 12+], в долях от общей ставки.
  // Значения откалиброваны Monte-Carlo (4M спинов) -> суммарный RTP ~96.5%.
  var PAYS = {
    crown:     [4.5,   11.25, 22.5],
    ring:      [2.25,  4.5,   9],
    goblet:    [1.8,   3.6,   6.75],
    hourglass: [1.125, 2.25,  5.4],
    red:       [0.675, 0.9,   4.5],
    purple:    [0.45,  0.675, 3.6],
    yellow:    [0.405, 0.54,  2.7],
    green:     [0.36,  0.45,  2.25],
    blue:      [0.225, 0.45,  1.8]
  };

  // Веса появления платящих символов (площе -> ниже частота 8+ -> реалистичный hit rate).
  var WEIGHTS = {
    blue: 15, green: 14, purple: 13, yellow: 12, red: 11,
    goblet: 10, ring: 9, hourglass: 8, crown: 7
  };
  // Scatter и орбы задаются отдельно и могут отличаться в базе и фриспинах.
  var SCATTER_W = 2.3;   // вес scatter (частота триггера фриспинов ~1/185)
  var ORB_W_BASE = 1.1;  // вес орба в базовой игре
  var ORB_W_FS = 2.7;    // вес орба во фриспинах (крупные накопительные множители)
  var ORB_W_FS_ANTE = 1.15; // вес орба во фриспинах под Ante: триггер ~x2, но множители скромнее -> RTP тот же

  // Значения орбов-множителей и их веса (сильный перекос в мелкие).
  var ORB_VALUES = [
    [2,200],[3,150],[4,120],[5,100],[6,80],[8,60],[10,50],[12,30],
    [15,20],[20,15],[25,10],[50,6],[100,3],[250,1],[500,0.5],[1000,0.2]
  ];

  var FS_START = 15;      // фриспинов за триггер
  var FS_TRIGGER = 4;     // scatter-ов для запуска
  var FS_RETRIGGER = 3;   // scatter-ов во фриспинах для +5
  var FS_RETRIGGER_ADD = 5;
  var FS_MAX = 500;       // жёсткий предел спинов в раунде (страховка)

  // --- ГСЧ ---------------------------------------------------------------
  // По умолчанию Math.random (настоящая случайность в браузере).
  // Для воспроизводимых симуляций можно передать seed (mulberry32).
  function makeRng(seed) {
    if (seed == null) return Math.random;
    var s = seed >>> 0;
    return function () {
      s |= 0; s = (s + 0x6D2B79F5) | 0;
      var t = Math.imul(s ^ (s >>> 15), 1 | s);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  function weightedPick(entries, total, rng) {
    var r = rng() * total, acc = 0;
    for (var i = 0; i < entries.length; i++) {
      acc += entries[i][1];
      if (r < acc) return entries[i][0];
    }
    return entries[entries.length - 1][0];
  }

  // Таблица весов появления. scatterW и orbW — абсолютные веса для данного режима.
  function buildSpawn(scatterW, orbW) {
    var entries = [], total = 0;
    for (var k in WEIGHTS) { entries.push([k, WEIGHTS[k]]); total += WEIGHTS[k]; }
    entries.push(['scatter', scatterW]); total += scatterW;
    entries.push(['orb', orbW]); total += orbW;
    return { entries: entries, total: total };
  }

  var ORB_TOTAL = (function () { var t = 0; for (var i = 0; i < ORB_VALUES.length; i++) t += ORB_VALUES[i][1]; return t; })();
  function pickOrbValue(rng) { return weightedPick(ORB_VALUES, ORB_TOTAL, rng); }

  // Ячейка: {sym:'blue'} | {sym:'orb',mult:5} | {sym:'scatter'} | null
  function spawnCell(spawn, rng) {
    var sym = weightedPick(spawn.entries, spawn.total, rng);
    if (sym === 'orb') return { sym: 'orb', mult: pickOrbValue(rng) };
    return { sym: sym };
  }

  function newGrid(spawn, rng) {
    var g = [];
    for (var c = 0; c < COLS; c++) {
      g[c] = [];
      for (var r = 0; r < ROWS; r++) g[c][r] = spawnCell(spawn, rng);
    }
    return g;
  }

  function countSyms(grid) {
    var counts = {};
    for (var c = 0; c < COLS; c++)
      for (var r = 0; r < ROWS; r++) {
        var cell = grid[c][r];
        if (cell) counts[cell.sym] = (counts[cell.sym] || 0) + 1;
      }
    return counts;
  }

  function tier(count) {
    if (count >= 12) return 2;
    if (count >= 10) return 1;
    if (count >= 8) return 0;
    return -1;
  }

  // Оценка текущей сетки: {win, winningSyms:{sym:true}, counts}
  function evaluate(grid, totalBet) {
    var counts = countSyms(grid), win = 0, winningSyms = {};
    for (var sym in counts) {
      if (!PAYS[sym]) continue;
      var t = tier(counts[sym]);
      if (t >= 0) { win += PAYS[sym][t] * totalBet; winningSyms[sym] = true; }
    }
    return { win: win, winningSyms: winningSyms, counts: counts };
  }

  function orbSum(grid) {
    var s = 0;
    for (var c = 0; c < COLS; c++)
      for (var r = 0; r < ROWS; r++) {
        var cell = grid[c][r];
        if (cell && cell.sym === 'orb') s += cell.mult;
      }
    return s;
  }

  function scatterCount(grid) {
    var n = 0;
    for (var c = 0; c < COLS; c++)
      for (var r = 0; r < ROWS; r++) {
        var cell = grid[c][r];
        if (cell && cell.sym === 'scatter') n++;
      }
    return n;
  }

  // Удаляем выигравшие символы, гравитация вниз, досыпаем сверху. Мутирует grid.
  function tumbleOnce(grid, winningSyms, spawn, rng) {
    var c, r, i;
    for (c = 0; c < COLS; c++)
      for (r = 0; r < ROWS; r++) {
        var cell = grid[c][r];
        if (cell && winningSyms[cell.sym]) grid[c][r] = null;
      }
    for (c = 0; c < COLS; c++) {
      var survivors = [];
      for (r = ROWS - 1; r >= 0; r--) if (grid[c][r]) survivors.push(grid[c][r]);
      var col = new Array(ROWS);
      for (i = 0; i < ROWS; i++) col[i] = null;
      var idx = ROWS - 1;
      for (i = 0; i < survivors.length; i++) { col[idx] = survivors[i]; idx--; }
      for (r = idx; r >= 0; r--) col[r] = spawnCell(spawn, rng);
      grid[c] = col;
    }
  }

  // Один спин со всей цепочкой tumble.
  // opts: {totalBet, scatterW, orbW, freeSpins:bool, persistentMult:number}
  function playSpin(opts, rng) {
    rng = rng || Math.random;
    var totalBet = opts.totalBet;
    var scatterW = opts.scatterW != null ? opts.scatterW : SCATTER_W;
    var orbW = opts.orbW != null ? opts.orbW : (opts.freeSpins ? ORB_W_FS : ORB_W_BASE);
    var spawn = buildSpawn(scatterW, orbW);
    var grid = newGrid(spawn, rng);
    var steps = [], seqWin = 0, guard = 0;

    while (guard++ < 60) {
      var ev = evaluate(grid, totalBet);
      if (ev.win > 0) {
        seqWin += ev.win;
        // снимок ДО удаления — для анимации в UI
        steps.push({ grid: cloneGrid(grid), win: ev.win, winningSyms: ev.winningSyms, counts: ev.counts });
        tumbleOnce(grid, ev.winningSyms, spawn, rng);
      } else break;
    }

    var oSum = orbSum(grid), scat = scatterCount(grid), appliedMult, persistentAfter;
    if (opts.freeSpins) {
      persistentAfter = (opts.persistentMult || 0) + oSum;
      appliedMult = persistentAfter > 0 ? persistentAfter : 1;
    } else {
      appliedMult = oSum > 0 ? oSum : 1;
      persistentAfter = 0;
    }

    return {
      seqWin: seqWin,
      orbSum: oSum,
      appliedMult: appliedMult,
      totalWin: seqWin * appliedMult,
      scatters: scat,
      persistentMultAfter: persistentAfter,
      steps: steps,        // каждая ступень tumble: снятая сетка + что выиграло
      finalGrid: grid      // сетка после последнего досыпа (с орбами/скаттерами)
    };
  }

  function cloneGrid(grid) {
    var g = [];
    for (var c = 0; c < COLS; c++) {
      g[c] = [];
      for (var r = 0; r < ROWS; r++) {
        var cell = grid[c][r];
        g[c][r] = cell ? (cell.sym === 'orb' ? { sym: 'orb', mult: cell.mult } : { sym: cell.sym }) : null;
      }
    }
    return g;
  }

  // Полный раунд фриспинов. Возвращает суммарный выигрыш и лог по спинам.
  function playFreeSpinsRound(opts, rng) {
    rng = rng || Math.random;
    var spins = FS_START, persistent = 0, totalWin = 0, log = [], i = 0;
    while (i < spins) {
      var res = playSpin({
        totalBet: opts.totalBet,
        scatterW: opts.scatterW != null ? opts.scatterW : SCATTER_W,
        orbW: opts.orbW != null ? opts.orbW : ORB_W_FS,
        freeSpins: true,
        persistentMult: persistent
      }, rng);
      persistent = res.persistentMultAfter;
      totalWin += res.totalWin;
      log.push(res);
      if (res.scatters >= FS_RETRIGGER && spins < FS_MAX) spins += FS_RETRIGGER_ADD;
      i++;
    }
    return { totalWin: totalWin, spins: spins, persistent: persistent, log: log };
  }

  return {
    COLS: COLS, ROWS: ROWS,
    PAYS: PAYS, WEIGHTS: WEIGHTS, ORB_VALUES: ORB_VALUES,
    SCATTER_W: SCATTER_W, ORB_W_BASE: ORB_W_BASE, ORB_W_FS: ORB_W_FS, ORB_W_FS_ANTE: ORB_W_FS_ANTE,
    FS_START: FS_START, FS_TRIGGER: FS_TRIGGER,
    makeRng: makeRng, buildSpawn: buildSpawn,
    playSpin: playSpin, playFreeSpinsRound: playFreeSpinsRound,
    scatterCount: scatterCount, evaluate: evaluate, cloneGrid: cloneGrid
  };
}));
