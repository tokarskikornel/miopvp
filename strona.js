// Strona MIO PVP: czyta dane.json (eksport z serwera co 5 min) i rysuje Ranking, Mecze i Profil.
// Adresy: #ranking/<kit|ogolny>, #mecze, #gracz/<nick>. Teksty z danych zawsze przez textContent.
'use strict';

const tresc = document.getElementById('tresc');
let dane = null;
const sortowanie = { kol: 'elo', malejaco: true };

// ---------- male pomocniki ----------

/** el('div', {class: 'x'}, 'tekst', innyElement) - tworzy element; stringi wstawiane jako tekst. */
function el(tag, atrybuty, ...dzieci) {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(atrybuty || {})) {
    if (v === null || v === undefined || v === false) continue;
    if (k.startsWith('on')) e.addEventListener(k.slice(2), v);
    else e.setAttribute(k, v);
  }
  for (const d of dzieci.flat()) {
    if (d === null || d === undefined || d === false) continue;
    e.append(d instanceof Node ? d : document.createTextNode(String(d)));
  }
  return e;
}

const glowa = (nick, px) => el('img', { src: `https://mc-heads.net/avatar/${encodeURIComponent(nick)}/${px}`, alt: '', loading: 'lazy' });
const linkGracza = (nick, px = 56) => el('a', { class: 'gracz', href: '#gracz/' + encodeURIComponent(nick) }, glowa(nick, px), nick);
const tierKlasa = tier => 't' + tier.charAt(2);
const plakietkaTieru = tier => el('span', { class: 'tier ' + tierKlasa(tier) }, tier);
const kitPoKluczu = klucz => dane.kity.find(k => k.klucz === klucz) || { klucz, nazwa: klucz, ikona: 'PAPER' };
const ikonaKitu = klucz => el('img', { src: `ikony/${kitPoKluczu(klucz).ikona}.png`, alt: '', onerror: e => e.target.remove() });
const nazwaKitu = klucz => kitPoKluczu(klucz).nazwa;
const ZNAK = n => (n > 0 ? '+' : n < 0 ? '−' : '±') + Math.abs(n);

function czasTemu(iso) {
  const s = (Date.now() - new Date(iso).getTime()) / 1000;
  if (s < 60) return 'przed chwilą';
  if (s < 3600) return `${Math.floor(s / 60)} min temu`;
  if (s < 86400) return `${Math.floor(s / 3600)} h temu`;
  const dni = Math.floor(s / 86400);
  return dni === 1 ? 'wczoraj' : `${dni} dni temu`;
}

/** Najlepszy tier gracza (z kitu o najwyzszym ELO). */
function najlepszyTier(gracz) {
  let naj = null;
  for (const [klucz, k] of Object.entries(gracz.kity)) {
    if (k.tier && (!naj || k.elo > naj.elo)) naj = { ...k, klucz };
  }
  return naj;
}

// ---------- RANKING ----------

function pigulki(aktywny) {
  const p = el('div', { class: 'pigulki' },
    el('a', { class: 'pig' + (aktywny === 'ogolny' ? ' akt' : ''), href: '#ranking/ogolny' }, '⭐ Ogólny'));
  for (const k of dane.kity) {
    p.append(el('a', { class: 'pig' + (aktywny === k.klucz ? ' akt' : ''), href: '#ranking/' + k.klucz }, ikonaKitu(k.klucz), k.nazwa));
  }
  return p;
}

function pokazRanking(kit) {
  if (kit !== 'ogolny' && !dane.rankingi[kit]) kit = 'ogolny';
  tresc.replaceChildren(
    el('h2', {}, 'Ranking'),
    el('div', { class: 'pod' }, 'Tiery liczą się tylko z walk Ranked. Pierwsze ' + dane.progi.kwalifikacje + ' walk w kicie to kwalifikacje.'),
    pigulki(kit),
    kit === 'ogolny' ? tabelaOgolna() : tabelaKitu(kit));
}

