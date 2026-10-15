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
const ruch = () => !window.matchMedia('(prefers-reduced-motion: reduce)').matches;

/** Dzieci pojawiaja sie jedno po drugim (CSS .kaskada + zmienna --i), gdy wjada w ekran. */
function kaskada(kontener) {
  kontener.classList.add('kaskada');
  [...kontener.children].forEach((d, i) => d.style.setProperty('--i', Math.min(i, 12)));
  return kontener;
}

// Obserwator: element dostaje .widac przy wejsciu w ekran; opoznienie liczone w paczce, ktora weszla razem.
const obserwator = 'IntersectionObserver' in window ? new IntersectionObserver(wpisy => {
  wpisy.filter(w => w.isIntersecting).forEach((w, i) => {
    w.target.style.setProperty('--i', i);
    w.target.classList.add('widac');
    obserwator.unobserve(w.target);
  });
}, { rootMargin: '0px 0px -8% 0px' }) : null;

function obserwuj() {
  document.querySelectorAll('.kaskada > *:not(.widac), .wjazd:not(.widac)').forEach(e => {
    if (obserwator) obserwator.observe(e); else e.classList.add('widac');
  });
}

/** Napis "miopvp.com" w stopce: kazda litera osobno (fala przy wejsciu i przy najechaniu). */
function litery(e) {
  const tekst = e.textContent;
  e.replaceChildren(...[...tekst].map((z, i) => el('span', { class: 'litera', style: '--l:' + i, 'aria-hidden': 'true' }, z)));
}

/** Pole z naglowkiem: tytul przesuwa sie wolniej niz strona (tylko translate). */
function paralaksa() {
  if (!ruch()) return;
  let czeka = false;
  addEventListener('scroll', () => {
    if (czeka) return;
    czeka = true;
    requestAnimationFrame(() => {
      const y = Math.min(scrollY, 600);
      document.querySelectorAll('.baner h1, .profil-top h1').forEach(h => h.style.setProperty('--paralaksa', (y * 0.18).toFixed(1) + 'px'));
      czeka = false;
    });
  }, { passive: true });
}

/** Liczby odliczaja sie od zera: podium (po wjezdzie karty), baner i statystyki profilu. */
function odliczanie() {
  if (!ruch()) return;
  const podium = [...document.querySelectorAll('.podium-liczba')];
  document.querySelectorAll('.podium-liczba, .baner-liczba b, .staty b').forEach(e => {
    const tekst = e.textContent;
    const cel = Number(tekst);
    if (tekst === '' || Number.isNaN(cel)) return; // tier (np. "HT3") nie jest liczba - zostaje bez odliczania
    const miejsca = (tekst.split('.')[1] || '').length;
    const i = podium.indexOf(e);
    const opoznienie = i < 0 ? 300 : [500, 400, 600][i] ?? 400; // kolejnosc w HTML: 2., 1., 3. miejsce
    e.textContent = (0).toFixed(miejsca);
    const start = performance.now() + opoznienie;
    const krok = t => {
      const p = Math.min(1, Math.max(0, (t - start) / 900));
      const v = cel * (1 - Math.pow(1 - p, 3));
      e.textContent = miejsca ? v.toFixed(miejsca) : String(Math.round(v));
      if (p < 1) requestAnimationFrame(krok);
    };
    requestAnimationFrame(krok);
  });
}

function czasTemu(iso) {
  const s = (Date.now() - new Date(iso).getTime()) / 1000;
  if (s < 60) return 'just now';
  if (s < 3600) return `${Math.floor(s / 60)} min ago`;
  if (s < 86400) return `${Math.floor(s / 3600)} h ago`;
  const dni = Math.floor(s / 86400);
  return dni === 1 ? 'yesterday' : `${dni} days ago`;
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
  const p = el('nav', { class: 'pigulki', 'aria-label': 'Kits' },
    el('a', { class: 'pig' + (aktywny === 'ogolny' ? ' akt' : ''), href: '#ranking/ogolny' }, 'Overall'));
  for (const k of dane.kity) {
    p.append(el('a', { class: 'pig' + (aktywny === k.klucz ? ' akt' : ''), href: '#ranking/' + k.klucz }, ikonaKitu(k.klucz), k.nazwa));
  }
  return kaskada(p);
}

