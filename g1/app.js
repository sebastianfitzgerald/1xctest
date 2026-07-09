/* ============================================================
   1XC Game (демо-слот) — UI-слой поверх SlotEngine.
   Вращения на виртуальные кредиты, настоящий ГСЧ (~96.5% RTP).
   ============================================================ */
(function () {
  'use strict';
  var E = window.SlotEngine;
  if (!E) { console.error('SlotEngine not loaded'); return; }

  // ---------- Настройки демо ----------
  var START_BALANCE = 1000;
  var FREE_SPINS_GRANT = 30;
  var BETS = [0.20, 0.40, 0.60, 1.00, 2.00, 4.00];
  var BIG = { big: 20, mega: 60, epic: 150 };            // порог x ставки для баннера
  var FTD_TIERS = [3.5, 10, 25, 50];                     // пресеты депозита
  var WAGER = 30;

  // ---------- Состояние ----------
  var state = {
    balance: START_BALANCE,
    fsLeft: FREE_SPINS_GRANT,
    betIdx: 0,
    ante: false,
    turbo: false,
    busy: false,
    started: false,
    spinsDone: 0,
    fsSeen: false,
    hintShown: false
  };
  var rng = Math.random;

  function baseBet() { return BETS[state.betIdx]; }
  function totalBet() { return +(baseBet() * (state.ante ? 1.25 : 1)).toFixed(2); }
  function scatterW() { return state.ante ? E.SCATTER_W * 1.25 : E.SCATTER_W; }
  function buyCost() { return +(totalBet() * 100).toFixed(2); }
  function money(v) { return '€' + Number(v).toFixed(2); }
  function delay(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }
  function t(fast, slow) { return state.turbo ? fast : slow; }

  // ---------- Символьная графика (оригинальные SVG) ----------
  var GRADS =
    '<svg width="0" height="0" style="position:absolute" aria-hidden="true"><defs>' +
    grad('gBlue', '#8fc0ff', '#2f6bd6', '#123f86') +
    grad('gGreen', '#84e3ab', '#2fae63', '#116b3a') +
    grad('gPurple', '#d79dff', '#9b45d6', '#5c1d8c') +
    grad('gYellow', '#ffe08a', '#f2b21a', '#b17c0d') +
    grad('gRed', '#ff97a4', '#e2384c', '#96202f') +
    grad('gPink', '#ffc6e8', '#e458bd', '#9c2f7f') +
    lin('gGold', '#ffe488', '#f5c542', '#b6801d') +
    lin('gGoldDeep', '#d8a83a', '#a2711c', '#6e4a1c') +
    '<radialGradient id="gScatter" cx="50%" cy="38%" r="70%"><stop offset="0%" stop-color="#79ddff"/><stop offset="55%" stop-color="#3a2168"/><stop offset="100%" stop-color="#1a0b34"/></radialGradient>' +
    '<linearGradient id="gLight" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stop-color="#ffffff"/><stop offset="100%" stop-color="#bfe4ff"/></linearGradient>' +
    '</defs></svg>';

  function grad(id, a, b, c) {
    return '<radialGradient id="' + id + '" cx="38%" cy="30%" r="75%">' +
      '<stop offset="0%" stop-color="' + a + '"/><stop offset="55%" stop-color="' + b + '"/><stop offset="100%" stop-color="' + c + '"/></radialGradient>';
  }
  function lin(id, a, b, c) {
    return '<linearGradient id="' + id + '" x1="0" y1="0" x2="0" y2="1">' +
      '<stop offset="0%" stop-color="' + a + '"/><stop offset="52%" stop-color="' + b + '"/><stop offset="100%" stop-color="' + c + '"/></linearGradient>';
  }

  var SYM = {
    blue: '<polygon points="50,8 88,42 50,94 12,42" fill="url(#gBlue)"/><polygon points="50,8 88,42 50,48 12,42" fill="#fff" opacity=".22"/><polygon points="50,48 88,42 50,94" fill="#000" opacity=".18"/>',
    green: '<polygon points="32,12 68,12 88,32 88,68 68,88 32,88 12,68 12,32" fill="url(#gGreen)"/><polygon points="36,22 64,22 78,36 78,64 64,78 36,78 22,64 22,36" fill="none" stroke="#fff" stroke-opacity=".28" stroke-width="3"/><rect x="38" y="38" width="24" height="24" fill="#fff" opacity=".12"/>',
    purple: '<polygon points="50,90 12,26 88,26" fill="url(#gPurple)"/><polygon points="12,26 88,26 50,52" fill="#fff" opacity=".22"/><polygon points="50,90 34,56 66,56" fill="#000" opacity=".15"/>',
    yellow: '<polygon points="50,10 87,30 87,70 50,90 13,70 13,30" fill="url(#gYellow)"/><polygon points="50,22 76,36 76,64 50,78 24,64 24,36" fill="#fff" opacity=".16"/>',
    red: '<polygon points="50,10 88,40 73,86 27,86 12,40" fill="url(#gRed)"/><polygon points="50,28 72,44 64,72 36,72 28,44" fill="#fff" opacity=".16"/>',
    goblet: '<path d="M28 20 h44 v6 a22 15 0 0 1 -16 17 v22 l11 5 v7 h-34 v-7 l11 -5 v-22 a22 15 0 0 1 -16 -17 z" fill="url(#gGold)"/><path d="M32 24 h36 a20 12 0 0 1 -18 14 a20 12 0 0 1 -18 -14 z" fill="#fff" opacity=".18"/>',
    ring: '<circle cx="50" cy="60" r="24" fill="none" stroke="url(#gGold)" stroke-width="10"/><circle cx="50" cy="60" r="24" fill="none" stroke="#fff" stroke-opacity=".2" stroke-width="3"/><polygon points="50,10 63,27 50,42 37,27" fill="url(#gPink)"/><polygon points="50,10 63,27 50,27" fill="#fff" opacity=".35"/>',
    hourglass: '<rect x="26" y="15" width="48" height="8" rx="4" fill="url(#gGold)"/><rect x="26" y="77" width="48" height="8" rx="4" fill="url(#gGold)"/><path d="M34 23 h32 l-16 27 z" fill="url(#gGreen)"/><path d="M50 50 l16 27 h-32 z" fill="url(#gGreen)" opacity=".7"/><path d="M34 23 h32 l-16 27 -16 -27 z" fill="none" stroke="url(#gGold)" stroke-width="3"/><path d="M34 77 h32 l-16 -27 -16 27 z" fill="none" stroke="url(#gGold)" stroke-width="3"/>',
    crown: '<path d="M18 68 l-3 -34 l19 15 l16 -25 l16 25 l19 -15 l-3 34 z" fill="url(#gGold)"/><rect x="16" y="66" width="68" height="12" rx="3" fill="url(#gGoldDeep)"/><circle cx="35" cy="43" r="3.6" fill="#e2384c"/><circle cx="50" cy="35" r="3.6" fill="#e2384c"/><circle cx="65" cy="43" r="3.6" fill="#e2384c"/>',
    scatter: '<circle cx="50" cy="50" r="42" fill="url(#gScatter)"/><circle cx="50" cy="50" r="42" fill="none" stroke="url(#gGold)" stroke-width="5"/><circle cx="50" cy="50" r="34" fill="none" stroke="#fff" stroke-opacity=".15" stroke-width="2"/><polygon points="58,15 37,53 51,53 41,85 67,44 53,44 63,15" fill="url(#gLight)" stroke="#fff" stroke-width="1"/>'
  };

  function symSVG(id) { return '<svg viewBox="0 0 100 100" class="sym-svg">' + SYM[id] + '</svg>'; }

  // ---------- DOM ----------
  var $ = function (id) { return document.getElementById(id); };
  var gridEl = $('grid'), frameEl = document.querySelector('.frame'),
      lightningEl = $('lightning'),
      winMsg = $('winMessage'), fsBanner = $('fsBanner'),
      fsMultEl = $('fsMult'), fsCountEl = $('fsCount'),
      balanceEl = $('balance'), betValEl = $('betValue'), betVal2El = $('betValue2'),
      fsLeftEl = $('fsLeft'), fsMeterEl = $('fsMeter'), buyPriceEl = $('buyPrice');

  // ---------- Рендер ----------
  function cellNode(cell) {
    var d = document.createElement('div');
    d.className = 'cell';
    if (!cell) { d.dataset.sym = ''; return d; }
    if (cell.sym === 'orb') {
      d.dataset.sym = 'orb';
      d.innerHTML = '<div class="orb"><div class="orb-ball"></div><span class="orb-val">' + cell.mult + '</span></div>';
      return d;
    }
    d.dataset.sym = cell.sym;
    if (cell.sym === 'scatter') d.classList.add('scatter');
    d.innerHTML = '<div class="sym-art">' + symSVG(cell.sym) + '</div>';
    return d;
  }

  // grid[col][row] -> визуально по строкам
  function renderGrid(grid, drop) {
    var frag = document.createDocumentFragment();
    for (var r = 0; r < E.ROWS; r++) {
      for (var c = 0; c < E.COLS; c++) {
        var node = cellNode(grid[c][r]);
        if (drop) { node.classList.add('drop'); node.style.animationDelay = (r * 22) + 'ms'; }
        frag.appendChild(node);
      }
    }
    gridEl.innerHTML = '';
    gridEl.appendChild(frag);
  }

  function highlightWins(winSyms) {
    var cells = gridEl.children;
    for (var i = 0; i < cells.length; i++)
      if (winSyms[cells[i].dataset.sym]) cells[i].classList.add('win');
  }
  function fadeWins(winSyms) {
    var cells = gridEl.children;
    for (var i = 0; i < cells.length; i++)
      if (winSyms[cells[i].dataset.sym]) { cells[i].classList.remove('win'); cells[i].classList.add('fade'); }
  }

  // Анимация одного спина (базовый или фриспин)
  function animateSpin(res) {
    if (res.steps.length === 0) {
      renderGrid(res.finalGrid, true);
      return delay(t(90, 300));
    }
    renderGrid(res.steps[0].grid, true);
    var chain = delay(t(90, 260));
    res.steps.forEach(function (step, i) {
      chain = chain.then(function () {
        highlightWins(step.winningSyms);
        return delay(t(130, 480));
      }).then(function () {
        fadeWins(step.winningSyms);
        return delay(t(70, 200));
      }).then(function () {
        var next = res.steps[i + 1] ? res.steps[i + 1].grid : res.finalGrid;
        renderGrid(next, true);
        return delay(t(90, 260));
      });
    });
    return chain;
  }

  // ---------- HUD ----------
  function fmtBet() { return money(totalBet()) + (state.ante ? ' ⚡' : ''); }
  function updateHud() {
    balanceEl.dataset.raw = state.balance;
    balanceEl.textContent = money(state.balance);
    betValEl.textContent = fmtBet();
    betVal2El.textContent = fmtBet();
    fsLeftEl.textContent = state.fsLeft;
    buyPriceEl.textContent = money(buyCost());
    fsMeterEl.classList.toggle('spent', state.fsLeft <= 0);
    $('btnBetMinus').disabled = state.busy || state.betIdx === 0;
    $('btnBetPlus').disabled = state.busy || state.betIdx === BETS.length - 1;
    $('btnBuy').disabled = state.busy || state.balance < buyCost();
  }

  function countBalance(to, ms) {
    var el = balanceEl, from = parseFloat(el.dataset.raw || '0'), start = performance.now();
    function tick(now) {
      var k = Math.min(1, (now - start) / ms), e = k * (2 - k);
      var v = from + (to - from) * e;
      el.textContent = money(v);
      if (k < 1) requestAnimationFrame(tick); else { el.dataset.raw = to; el.textContent = money(to); }
    }
    requestAnimationFrame(tick);
  }

  function setMessage(html, win) {
    winMsg.className = 'win-message' + (win ? ' win' : '');
    winMsg.innerHTML = html;
  }

  // ---------- Баннер большого выигрыша ----------
  function bigWinTier(xb) {
    if (xb >= BIG.epic) return 'ЭПИЧЕСКИЙ ВЫИГРЫШ';
    if (xb >= BIG.mega) return 'МЕГА-ВЫИГРЫШ';
    if (xb >= BIG.big) return 'БОЛЬШОЙ ВЫИГРЫШ';
    return null;
  }
  function showBigWin(amount, xb) {
    var label = bigWinTier(xb);
    if (!label) return Promise.resolve();
    winMsg.className = 'win-message win bigwin';
    winMsg.innerHTML = '<span class="bw-label">' + label + '</span><span class="bw-amt">€0.00</span>';
    var amtEl = winMsg.querySelector('.bw-amt'), start = performance.now(), dur = t(700, 1500);
    return new Promise(function (resolve) {
      function tick(now) {
        var k = Math.min(1, (now - start) / dur), e = k * (2 - k);
        amtEl.textContent = money(amount * e);
        if (k < 1) requestAnimationFrame(tick);
        else { amtEl.textContent = money(amount); setTimeout(resolve, t(500, 1100)); }
      }
      requestAnimationFrame(tick);
    });
  }

  function flashLightning() {
    lightningEl.classList.remove('flash'); void lightningEl.offsetWidth; lightningEl.classList.add('flash');
  }

  // ---------- Фриспины ----------
  function updateFsBanner(mult, total, done) {
    fsMultEl.textContent = '×' + mult;
    fsCountEl.textContent = 'Спин ' + done + ' из ' + total;
  }

  function runFreeSpins() {
    return new Promise(function (resolve) {
      state.fsSeen = true;
      fsBanner.hidden = false;
      frameEl.classList.add('trigger'); flashLightning();
      var persistent = 0, spins = E.FS_START, done = 0, total = 0;
      var fsOrbW = state.ante ? E.ORB_W_FS_ANTE : E.ORB_W_FS;
      updateFsBanner(0, spins, 0);

      delay(t(400, 900)).then(function () {
        frameEl.classList.remove('trigger');
        step();
      });

      function step() {
        if (done >= spins) { finish(); return; }
        done++;
        updateFsBanner(persistent, spins, done);
        var res = E.playSpin({ totalBet: totalBet(), scatterW: E.SCATTER_W, orbW: fsOrbW, freeSpins: true, persistentMult: persistent }, rng);
        animateSpin(res).then(function () {
          if (res.orbSum > 0) {
            persistent = res.persistentMultAfter;
            fsMultEl.textContent = '×' + persistent;
            fsBanner.animate ? fsBanner.animate([{ transform: 'scale(1)' }, { transform: 'scale(1.04)' }, { transform: 'scale(1)' }], { duration: 300 }) : 0;
          }
          if (res.totalWin > 0) {
            total += res.totalWin; state.balance += res.totalWin;
            countBalance(state.balance, t(300, 600));
            setMessage('Выигрыш <b>' + money(res.totalWin) + '</b>' + (persistent > 1 ? ' · множитель ×' + persistent : ''), true);
          }
          if (res.scatters >= 3) { spins += 5; flashLightning(); updateFsBanner(persistent, spins, done); }
          var xb = res.totalWin / totalBet();
          var after = bigWinTier(xb) ? showBigWin(res.totalWin, xb) : delay(t(120, 420));
          after.then(step);
        });
      }

      function finish() {
        fsBanner.hidden = true;
        openFsSummary(total, resolve);
      }
    });
  }

  // ---------- Основной спин ----------
  function setBusy(b) {
    state.busy = b;
    $('btnSpin').disabled = b;
    $('btnAnte').disabled = b;
    $('btnTurbo').disabled = b;
    $('btnSpin').classList.toggle('spinning', b);
    updateHud();
  }

  function doSpin() {
    if (state.busy || !state.started) return;
    if (state.fsLeft <= 0) { openFtd(); return; }
    setBusy(true);
    state.fsLeft--; state.spinsDone++; updateHud();
    setMessage('Вращение…', false);

    var res = E.playSpin({ totalBet: totalBet(), scatterW: scatterW(), orbW: E.ORB_W_BASE, freeSpins: false }, rng);

    animateSpin(res).then(function () {
      var win = res.totalWin, chain = Promise.resolve();
      if (win > 0) {
        state.balance += win; countBalance(state.balance, t(300, 600));
        var mult = res.orbSum > 1 ? ' · множитель ×' + res.orbSum : '';
        setMessage('Выигрыш <b>' + money(win) + '</b>' + mult, true);
        var xb = win / totalBet();
        if (bigWinTier(xb)) chain = showBigWin(win, xb);
      } else if (res.scatters >= E.FS_TRIGGER) {
        setMessage('Скаттеры собраны — бонус!', true);
      } else {
        if (!state.fsSeen && !state.hintShown && state.spinsDone >= 12 && state.fsLeft > 3) {
          state.hintShown = true;
          setMessage('Хотите увидеть фриспины? Включите <b>×2 шанс</b> или нажмите «Купить фриспины»', false);
        } else {
          setMessage('Крутите дальше — осталось ' + state.fsLeft + ' фриспинов', false);
        }
      }
      return chain;
    }).then(function () {
      if (res.scatters >= E.FS_TRIGGER) {
        return delay(t(200, 500)).then(runFreeSpins);
      }
    }).then(function () {
      setBusy(false);
      if (state.fsLeft <= 0) { setTimeout(openFtd, 700); }
    });
  }

  function doBuy() {
    if (state.busy || !state.started) return;
    var cost = buyCost();
    if (state.balance < cost) { setMessage('Недостаточно демо-кредита для покупки', false); return; }
    setBusy(true);
    state.balance -= cost; countBalance(state.balance, 250);
    setMessage('Фриспины куплены за ' + money(cost), true);
    delay(t(150, 350)).then(runFreeSpins).then(function () { setBusy(false); });
  }

  // ---------- Модалки ----------
  function openModal(id) { $(id).hidden = false; }
  function closeModal(id) { $(id).hidden = true; }

  function openFsSummary(total, cb) {
    $('fsTotal').textContent = money(total);
    var xb = total / totalBet();
    $('fsTotalX').textContent = total > 0 ? '≈ ×' + xb.toFixed(1) + ' от ставки' : 'В этот раз без выигрыша';
    openModal('fsSummaryModal');
    $('fsSummaryOk').onclick = function () {
      closeModal('fsSummaryModal');
      setMessage(total > 0 ? 'Бонус завершён · выигрыш <b>' + money(total) + '</b>' : 'Бонус завершён', total > 0);
      cb && cb();
    };
  }

  // FTD
  var ftdSelected = null;
  function bonusPct(dep) { return dep >= 10 ? 150 : 100; }
  function buildFtd() {
    var wrap = $('ftdTiers'); wrap.innerHTML = '';
    FTD_TIERS.forEach(function (dep) {
      var b = document.createElement('button');
      b.className = 'tier-btn'; b.type = 'button';
      b.innerHTML = '<span class="tier-amt">' + money(dep) + '</span><span class="tier-bonus">+' + bonusPct(dep) + '%</span>';
      b.onclick = function () { selectTier(dep, b); };
      wrap.appendChild(b);
    });
  }
  function selectTier(dep, btn) {
    ftdSelected = dep;
    Array.prototype.forEach.call($('ftdTiers').children, function (c) { c.classList.remove('sel'); });
    btn.classList.add('sel');
    var pct = bonusPct(dep), bonus = +(dep * pct / 100).toFixed(2), total = +(dep + bonus).toFixed(2);
    $('ftdDep').textContent = money(dep);
    $('ftdPct').textContent = '+' + pct + '%';
    $('ftdBonus').textContent = money(bonus);
    $('ftdTotal').textContent = money(total);
    $('ftdSummary').hidden = false;
    var cta = $('ftdCta');
    cta.disabled = false;
    cta.textContent = 'Пополнить ' + money(dep) + ' → +' + money(bonus);
  }
  function openFtd() {
    if (!$('ftdModal').hidden) return;
    ftdSelected = null;
    $('ftdSummary').hidden = true;
    $('ftdCta').disabled = true;
    $('ftdCta').textContent = 'Выберите сумму пополнения';
    Array.prototype.forEach.call($('ftdTiers').children, function (c) { c.classList.remove('sel'); });
    openModal('ftdModal');
  }

  // ---------- Инфо / таблица выплат ----------
  function buildInfo() {
    var order = ['crown', 'ring', 'goblet', 'hourglass', 'red', 'purple', 'yellow', 'green', 'blue'];
    var names = { crown: 'Корона', ring: 'Кольцо', goblet: 'Кубок', hourglass: 'Песочные часы', red: 'Рубин', purple: 'Аметист', yellow: 'Топаз', green: 'Изумруд', blue: 'Сапфир' };
    var rows = order.map(function (id) {
      var p = E.PAYS[id];
      return '<div class="pay-row"><span class="pay-ico">' + symSVG(id) + '</span>' +
        '<span class="pay-name">' + names[id] + '</span>' +
        '<span class="pay-vals">' + p[0] + '× <small>/</small> ' + p[1] + '× <small>/</small> ' + p[2] + '×</span></div>';
    }).join('');

    $('infoBody').innerHTML =
      '<div class="info-section"><h3>Как выигрывать</h3>' +
      '<p>Выигрыш засчитывается, когда на поле есть <b>8 и более</b> одинаковых символов — в любом месте, линии не важны. Значения выше: за <b>8–9 / 10–11 / 12+</b> символов (× общей ставки).</p></div>' +
      '<div class="info-section"><h3>Таблица выплат</h3><div class="pay-table">' + rows + '</div></div>' +
      '<div class="info-section"><h3>Каскады (tumble)</h3><p>Выигравшие символы исчезают, оставшиеся падают вниз, сверху досыпаются новые. Цепочка продолжается, пока приходят выигрыши.</p></div>' +
      '<div class="info-section"><h3>Сферы-множители</h3><p>Сфера ⚡ несёт множитель ×2…×1000. В базовой игре множители суммируются и умножают выигрыш серии. Во фриспинах они <b>копятся в общий множитель</b> на весь бонус.</p></div>' +
      '<div class="info-section"><h3>Фриспины</h3><p><b>4+ скаттера ⚡</b> запускают 15 фриспинов с растущим общим множителем. <b>3+ скаттера</b> внутри бонуса добавляют +5 спинов.</p></div>' +
      '<div class="info-section"><h3>Кнопки</h3><p><b>×2 шанс (Ante):</b> удваивает шанс попасть в фриспины за ставку ×1.25. Множители в таких фриспинах скромнее — отдача остаётся ~96.5%. <b>⚡ Турбо:</b> быстрые вращения. <b>Купить фриспины:</b> сразу запустить бонус за 100× ставки.</p></div>' +
      '<div class="info-section"><h3>Отдача (RTP)</h3><p>Демо использует настоящий ГСЧ с теоретической отдачей ~96.5% — как в оригинале. Это витрина механики на виртуальные кредиты, без реальных выплат.</p></div>';
  }

  // ---------- Старт / сброс ----------
  function fillerGrid() {
    var ids = ['blue', 'green', 'purple', 'yellow', 'red', 'goblet', 'ring', 'hourglass', 'crown'];
    var g = [];
    for (var c = 0; c < E.COLS; c++) { g[c] = []; for (var r = 0; r < E.ROWS; r++) g[c][r] = { sym: ids[(Math.random() * ids.length) | 0] }; }
    return g;
  }

  function resetDemo() {
    state.balance = START_BALANCE; state.fsLeft = FREE_SPINS_GRANT;
    state.spinsDone = 0; state.fsSeen = false; state.hintShown = false;
    state.ante = false; $('btnAnte').classList.remove('on'); $('btnAnte').setAttribute('aria-pressed', 'false');
    updateHud();
    setMessage('Нажмите SPIN — у вас ' + FREE_SPINS_GRANT + ' бесплатных вращений', false);
    renderGrid(fillerGrid(), true);
  }

  // ---------- События ----------
  function bind() {
    $('btnSpin').addEventListener('click', doSpin);
    $('btnBuy').addEventListener('click', doBuy);
    $('btnBetMinus').addEventListener('click', function () { if (!state.busy && state.betIdx > 0) { state.betIdx--; updateHud(); } });
    $('btnBetPlus').addEventListener('click', function () { if (!state.busy && state.betIdx < BETS.length - 1) { state.betIdx++; updateHud(); } });
    $('btnAnte').addEventListener('click', function () {
      if (state.busy) return;
      state.ante = !state.ante;
      this.classList.toggle('on', state.ante);
      this.setAttribute('aria-pressed', state.ante ? 'true' : 'false');
      updateHud();
    });
    $('btnTurbo').addEventListener('click', function () {
      state.turbo = !state.turbo;
      this.classList.toggle('on', state.turbo);
      this.setAttribute('aria-pressed', state.turbo ? 'true' : 'false');
    });
    $('btnInfo').addEventListener('click', function () { openModal('infoModal'); });
    $('infoClose').addEventListener('click', function () { closeModal('infoModal'); });
    $('infoOk').addEventListener('click', function () { closeModal('infoModal'); });

    $('introStart').addEventListener('click', function () {
      closeModal('introModal'); state.started = true; renderGrid(fillerGrid(), true);
      setMessage('Нажмите SPIN — у вас ' + FREE_SPINS_GRANT + ' бесплатных вращений', false);
    });

    $('ftdCta').addEventListener('click', function () {
      if (ftdSelected == null) return;
      this.textContent = 'Демо: здесь открылась бы касса оператора';
      this.disabled = true;
    });
    $('ftdRestart').addEventListener('click', function () { closeModal('ftdModal'); resetDemo(); });

    document.addEventListener('keydown', function (e) {
      if (e.code === 'Space' || e.code === 'Enter') {
        var anyModal = ['introModal', 'infoModal', 'fsSummaryModal', 'ftdModal'].some(function (id) { return !$(id).hidden; });
        if (!anyModal) { e.preventDefault(); doSpin(); }
      }
    });
  }

  // ---------- Инициализация ----------
  function init() {
    document.body.insertAdjacentHTML('afterbegin', GRADS);
    buildInfo();
    buildFtd();
    updateHud();
    renderGrid(fillerGrid(), false);
    bind();
    openModal('introModal');
    // эмблема-логотип во вступлении (тот же щит)
    $('introEmblem') && ($('introEmblem').className = 'modal-emblem');
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