function tabelaOgolna() {
  if (!dane.ogolny.length) return el('div', { class: 'karta pusto' }, 'Nikt jeszcze nie skończył kwalifikacji.');
  const wiersze = dane.ogolny.map((g, i) => el('tr', {},
    el('td', { class: 'miejsce num m' + (i + 1) }, i + 1),
    el('td', {}, linkGracza(g.nick)),
    el('td', { class: 'num wart' }, g.punkty),
    el('td', {}, dane.kity.filter(k => g.tiery[k.klucz]).map(k =>
      el('span', { title: k.nazwa }, plakietkaTieru(g.tiery[k.klucz]))))));
  return el('div', { class: 'karta' }, el('table', {},
    el('thead', {}, el('tr', {}, el('th', {}, '#'), el('th', {}, 'Gracz'), el('th', {}, 'Punkty'), el('th', {}, 'Tiery'))),
    el('tbody', {}, wiersze)));
}

const KOLUMNY = [
  { kol: 'elo', nazwa: 'Tier', wartosc: g => g.elo },
  { kol: 'elo2', nazwa: 'ELO', wartosc: g => g.elo },
  { kol: 'wygrane', nazwa: 'W / L', wartosc: g => g.wygrane },
  { kol: 'winrate', nazwa: 'Winrate', wartosc: g => winrate(g) },
];
const winrate = g => (g.wygrane + g.przegrane ? g.wygrane / (g.wygrane + g.przegrane) : 0);

function tabelaKitu(kit) {
  const r = dane.rankingi[kit];
  const karta = el('div', { class: 'karta' });
  if (!r.gracze.length) {
    karta.append(el('div', { class: 'pusto' }, 'Nikt jeszcze nie ma tieru w ' + nazwaKitu(kit) + '.'));
  } else {
    const kolumna = KOLUMNY.find(k => k.kol === sortowanie.kol);
    const gracze = [...r.gracze].sort((a, b) => {
      if (sortowanie.kol === 'nick') return (sortowanie.malejaco ? -1 : 1) * a.nick.localeCompare(b.nick);
      const roznica = kolumna.wartosc(b) - kolumna.wartosc(a);
      return (sortowanie.malejaco ? roznica : -roznica) || a.nick.localeCompare(b.nick);
    });
    const naglowek = (kol, nazwa, klasa) => el('th', {
      class: 'sortuj' + (sortowanie.kol === kol ? ' akt' : '') + (klasa ? ' ' + klasa : ''),
      onclick: () => {
        sortowanie.malejaco = sortowanie.kol === kol ? !sortowanie.malejaco : kol !== 'nick';
        sortowanie.kol = kol;
        pokazRanking(kit);
      },
    }, nazwa + (sortowanie.kol === kol ? (sortowanie.malejaco ? ' ▾' : ' ▴') : ''));
    karta.append(el('table', {},
      el('thead', {}, el('tr', {}, el('th', {}, '#'), naglowek('nick', 'Gracz'), naglowek('elo', 'Tier'),
        naglowek('elo2', 'ELO'), naglowek('wygrane', 'W / L'), naglowek('winrate', 'Winrate', 'ukryj-tel'))),
      el('tbody', {}, gracze.map((g, i) => el('tr', {},
        el('td', { class: 'miejsce num m' + (i + 1) }, i + 1),
        el('td', {}, linkGracza(g.nick)),
        el('td', {}, plakietkaTieru(g.tier)),
        el('td', { class: 'num wart' }, g.elo),
        el('td', { class: 'num' }, el('span', { class: 'plus' }, g.wygrane), ' / ', el('span', { class: 'minus' }, g.przegrane)),
        el('td', { class: 'num ukryj-tel' }, Math.round(winrate(g) * 100) + '%'))))));
  }
  if (r.kwalifikacje.length) {
    karta.append(el('div', { class: 'uwaga-dol' }, 'W kwalifikacjach:',
      r.kwalifikacje.map(k => el('span', {}, linkGracza(k.nick, 40), ' ',
        el('span', { class: 'kwal' }, k.mecze + '/' + dane.progi.kwalifikacje)))));
  }
  return karta;
}

// ---------- MECZE ----------