/**
 * Ranking jak "Overall Ladder" z PvPHQ, w kolorach MIO PVP: baner, pigulki, podium TOP 3
 * (1 zloto, 2 srebro, 3 braz - te same kolory co tiery 1-3), dalej karty w dwoch kolumnach.
 */
function pokazRanking(kit) {
  if (kit !== 'ogolny' && !dane.rankingi[kit]) kit = 'ogolny';
  const ogolny = kit === 'ogolny';
  // Jeden format dla obu widokow: liczba = punkty (Ogolny) albo tier (kit).
  // Kolejnosc rankingu (podium i numery miejsc) zawsze wg tieru/ELO; sortowanie zmienia tylko kolejnosc kart 4+.
  const wgRankingu = ogolny
    ? dane.ogolny.map((g, i) => ({ nick: g.nick, liczba: g.punkty, jednostka: 'pkt', tiery: g.tiery, miejsce: i + 1 }))
    : dane.rankingi[kit].gracze.map((g, i) => ({ nick: g.nick, liczba: g.tier, jednostka: 'tier', tier: g.tier, gr: g, miejsce: i + 1 }));
  const reszta = ogolny ? wgRankingu.slice(3)
    : posortowane(wgRankingu.slice(3).map(g => ({ ...g.gr, _g: g }))).map(x => x._g);
  const gracze = wgRankingu.slice(0, 3).concat(reszta);
  const wszystkich = Object.keys(dane.gracze).length;

  // replaceChildren zamienia null na tekst "null" - puste czesci (np. brak listy przy <= 3 graczach) wyrzucamy.
  tresc.replaceChildren(...[
    pigulki(kit),
    baner(ogolny ? 'Overall ranking' : nazwaKitu(kit), gracze.length, wszystkich),
    gracze.length ? podium(gracze.slice(0, 3)) : el('div', { class: 'karta pusto' },
      ogolny ? 'Nobody has finished placements yet.' : 'Nobody has a tier in ' + nazwaKitu(kit) + ' yet.'),
    gracze.length > 3 ? el('div', { class: 'lista-pasek' },
      el('span', {}, 'Showing ', el('b', { class: 'wart' }, gracze.length), ' players'),
      ogolny ? el('span', { class: 'maly' }, 'By tier') : sortowanieKitu(kit)) : null,
    gracze.length > 3 ? kaskada(el('div', { class: 'karty-graczy' }, gracze.slice(3).map(g => kartaGracza(g, g.miejsce)))) : null,
    bliskoTieru(kit)].filter(Boolean));
}

/** Gracze w kwalifikacjach: kto ile walk ma do tieru (w kicie albo we wszystkich kitach). */
function bliskoTieru(kit) {
  const prog = dane.progi.kwalifikacje;
  const wpisy = {};
  for (const k of dane.kity) {
    if (kit !== 'ogolny' && k.klucz !== kit) continue;
    for (const q of (dane.rankingi[k.klucz] || {}).kwalifikacje || []) (wpisy[q.nick] ||= []).push({ klucz: k.klucz, mecze: q.mecze });
  }
  const gracze = Object.entries(wpisy).map(([nick, kity]) => ({ nick, kity: kity.sort((a, b) => b.mecze - a.mecze) }))
    .sort((a, b) => b.kity[0].mecze - a.kity[0].mecze || a.nick.localeCompare(b.nick)).slice(0, 8);
  if (!gracze.length) return null;
  return el('section', { class: 'blisko' },
    el('h2', { class: 'sekcja-tytul wjazd' }, 'Close to a tier'),
    el('p', { class: 'pod' }, 'Players still in placements. You get a tier after ' + prog + ' Ranked fights in a kit.'),
    kaskada(el('div', { class: 'lista' }, gracze.map(g => el('div', { class: 'w' }, linkGracza(g.nick, 48),
      el('span', { class: 'prawo blisko-kity' }, g.kity.slice(0, 3).map(k => el('span', { class: 'kg-tier', title: nazwaKitu(k.klucz) },
        ikonaKitu(k.klucz), el('span', { class: 'num' }, k.mecze + '/' + prog)))))))));
}

function baner(nazwa, wRankingu, wszystkich) {
  return el('div', { class: 'baner' },
    el('div', {},
      el('h1', {}, nazwa),
      el('p', { class: 'pod' }, 'Tiers count only Ranked fights. Your first ' + dane.progi.kwalifikacje + ' fights in a kit are placements.')),
    el('div', { class: 'baner-liczba' }, el('b', { class: 'num' }, wRankingu),
      el('span', {}, 'ranked, out of ' + wszystkich + ' players')));
}