function wierszMeczu(m) {
  const strona = (s, prawa, wygral) => el('div', { class: 'strona' + (prawa ? ' prawa' : '') + (wygral === false ? ' przegrany' : '') },
    prawa && m.ranked ? el('span', { class: 'num ' + (s.zmiana >= 0 ? 'plus' : 'minus') }, ZNAK(s.zmiana)) : null,
    linkGracza(s.nick, 48),
    !prawa && m.ranked ? el('span', { class: 'num ' + (s.zmiana >= 0 ? 'plus' : 'minus') }, ZNAK(s.zmiana)) : null);
  const wynikA = m.wygral === null ? null : m.wygral === 'a';
  return el('div', { class: 'mecz' },
    el('span', {}, el('span', { class: 'plak ' + (m.ranked ? 'r' : 'u') }, m.ranked ? 'Ranked' : 'Unranked')),
    strona(m.a, false, wynikA),
    el('div', { class: 'wynik num' }, `${m.a.rundy} : ${m.b.rundy}`, el('small', {}, nazwaKitu(m.kit))),
    strona(m.b, true, wynikA === null ? null : !wynikA),
    el('div', { class: 'kiedy', title: new Date(m.czas).toLocaleString('pl-PL') }, czasTemu(m.czas)));
}

function pokazMecze() {
  tresc.replaceChildren(
    el('h2', {}, 'Mecze'),
    el('div', { class: 'pod' }, 'Ostatnie walki na serwerze — Ranked i Unranked.'),
    dane.mecze.length ? el('div', { class: 'karta' }, dane.mecze.map(wierszMeczu))
      : el('div', { class: 'karta pusto' }, 'Brak walk. Wejdź na miopvp.duckdns.org i zagraj!'));
}

// ---------- PROFIL ----------

function pokazGracza(nick) {
  const klucz = Object.keys(dane.gracze).find(n => n.toLowerCase() === nick.toLowerCase());
  if (!klucz) {
    tresc.replaceChildren(el('div', { class: 'karta pusto', style: 'margin-top:24px' }, 'Nie ma takiego gracza: ', nick));
    return;
  }
  const g = dane.gracze[klucz];
  const naj = najlepszyTier(g);
  const gl = g.globalnie;
  const kd = gl.smierci ? (gl.zabojstwa / gl.smierci).toFixed(2) : String(gl.zabojstwa);

  const kity = el('div', { class: 'kity' }, dane.kity.map(k => {
    const s = g.kity[k.klucz];
    return el('div', { class: 'kit' },
      el('div', { class: 'naz' }, ikonaKitu(k.klucz), k.nazwa),
      !s ? el('span', { class: 'kwal', style: 'opacity:.6' }, 'Nie grał')
        : s.tier ? plakietkaTieru(s.tier)
          : el('span', { class: 'kwal' }, `Kwalifikacje ${s.kwalifikacje}/${dane.progi.kwalifikacje}`),
      el('div', { class: 'elo num' }, s && s.tier ? `${s.elo} ELO · ${s.wygrane}W/${s.przegrane}L` : '—'));
  }));

  const kityWykresu = dane.kity.map(k => k.klucz).filter(k => (g.wykres[k] || []).length);
  const miejsceWykresu = el('div');
  const przyciski = el('div', { class: 'mini-pig' });
  const pokazWykres = kit => {
    przyciski.replaceChildren(...kityWykresu.map(k => el('button', {
      type: 'button', class: k === kit ? 'akt' : null, onclick: () => pokazWykres(k) }, nazwaKitu(k))));
    miejsceWykresu.replaceChildren(rysujWykres(g.wykres[kit] || []));
  };
  if (kityWykresu.length) {
    const domyslny = naj && kityWykresu.includes(naj.klucz) ? naj.klucz : kityWykresu[0];
    pokazWykres(domyslny);
  } else {
    miejsceWykresu.append(el('div', { class: 'pusto' }, 'Brak walk Ranked od uruchomienia historii.'));
  }

  tresc.replaceChildren(
    el('div', { class: 'karta profil-top' },
      glowa(klucz, 192),
      el('div', {},
        el('h3', {}, klucz),
        el('div', { style: 'font-size:13px' },
          naj ? ['Najlepszy tier: ', plakietkaTieru(naj.tier), ' ', nazwaKitu(naj.klucz), ' · '] : 'Bez tieru · ',
          el('b', { class: 'wart' }, g.punkty + ' pkt'))),
      el('div', { class: 'staty' },
        el('div', {}, el('b', {}, gl.wygrane), el('span', {}, 'Wygrane')),
        el('div', {}, el('b', {}, gl.przegrane), el('span', {}, 'Przegrane')),
        el('div', {}, el('b', {}, kd), el('span', {}, 'K/D')),
        el('div', {}, el('b', {}, gl.najlepszaSeria), el('span', {}, 'Najl. seria')))),
    kity,
    el('div', { class: 'dwie' },
      el('div', { class: 'karta wykres' }, el('p', { class: 'sekcja-tytul' }, 'Historia ELO'), przyciski, miejsceWykresu),
      el('div', { class: 'karta lista' },
        el('p', { class: 'sekcja-tytul', style: 'margin-top:12px' }, 'Najczęstsi rywale'),
        g.rywale.length ? g.rywale.map(r => el('div', { class: 'w' }, linkGracza(r.nick, 44),
          el('span', { class: 'prawo num' }, el('span', { class: 'plus' }, r.w), ' – ', el('span', { class: 'minus' }, r.l))))
          : el('div', { class: 'pusto' }, 'Jeszcze nikogo.'))),
    el('div', { class: 'karta lista', style: 'margin-top:14px' },
      el('p', { class: 'sekcja-tytul', style: 'margin-top:12px' }, 'Ostatnie mecze'),
      g.mecze.length ? g.mecze.map(m => wierszProfilu(m, klucz)) : el('div', { class: 'pusto' }, 'Brak walk.')));
}

function wierszProfilu(m, nick) {
  const ja = m.a.nick === nick ? m.a : m.b;
  const on = ja === m.a ? m.b : m.a;
  const wynik = m.wygral === null ? ['Remis', 'wart'] : (m[m.wygral] === ja ? ['Wygrana', 'plus'] : ['Przegrana', 'minus']);
  return el('div', { class: 'w' },
    el('span', { class: 'plak ' + (m.ranked ? 'r' : 'u') }, m.ranked ? 'Ranked' : 'Unranked'),
    el('b', { class: wynik[1] }, wynik[0]),
    el('span', {}, 'vs '), linkGracza(on.nick, 44),
    el('span', {}, '· ' + nazwaKitu(m.kit) + ' '), el('span', { class: 'num' }, `${ja.rundy}:${on.rundy}`),
    el('span', { class: 'prawo' },
      m.ranked ? el('span', { class: 'num ' + (ja.zmiana >= 0 ? 'plus' : 'minus') }, ZNAK(ja.zmiana) + ' ') : null,
      el('span', { class: 'kiedy' }, czasTemu(m.czas))));
}

// ---------- WYKRES ----------

const SVG = 'http://www.w3.org/2000/svg';
function svg(tag, atrybuty) {
  const e = document.createElementNS(SVG, tag);
  for (const [k, v] of Object.entries(atrybuty)) e.setAttribute(k, v);
  return e;
}