const MIEJSCA = [{ klasa: 'p1' }, { klasa: 'p2' }, { klasa: 'p3' }];

function podium(top) {
  // Kolejnosc na ekranie: 2, 1, 3 (zwyciezca w srodku).
  // Puste miejsce zostaje na podium jako zaproszenie, zeby uklad 2-1-3 sie nie rozpadal.
  return el('div', { class: 'podium' }, [1, 0, 2].map(i => {
    const g = top[i];
    const m = MIEJSCA[i];
    if (!g) return el('div', { class: 'podium-karta wolne ' + m.klasa },
      el('div', { class: 'podium-miejsce num', 'aria-label': 'Place ' + (i + 1) }, i + 1),
      el('div', { class: 'podium-nick' }, 'Open spot'),
      el('p', { class: 'wolne-opis' }, 'Finish ' + dane.progi.kwalifikacje + ' placement fights in any kit to stand here.'));
    return el('a', { class: 'podium-karta ' + m.klasa, href: '#gracz/' + encodeURIComponent(g.nick) },
      el('div', { class: 'podium-miejsce num', 'aria-label': 'Place ' + (i + 1) }, i + 1),
      el('img', { class: 'cialo', src: `https://mc-heads.net/body/${encodeURIComponent(g.nick)}/${i === 0 ? 210 : 150}`, alt: g.nick + "'s skin", loading: 'lazy' }),
      el('div', { class: 'podium-nick' }, g.nick),
      el('div', {}, el('span', { class: 'podium-liczba ' + (g.tier ? tierKlasa(g.tier) : 'num') }, g.liczba),
        el('span', { class: 'podium-jedn' }, g.jednostka === 'pkt' ? ' pts' : '')));
  }));
}

function kartaGracza(g, miejsce) {
  return el('a', { class: 'karta-gracza', href: '#gracz/' + encodeURIComponent(g.nick) },
    el('div', { class: 'kg-miejsce num' }, miejsce),
    glowa(g.nick, 64),
    el('div', { class: 'kg-srodek' },
      el('div', { class: 'kg-nick' }, g.nick),
      el('div', { class: 'kg-tiery' }, g.tiery
        ? dane.kity.filter(k => g.tiery[k.klucz]).map(k => el('span', { class: 'kg-tier ' + tierKlasa(g.tiery[k.klucz]), title: k.nazwa },
          ikonaKitu(k.klucz), g.tiery[k.klucz]))
        : [el('span', { class: 'num' }, el('span', { class: 'plus' }, g.gr.wygrane), ' / ',
          el('span', { class: 'minus' }, g.gr.przegrane), ' · ' + Math.round(winrate(g.gr) * 100) + '%')])),
    el('div', { class: 'kg-liczba' }, el('b', { class: g.tier ? tierKlasa(g.tier) : 'num' }, g.liczba), el('span', {}, g.jednostka)));
}

const SORTY = [
  { kol: 'elo', nazwa: 'Tier', wartosc: g => g.elo },
  { kol: 'winrate', nazwa: 'Winrate', wartosc: g => winrate(g) },
  { kol: 'wygrane', nazwa: 'Wins', wartosc: g => g.wygrane },
  { kol: 'nick', nazwa: 'Nick' },
];
const winrate = g => (g.wygrane + g.przegrane ? g.wygrane / (g.wygrane + g.przegrane) : 0);

function posortowane(lista) {
  const sort = SORTY.find(s => s.kol === sortowanie.kol) || SORTY[0];
  return [...lista].sort((a, b) => {
    if (sort.kol === 'nick') return (sortowanie.malejaco ? -1 : 1) * a.nick.localeCompare(b.nick);
    const roznica = sort.wartosc(b) - sort.wartosc(a);
    return (sortowanie.malejaco ? roznica : -roznica) || a.nick.localeCompare(b.nick);
  });
}