/** Linia ELO w czasie (kolejne walki rowno co punkt) + przerywane linie progow tierow w zakresie wykresu. */
function rysujWykres(punkty) {
  if (punkty.length < 2) return el('div', { class: 'pusto' }, 'Za mało walk na wykres.');
  const W = 600, H = 180, M = 8;
  const elo = punkty.map(p => p[1]);
  const min = Math.min(...elo) - 20, max = Math.max(...elo) + 20;
  const x = i => M + (i * (W - 2 * M)) / (punkty.length - 1);
  const y = v => H - M - ((v - min) * (H - 2 * M)) / (max - min);
  const s = svg('svg', { viewBox: `0 0 ${W} ${H}`, preserveAspectRatio: 'none', role: 'img', 'aria-label': 'Wykres ELO' });

  const { start, krok } = dane.progi;
  const nazwy = ['LT5', 'MT5', 'HT5', 'LT4', 'MT4', 'HT4', 'LT3', 'MT3', 'HT3', 'LT2', 'MT2', 'HT2', 'LT1', 'MT1', 'HT1'];
  const kolory = { 1: '#f5c542', 2: '#d5dbe6', 3: '#d39a62', 4: '#8f9bb3', 5: '#6f7a91' };
  for (let i = 1; i < nazwy.length; i++) {
    const prog = start + i * krok;
    if (prog <= min || prog >= max) continue;
    const kolor = kolory[nazwy[i].charAt(2)];
    s.append(svg('line', { x1: 0, x2: W, y1: y(prog), y2: y(prog), stroke: kolor, 'stroke-opacity': '.3', 'stroke-dasharray': '4 6' }));
    const t = svg('text', { x: W - 4, y: y(prog) - 4, fill: kolor, 'font-size': 11, 'text-anchor': 'end' });
    t.textContent = nazwy[i];
    s.append(t);
  }
  const d = punkty.map((p, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(p[1]).toFixed(1)}`).join(' ');
  const grad = svg('linearGradient', { id: 'g', x1: 0, x2: 0, y1: 0, y2: 1 });
  grad.append(svg('stop', { offset: 0, 'stop-color': '#8f9bb3', 'stop-opacity': '.45' }), svg('stop', { offset: 1, 'stop-color': '#8f9bb3', 'stop-opacity': '0' }));
  const defs = svg('defs', {});
  defs.append(grad);
  s.append(defs,
    svg('path', { d: `${d} L${x(punkty.length - 1)},${H} L${x(0)},${H} Z`, fill: 'url(#g)', opacity: '.5' }),
    svg('path', { d, fill: 'none', stroke: '#efeff1', 'stroke-width': 2.5, 'vector-effect': 'non-scaling-stroke' }));
  const ost = punkty[punkty.length - 1];
  s.append(svg('circle', { cx: x(punkty.length - 1), cy: y(ost[1]), r: 4, fill: '#efeff1' }));
  return el('div', {}, s, el('div', { class: 'kiedy', style: 'text-align:left' },
    `${punkty.length - 1} walk · teraz ${ost[1]} ELO`));
}

// ---------- ROUTER I START ----------

function pokaz() {
  const [widok, arg] = decodeURIComponent(location.hash.slice(1)).split('/');
  document.getElementById('nav-ranking').classList.toggle('akt', widok !== 'mecze');
  document.getElementById('nav-mecze').classList.toggle('akt', widok === 'mecze');
  if (widok === 'mecze') pokazMecze();
  else if (widok === 'gracz' && arg) pokazGracza(arg);
  else pokazRanking(arg || 'ogolny');
  window.scrollTo(0, 0);
}

document.getElementById('szukaj').addEventListener('submit', e => {
  e.preventDefault();
  const nick = document.getElementById('szukaj-pole').value.trim();
  if (nick) location.hash = '#gracz/' + encodeURIComponent(nick);
});
document.getElementById('szukaj-pole').addEventListener('change', e => {
  if (dane && dane.gracze[e.target.value]) location.hash = '#gracz/' + encodeURIComponent(e.target.value);
});
document.getElementById('kopiuj').addEventListener('click', e => {
  navigator.clipboard?.writeText('miopvp.duckdns.org').then(() => { e.target.textContent = 'Skopiowano!'; });
});

fetch('dane.json', { cache: 'no-store' })
  .then(r => { if (!r.ok) throw new Error(r.status); return r.json(); })
  .then(d => {
    dane = d;
    document.getElementById('nicki').replaceChildren(...Object.keys(d.gracze).sort().map(n => el('option', { value: n })));
    document.getElementById('zaktualizowano').textContent = 'Zaktualizowano: ' + new Date(d.zaktualizowano).toLocaleString('pl-PL');
    window.addEventListener('hashchange', pokaz);
    pokaz();
  })
  .catch(() => {
    tresc.replaceChildren(el('div', { class: 'karta pusto', style: 'margin-top:24px' }, 'Nie udało się wczytać danych, odśwież stronę.'));
  });