/** Przyciski sortowania nad lista kitu; drugi klik odwraca kolejnosc. */
function sortowanieKitu(kit) {
  return el('div', { class: 'mini-pig', style: 'margin:0' }, el('span', { class: 'maly', style: 'margin-right:6px' }, 'Sort:'),
    SORTY.map(s => el('button', {
      type: 'button', class: sortowanie.kol === s.kol ? 'akt' : null,
      onclick: () => {
        sortowanie.malejaco = sortowanie.kol === s.kol ? !sortowanie.malejaco : s.kol !== 'nick';
        sortowanie.kol = s.kol;
        pokazRanking(kit);
        tresc.classList.add('cisza'); // przy sortowaniu bez ponownego wjazdu podium
      },
    }, s.nazwa + (sortowanie.kol === s.kol ? (sortowanie.malejaco ? ' ▾' : ' ▴') : ''))));
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
    el('div', { class: 'kiedy', title: new Date(m.czas).toLocaleString('en-GB') }, czasTemu(m.czas)));
}

function pokazMecze() {
  const ranked = dane.mecze.filter(m => m.ranked).length;
  tresc.replaceChildren(
    el('div', { class: 'baner' },
      el('div', {}, el('h1', {}, 'Matches'), el('p', { class: 'pod' }, 'Latest fights on the server, Ranked and Unranked, with the ELO change for every Ranked fight.')),
      el('div', { class: 'baner-liczba' }, el('b', { class: 'num' }, dane.mecze.length), el('span', {}, 'recent fights, ' + ranked + ' of them Ranked'))),
    dane.mecze.length ? kaskada(el('div', { class: 'mecze' }, dane.mecze.map(wierszMeczu)))
      : el('div', { class: 'karta pusto' }, 'No fights yet. Join miopvp.com and play!'));
}

// ---------- PROFIL ----------

function pokazGracza(nick) {
  const klucz = Object.keys(dane.gracze).find(n => n.toLowerCase() === nick.toLowerCase());
  if (!klucz) {
    tresc.replaceChildren(el('div', { class: 'karta pusto', style: 'margin-top:24px' }, 'No such player: ', nick));
    return;
  }
  const g = dane.gracze[klucz];
  const naj = najlepszyTier(g);
  const gl = g.globalnie;
  const kd = gl.smierci ? (gl.zabojstwa / gl.smierci).toFixed(2) : String(gl.zabojstwa);

  const kity = kaskada(el('div', { class: 'kity' }, dane.kity.map(k => {
    const s = g.kity[k.klucz];
    return el('div', { class: 'kit' },
      el('div', { class: 'naz' }, ikonaKitu(k.klucz), k.nazwa),
      !s ? el('span', { class: 'kwal', style: 'opacity:.6' }, 'Not played')
        : s.tier ? plakietkaTieru(s.tier)
          : el('span', { class: 'kwal' }, `Placements ${s.kwalifikacje}/${dane.progi.kwalifikacje}`),
      el('div', { class: 'elo num' }, s && s.tier ? `${s.elo} ELO · ${s.wygrane}W/${s.przegrane}L` : '—'));
  })));

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
    miejsceWykresu.append(el('div', { class: 'pusto' }, 'No Ranked fights since history started.'));
  }

  tresc.replaceChildren(
    el('div', { class: 'profil-top' },
      glowa(klucz, 192),
      el('div', {},
        el('h1', {}, klucz),
        el('p', { class: 'pod' },
          naj ? ['Best tier: ', plakietkaTieru(naj.tier), ' ', nazwaKitu(naj.klucz), ' · '] : 'No tier · ',
          el('b', { class: 'wart' }, g.punkty + ' pts'))),
      el('div', { class: 'staty' },
        el('div', {}, el('b', {}, gl.wygrane), el('span', {}, 'Wins')),
        el('div', {}, el('b', {}, gl.przegrane), el('span', {}, 'Losses')),
        el('div', {}, el('b', {}, kd), el('span', {}, 'K/D')),
        el('div', {}, el('b', {}, gl.najlepszaSeria), el('span', {}, 'Best streak')))),
    kity,
    el('div', { class: 'dwie' },
      el('div', { class: 'karta wykres' }, el('h2', { class: 'sekcja-tytul' }, 'Wins over time'), przyciski, miejsceWykresu),
      kaskada(el('div', { class: 'lista' },
        el('h2', { class: 'sekcja-tytul' }, 'Top rivals'),
        g.rywale.length ? g.rywale.map(r => el('div', { class: 'w' }, linkGracza(r.nick, 44),
          el('span', { class: 'prawo num' }, el('span', { class: 'plus' }, r.w), ' – ', el('span', { class: 'minus' }, r.l))))
          : el('div', { class: 'pusto' }, 'Nobody yet.')))),
    kaskada(el('div', { class: 'lista' },
      el('h2', { class: 'sekcja-tytul' }, 'Recent matches'),
      g.mecze.length ? g.mecze.map(m => wierszProfilu(m, klucz)) : el('div', { class: 'pusto' }, 'No fights.'))));
}

function wierszProfilu(m, nick) {
  const ja = m.a.nick === nick ? m.a : m.b;
  const on = ja === m.a ? m.b : m.a;
  const wynik = m.wygral === null ? ['Draw', 'wart'] : (m[m.wygral] === ja ? ['Win', 'plus'] : ['Loss', 'minus']);
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

/** Wygrane Ranked narastajaco (kolejne walki rowno co punkt), os od 0. */
function rysujWykres(punkty) {
  if (punkty.length < 2) return el('div', { class: 'pusto' }, 'Not enough fights for a chart.');
  const W = 600, H = 180, M = 8;
  const max = Math.max(1, ...punkty.map(p => p[1]));
  const x = i => M + (i * (W - 2 * M)) / (punkty.length - 1);
  const y = v => H - M - (v * (H - 2 * M)) / max;
  const s = svg('svg', { viewBox: `0 0 ${W} ${H}`, preserveAspectRatio: 'none', role: 'img', 'aria-label': 'Wins chart' });
  const d = punkty.map((p, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(p[1]).toFixed(1)}`).join(' ');
  s.append(
    svg('path', { d: `${d} L${x(punkty.length - 1)},${H} L${x(0)},${H} Z`, opacity: '.12' }),
    svg('path', { d, fill: 'none', stroke: '#efeff1', 'stroke-width': 2.5, 'vector-effect': 'non-scaling-stroke' }));
  const ost = punkty[punkty.length - 1];
  s.append(svg('circle', { cx: x(punkty.length - 1), cy: y(ost[1]), r: 4, fill: '#efeff1' }));
  return el('div', {}, s, el('div', { class: 'kiedy', style: 'text-align:left' },
    `${punkty.length - 1} fights · ${ost[1]} wins`));
}

// ---------- ROUTER I START ----------

function pokaz() {
  const [widok, arg] = decodeURIComponent(location.hash.slice(1)).split('/');
  document.getElementById('nav-ranking').classList.toggle('akt', widok !== 'mecze');
  document.getElementById('nav-mecze').classList.toggle('akt', widok === 'mecze');
  if (widok === 'mecze') pokazMecze();
  else if (widok === 'gracz' && arg) pokazGracza(arg);
  else pokazRanking(arg || 'ogolny');
  tresc.classList.remove('widok', 'cisza');
  void tresc.offsetWidth; // restart animacji pojawienia sie
  tresc.classList.add('widok');
  odliczanie();
  obserwuj();
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
litery(document.querySelector('.adres'));
document.querySelector('.adres').classList.add('wjazd');
obserwuj();
paralaksa();
document.querySelectorAll('.kopiuj-adres').forEach(b => b.addEventListener('click', () => {
  const przed = [...b.childNodes];
  navigator.clipboard?.writeText('miopvp.com').then(() => {
    b.textContent = 'Copied!';
    b.classList.add('skopiowano');
    setTimeout(() => { b.replaceChildren(...przed); b.classList.remove('skopiowano'); }, 1600);
  });
}));

fetch('dane.json', { cache: 'no-store' })
  .then(r => { if (!r.ok) throw new Error(r.status); return r.json(); })
  .then(d => {
    // Nazwy kitow na stronie, ktore roznia sie od config.yml pluginu (tiery.kity), skad bierze je eksport.
    const NAZWY_KITOW = { diamondsmp: 'DSMP' };
    for (const k of d.kity) if (NAZWY_KITOW[k.klucz]) k.nazwa = NAZWY_KITOW[k.klucz];
    dane = d;
    document.getElementById('nicki').replaceChildren(...Object.keys(d.gracze).sort().map(n => el('option', { value: n })));
    document.getElementById('zaktualizowano').textContent = 'Updated ' + new Date(d.zaktualizowano).toLocaleString('en-GB');
    window.addEventListener('hashchange', pokaz);
    pokaz();
  })
  .catch(() => {
    tresc.replaceChildren(el('div', { class: 'karta pusto', style: 'margin-top:24px' }, 'Could not load the data, please refresh the page.'));
  });
