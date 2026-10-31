// Text parsers for schedule / roster / stats / team imports.
// Inputs can be CSV, TSV (pasted from a spreadsheet), or loose text (typed or OCR'd from an image).
import { store } from '../core.js';
import { normName, similarity, parsePositions, normalizeClass, normalizePosition, statKeyForHeader, STATS } from '../shared.js';

/* ---------------------------------------------------------------- generic helpers */
export function splitLines(text) {
  return String(text || '').replace(/\r/g, '').split('\n').map((l) => l.replace(/[–—]/g, '-').replace(/ /g, ' ').trim());
}

function detectDelimiter(lines) {
  const sample = lines.filter(Boolean).slice(0, 8);
  if (!sample.length) return null;
  for (const d of ['\t', '|', ';', ',']) {
    const counts = sample.map((l) => splitRow(l, d).length);
    const min = Math.min(...counts);
    if (min >= 2 && counts.filter((c) => c === counts[0]).length >= Math.ceil(sample.length * 0.7)) return d;
  }
  return null;
}

export function splitRow(line, d) {
  if (d !== ',') return line.split(d).map((x) => x.trim()).filter((x, i, a) => !(d === '|' && (i === 0 || i === a.length - 1) && x === ''));
  const out = [];
  let cur = '', q = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (c === '"') { if (q && line[i + 1] === '"') { cur += '"'; i++; } else q = !q; }
    else if (c === ',' && !q) { out.push(cur.trim()); cur = ''; }
    else cur += c;
  }
  out.push(cur.trim());
  return out;
}

const hnorm = (h) => String(h || '').toLowerCase().replace(/[^a-z0-9#%]/g, '');

/* ---------------------------------------------------------------- team matching */
const STRIP_WORDS = /\b(university|univ|college|the|of|u)\b/g;
export function matchTeam(raw, extraTeams = []) {
  const name = String(raw || '').replace(/^\s*(#\d+|\(\d+\)|no\.\s*\d+)\s+/i, '').replace(/\s*\(\d+-\d+(-\d+)?\)\s*$/, '').trim();
  if (!name) return null;
  const n = normName(name);
  const n2 = normName(name.toLowerCase().replace(STRIP_WORDS, ''));
  const teams = [...store.teams, ...extraTeams];
  // exact keys
  for (const t of teams) {
    const keys = [t.name, t.abbr, t.mascot ? `${t.name} ${t.mascot}` : null, t.name.toLowerCase().replace(STRIP_WORDS, '')].filter(Boolean).map(normName);
    if (keys.includes(n) || keys.includes(n2)) return { team: t, score: 1 };
  }
  // mascot-only match (unique)
  const byMascot = teams.filter((t) => t.mascot && normName(t.mascot) === n);
  if (byMascot.length === 1) return { team: byMascot[0], score: 0.95 };
  // contains (longest team name contained in the input)
  let best = null;
  for (const t of teams) {
    const tn = normName(t.name);
    if (tn.length >= 4 && n.includes(tn) && (!best || tn.length > normName(best.team.name).length)) best = { team: t, score: 0.9 };
  }
  if (best) return best;
  // fuzzy
  let fz = null;
  for (const t of teams) {
    const s = Math.max(similarity(name, t.name), t.mascot ? similarity(name, `${t.name} ${t.mascot}`) : 0, t.abbr && n.length <= 6 ? similarity(name, t.abbr) : 0);
    if (s >= 0.78 && (!fz || s > fz.score)) fz = { team: t, score: s };
  }
  return fz;
}

/* ---------------------------------------------------------------- player matching */
export function matchPlayer(name, teamId = null) {
  const n = normName(name);
  if (!n) return { player: null, reason: 'no name' };
  let pool = store.players;
  if (teamId) pool = pool.filter((p) => p.teamId === teamId);
  const exact = pool.filter((p) => normName(p.name) === n);
  if (exact.length === 1) return { player: exact[0] };
  if (exact.length > 1) return { player: null, reason: 'Ambiguous — add a Team column', options: exact };
  // "J. Smith" style or last-name + first initial
  const parts = String(name).trim().split(/\s+/);
  if (parts.length >= 2 && /^[A-Za-z]\.?$/.test(parts[0])) {
    const init = parts[0][0].toLowerCase(), last = normName(parts.slice(1).join(' '));
    const m = pool.filter((p) => { const pp = p.name.trim().split(/\s+/); return pp[0][0].toLowerCase() === init && normName(pp.slice(1).join(' ')) === last; });
    if (m.length === 1) return { player: m[0], fuzzy: true };
  }
  let best = null, second = 0;
  for (const p of pool) {
    const s = similarity(name, p.name);
    if (!best || s > best.s) { second = best?.s || 0; best = { p, s }; } else if (s > second) second = s;
  }
  if (best && best.s >= 0.84 && best.s - second > 0.04) return { player: best.p, fuzzy: true };
  return { player: null, reason: 'Not on any roster' };
}

/* ---------------------------------------------------------------- dates & times */
const MONTHS = { jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, sept: 9, oct: 10, nov: 11, dec: 12 };
const TIME_RE = /\b(\d{1,2}(?::\d{2})?\s*(?:a\.?m\.?|p\.?m\.?)|\d{1,2}:\d{2}(?:\s*(?:et|ct|mt|pt|est|cst|pst|edt|cdt|pdt))?|tba|tbd|noon|midnight)\b/i;
const DATE_NUM_RE = /\b(\d{1,2})\/(\d{1,2})(?:\/(\d{2,4}))?\b/;
const DATE_TXT_RE = /\b(?:(?:mon|tue|tues|wed|thu|thur|thurs|fri|sat|sun)[a-z]*\.?,?\s+)?(jan|feb|mar|apr|may|jun|jul|aug|sept?|oct|nov|dec)[a-z]*\.?\s+(\d{1,2})(?:st|nd|rd|th)?(?:,?\s+(\d{4}))?\b/i;
const DOW_RE = /^(mon|tue|tues|wed|thu|thur|thurs|fri|sat|sun)[a-z]*\.?,?$/i;

function toISO(y, m, d, season) {
  const yr = y ? (String(y).length === 2 ? 2000 + Number(y) : Number(y)) : (Number(season) || new Date().getFullYear());
  if (!(m >= 1 && m <= 12 && d >= 1 && d <= 31)) return null;
  return `${yr}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}
export function findDate(s, season) {
  let m = DATE_TXT_RE.exec(s);
  if (m) return { iso: toISO(m[3], MONTHS[m[1].toLowerCase().slice(0, 4)] || MONTHS[m[1].toLowerCase().slice(0, 3)], Number(m[2]), season), match: m[0] };
  m = DATE_NUM_RE.exec(s);
  if (m) return { iso: toISO(m[3], Number(m[1]), Number(m[2]), season), match: m[0] };
  m = /\b(\d{4})-(\d{2})-(\d{2})\b/.exec(s);
  if (m) return { iso: m[0], match: m[0] };
  return null;
}
function cleanTime(t) {
  if (!t) return '';
  let s = t.trim().toUpperCase().replace(/\./g, '');
  if (s === 'NOON') return '12:00 PM';
  s = s.replace(/^(\d{1,2})\s*(AM|PM)$/, '$1:00 $2').replace(/(\d)(AM|PM)/, '$1 $2');
  return s;
}

/* ---------------------------------------------------------------- schedule */
const SEP_RE = /\s+(@|at|vs\.?|v\.?|versus)\s+|\s*@\s*/i;
const WEEK_RE = /^(?:week|wk)\.?\s*#?\s*(\d+)\b[:.\-\s]*(.*)$/i;
const SPECIAL_WEEK_RE = /^(championship|conference championship|playoffs?|semi-?finals?|quarter-?finals?|finals?|bowl[\w\s]*|[\w\s]+ bowl|rivalry week|preseason|postseason)\s*:?\s*$/i;

/**
 * Parse a schedule.
 * returns { games:[{week,date,time,location,broadcast,awayName,homeName,away,home,awayScore,homeScore,line}], unparsed:[lines], weeks:Set, stats }
 */
export function parseSchedule(text, { season, defaultWeek = '1', vsHomeFirst = true } = {}) {
  const lines = splitLines(text);
  const delim = detectDelimiter(lines.filter((l) => l));
  const out = { games: [], unparsed: [], headers: 0 };

  // ---- structured CSV/TSV with a header row
  if (delim) {
    const rows = lines.filter(Boolean).map((l) => splitRow(l, delim));
    const head = rows[0].map(hnorm);
    const idx = (...names) => head.findIndex((h) => names.includes(h));
    const iAway = idx('away', 'awayteam', 'visitor', 'visitors', 'visitingteam', 'road', 'team1');
    const iHome = idx('home', 'hometeam', 'host', 'team2');
    if (iAway >= 0 && iHome >= 0) {
      const iWeek = idx('week', 'wk', 'round'), iDate = idx('date', 'day', 'gamedate'), iTime = idx('time', 'kickoff', 'start', 'starttime');
      const iLoc = idx('location', 'site', 'venue', 'stadium', 'where', 'city'), iTv = idx('tv', 'network', 'broadcast', 'channel', 'stream');
      const iAs = idx('awayscore', 'visitorscore', 'awaypts'), iHs = idx('homescore', 'homepts'), iNeutral = idx('neutral', 'neutralsite');
      for (const r of rows.slice(1)) {
        if (!r.some(Boolean)) continue;
        const awayName = r[iAway], homeName = r[iHome];
        if (!awayName || !homeName) { out.unparsed.push(r.join(' | ')); continue; }
        const dateRaw = iDate >= 0 ? r[iDate] : '';
        const wk = iWeek >= 0 ? String(r[iWeek] || '').replace(/^(week|wk)\s*/i, '') : defaultWeek;
        out.games.push(mkGame({
          week: wk || defaultWeek, date: dateRaw ? findDate(dateRaw, season)?.iso || '' : '', time: iTime >= 0 ? cleanTime(r[iTime]) : '',
          location: iLoc >= 0 ? r[iLoc] : '', broadcast: iTv >= 0 ? r[iTv] : '', awayName, homeName,
          awayScore: iAs >= 0 && r[iAs] !== '' ? Number(r[iAs]) : null, homeScore: iHs >= 0 && r[iHs] !== '' ? Number(r[iHs]) : null,
          neutral: iNeutral >= 0 ? /^(y|yes|true|1|x)$/i.test(r[iNeutral] || '') : false, line: r.join(' | '),
        }));
      }
      return finishSchedule(out);
    }
  }

  // ---- loose text
  let week = defaultWeek, date = '';
  for (const raw of lines) {
    let line = raw.replace(/^[•*\-–>\s]+/, '').replace(/\s{2,}/g, ' ').trim();
    if (!line) continue;
    const hasSep = SEP_RE.test(line);

    // week headers (possibly with a game on the same line: "Week 3: A @ B")
    const wm = WEEK_RE.exec(line);
    if (wm) {
      week = wm[1];
      date = '';
      out.headers++;
      line = wm[2].trim().replace(/^[-:|,\s]+/, '');
      if (!line || !SEP_RE.test(line)) {
        const d = line && findDate(line, season);
        if (d) date = d.iso;
        continue;
      }
    } else if (!hasSep && SPECIAL_WEEK_RE.test(line)) {
      week = line.replace(/:$/, '').trim();
      date = '';
      out.headers++;
      continue;
    }

    if (!SEP_RE.test(line)) {
      // date-only header?
      const d = findDate(line, season);
      if (d && line.replace(d.match, '').replace(/[,\s]/g, '').replace(DOW_RE, '').length <= 3) { date = d.iso; out.headers++; continue; }
      if (DOW_RE.test(line)) continue;
      out.unparsed.push(raw);
      continue;
    }

    // split line into segments: matchup + extras (time, date, location, tv)
    let gDate = date, time = '', location = '', broadcast = '';
    const d = findDate(line, season);
    if (d) { gDate = d.iso; line = line.replace(d.match, ' '); }
    const tm = TIME_RE.exec(line);
    if (tm) { time = cleanTime(tm[0]); line = line.replace(tm[0], ' '); }
    line = line.replace(/\b(mon|tue|tues|wed|thu|thur|thurs|fri|sat|sun)(day)?\b\.?,?/gi, ' ');
    line = line.replace(/\s+/g, ' ').replace(/(\s[-|•·])+\s/g, ' - ').trim();
    const segs = line.split(/\s+[-|•·]\s+|\t|\s*\|\s*/).map((s) => s.trim().replace(/^[-,;:•·|\s]+|[-,;:•·|\s]+$/g, '').trim()).filter(Boolean);
    let matchSeg = segs.find((s) => SEP_RE.test(s));
    const extras = segs.filter((s) => s !== matchSeg && !/^\d{4}$/.test(s));
    // location inside parentheses or after "in"/"at <Stadium>"
    const paren = /\(([^)]{3,})\)\s*$/.exec(matchSeg);
    if (paren && !/^\d+-\d+/.test(paren[1])) { location = paren[1]; matchSeg = matchSeg.replace(paren[0], '').trim(); }
    for (const x of extras) {
      if (!location && !/^(espn|abc|cbs|fox|nbc|fs1|sec network|acc|big ten|tv|stream|youtube|twitch)/i.test(x)) location = x;
      else if (!broadcast) broadcast = x;
    }
    const sm = SEP_RE.exec(matchSeg);
    const sep = (sm[1] || '@').toLowerCase().replace('.', '');
    let left = matchSeg.slice(0, sm.index).trim(), right = matchSeg.slice(sm.index + sm[0].length).trim();
    // scores e.g. "Team A 24 @ Team B 17"
    let ls = null, rs = null;
    const lsm = /\s(\d{1,3})$/.exec(left), rsm = /\s(\d{1,3})$/.exec(right);
    if (lsm && rsm) { ls = Number(lsm[1]); rs = Number(rsm[1]); left = left.slice(0, lsm.index).trim(); right = right.slice(0, rsm.index).trim(); }
    // trailing "in City" style location on the right side
    const inLoc = /\s+in\s+(.{3,})$/i.exec(right);
    if (inLoc && !matchTeam(right)?.team) { location = location || inLoc[1]; right = right.slice(0, inLoc.index).trim(); }
    if (!left || !right) { out.unparsed.push(raw); continue; }
    const awayFirst = sep === '@' || sep === 'at' || !vsHomeFirst;
    const neutral = sep === 'vs' || sep === 'v' || sep === 'versus' ? /neutral/i.test(raw) : false;
    out.games.push(mkGame({
      week, date: gDate || '', time, location, broadcast,
      awayName: awayFirst ? left : right, homeName: awayFirst ? right : left,
      awayScore: ls == null ? null : awayFirst ? ls : rs, homeScore: rs == null ? null : awayFirst ? rs : ls,
      neutral, line: raw,
    }));
  }
  return finishSchedule(out);
}

function mkGame(g) {
  const strip = (s) => String(s || '').replace(/^\s*(#\d+|\(\d+\)|no\.\s*\d+)\s+/i, '').replace(/\s*\(\d+-\d+(-\d+)?\)\s*$/, '').trim();
  g.awayName = strip(g.awayName); g.homeName = strip(g.homeName);
  const a = matchTeam(g.awayName), h = matchTeam(g.homeName);
  g.away = a?.team || null; g.home = h?.team || null;
  g.awayFuzzy = a && a.score < 1; g.homeFuzzy = h && h.score < 1;
  return g;
}

function finishSchedule(out) {
  const unknown = new Set();
  for (const g of out.games) {
    if (!g.away) unknown.add(g.awayName);
    if (!g.home) unknown.add(g.homeName);
  }
  out.unknownTeams = [...unknown];
  const meaningful = out.games.length + out.unparsed.length;
  out.quality = !out.games.length ? 0 : out.games.length / meaningful;
  // names that look like OCR garbage
  out.garbage = out.unknownTeams.filter((n) => !/^[A-Za-z0-9 .&'()\-]{2,40}$/.test(n) || !/[aeiouy]/i.test(n));
  return out;
}

/* ---------------------------------------------------------------- roster */
const NAME_TOKEN = /^[A-Za-zÀ-ɏ][A-Za-zÀ-ɏ'’.\-]*$/;
const SINGLE_LETTER_POS = new Set(['C', 'S', 'K', 'P', 'G', 'T']);

function isPosToken(tok, nameSoFar) {
  const t = tok.replace(/[,;]$/, '');
  if (/^[A-Z]$/.test(t)) return SINGLE_LETTER_POS.has(t) && nameSoFar >= 2;
  if (!/^[A-Za-z\/\-]+$/.test(t)) return false;
  const parts = t.split(/[\/\-]/).filter(Boolean);
  if (!parts.length) return false;
  if (parts.some((p) => p.length === 1 && !(SINGLE_LETTER_POS.has(p.toUpperCase()) && p === p.toUpperCase()))) return false;
  return parts.every((p) => normalizePosition(p)) && (t === t.toUpperCase() || parts.every((p) => p.length > 3));
}

/** returns { players:[{name, positions[], cls, number, teamId, teamName, line}], unparsed:[] } */
export function parseRoster(text, { teamId = null } = {}) {
  const lines = splitLines(text);
  const delim = detectDelimiter(lines.filter(Boolean));
  const out = { players: [], unparsed: [], teamHeaders: [] };

  if (delim) {
    const rows = lines.filter(Boolean).map((l) => splitRow(l, delim));
    const head = rows[0].map(hnorm);
    const idx = (...n) => head.findIndex((h) => n.includes(h));
    const iName = idx('name', 'player', 'playername', 'fullname'), iFirst = idx('first', 'firstname'), iLast = idx('last', 'lastname');
    const iPos = idx('pos', 'position', 'positions', 'pos1'), iPos2 = idx('pos2', 'position2', 'secondaryposition', 'altpos');
    const iCls = idx('class', 'cls', 'yr', 'year', 'cl', 'elig', 'eligibility', 'grade');
    const iNum = idx('#', 'no', 'num', 'number', 'jersey', 'jerseynumber', 'jersey#');
    const iTeam = idx('team', 'school', 'college');
    if (iName >= 0 || (iFirst >= 0 && iLast >= 0)) {
      for (const r of rows.slice(1)) {
        if (!r.some(Boolean)) continue;
        const name = iName >= 0 ? r[iName] : `${r[iFirst] || ''} ${r[iLast] || ''}`.trim();
        if (!name) continue;
        const positions = [...parsePositions(r[iPos]), ...(iPos2 >= 0 ? parsePositions(r[iPos2]) : [])];
        let tId = teamId, teamName = null;
        if (iTeam >= 0 && r[iTeam]) { teamName = r[iTeam]; tId = matchTeam(r[iTeam])?.team?.id || null; }
        out.players.push({ name: name.replace(/\s+/g, ' '), positions: [...new Set(positions)], cls: normalizeClass(r[iCls]) || (r[iCls] || null), number: iNum >= 0 ? (r[iNum] || '').replace(/^#/, '') || null : null, teamId: tId, teamName, line: r.join(' | ') });
      }
      return mergeRoster(out);
    }
  }

  let curTeam = teamId, curTeamName = null;
  for (const raw of lines) {
    let line = raw.replace(/^[•*>\s]+/, '').trim();
    if (!line) continue;
    // team header lines: "Team: Creeper State" or a line that is exactly a team name
    const th = /^(?:team|school)\s*[:\-]\s*(.+)$/i.exec(line);
    const tm = th ? matchTeam(th[1]) : (line.split(/\s+/).length <= 5 && !/\d/.test(line) ? matchTeam(line) : null);
    if (tm?.team && (th || tm.score >= 0.95)) { curTeam = tm.team.id; curTeamName = tm.team.name; out.teamHeaders.push(tm.team.name); continue; }
    if (/^(name|player|#|no\.?)\b.*\b(pos|position)\b/i.test(line)) continue; // header row

    const toks = line.replace(/,/g, ' , ').split(/\s+/).filter(Boolean);
    let number = null, cls = null, positions = [], name = [], nameClosed = false, clsTokens = [];
    for (let i = 0; i < toks.length; i++) {
      const tok = toks[i];
      if (tok === ',') { if (name.length) nameClosed = true; continue; }
      if (number == null && /^#?\d{1,2}$/.test(tok) && (i === 0 || name.length === 0 || nameClosed || /^#/.test(tok))) { number = tok.replace('#', ''); if (name.length) nameClosed = true; continue; }
      const c = normalizeClass(tok);
      if (c && (name.length >= 1)) {
        // "Jr." right after a name could be a suffix; decide later
        clsTokens.push({ c, i, afterName: !nameClosed, tok });
        nameClosed = true;
        continue;
      }
      if (isPosToken(tok, name.length)) { positions.push(...parsePositions(tok)); if (name.length) nameClosed = true; continue; }
      if (!nameClosed && NAME_TOKEN.test(tok)) { name.push(tok); continue; }
      if (name.length) nameClosed = true;
    }
    if (clsTokens.length > 1 && clsTokens[0].afterName && /^jr\.?$/i.test(clsTokens[0].tok)) { name.push('Jr.'); clsTokens.shift(); }
    cls = clsTokens.length ? clsTokens[clsTokens.length - 1].c : null;
    if (name.length < 1 || (!positions.length && !cls && number == null)) { out.unparsed.push(raw); continue; }
    out.players.push({ name: name.join(' '), positions: [...new Set(positions)], cls, number, teamId: curTeam, teamName: curTeamName, line: raw });
  }
  return mergeRoster(out);
}

/** Same player listed twice (e.g. at two positions) => one player with both positions. */
function mergeRoster(out) {
  const map = new Map();
  const merged = [];
  for (const p of out.players) {
    const key = `${p.teamId || p.teamName || ''}::${normName(p.name)}`;
    const ex = map.get(key);
    if (ex) {
      for (const pos of p.positions) if (!ex.positions.includes(pos)) ex.positions.push(pos);
      ex.cls = ex.cls || p.cls; ex.number = ex.number || p.number;
      ex.mergedCount = (ex.mergedCount || 1) + 1;
    } else { map.set(key, p); merged.push(p); }
  }
  out.players = merged;
  out.duplicatesMerged = merged.reduce((s, p) => s + ((p.mergedCount || 1) - 1), 0);
  return out;
}

/* ---------------------------------------------------------------- stats */
/**
 * returns { rows:[{name, teamName, teamId, player, fuzzy, stats:{key:val}, reason}], columns:[{header,key}], ignored:[headers] }
 */
export function parseStats(text, { category = '', teamId = null } = {}) {
  const lines = splitLines(text).filter(Boolean);
  if (!lines.length) return { rows: [], columns: [], ignored: [] };
  let delim = detectDelimiter(lines);
  let rows;
  if (delim) rows = lines.map((l) => splitRow(l, delim));
  else rows = whitespaceTable(lines);
  if (!rows.length) return { rows: [], columns: [], ignored: [] };
  const head = rows[0];
  let iName = -1, iTeam = -1, iPos = -1;
  const columns = [], ignored = [];
  head.forEach((h, i) => {
    const n = hnorm(h);
    if (iName < 0 && ['name', 'player', 'playername', 'fullname'].includes(n)) { iName = i; return; }
    if (iTeam < 0 && ['team', 'school', 'tm', 'college'].includes(n)) { iTeam = i; return; }
    if (iPos < 0 && ['pos', 'position'].includes(n)) { iPos = i; return; }
    if (['#', 'no', 'rk', 'rank', 'gp', 'g', 'games', 'class', 'yr', 'cl'].includes(n)) { ignored.push(h); return; }
    const key = statKeyForHeader(h, category);
    if (key && !STATS[key]?.derived) columns.push({ header: h, key, i });
    else ignored.push(h);
  });
  // Auto mode: resolve generic headers (YDS, TD, INT, ATT…) using the table's dominant category
  if (!category && columns.length) {
    const counts = {};
    for (const c of columns) { const cat = STATS[c.key]?.cat; if (cat) counts[cat] = (counts[cat] || 0) + 1; }
    const dominant = Object.entries(counts).sort((a, b) => b[1] - a[1])[0]?.[0];
    if (dominant) {
      for (let k = ignored.length - 1; k >= 0; k--) {
        const h = ignored[k];
        const key = statKeyForHeader(h, dominant);
        if (key && !STATS[key]?.derived && !columns.some((c) => c.key === key)) {
          columns.push({ header: h, key, i: head.indexOf(h) });
          ignored.splice(k, 1);
        }
      }
    }
  }
  if (iName < 0) iName = 0;
  const out = [];
  for (const r of rows.slice(1)) {
    const name = (r[iName] || '').trim();
    if (!name || /^(total|totals|team|opponents?)$/i.test(name)) continue;
    let tId = teamId, teamName = null;
    if (iTeam >= 0 && r[iTeam]) { teamName = r[iTeam]; tId = matchTeam(r[iTeam])?.team?.id || teamId; }
    const m = matchPlayer(name, tId);
    const stats = {};
    for (const c of columns) {
      const v = String(r[c.i] ?? '').replace(/,/g, '').replace(/%$/, '').trim();
      if (v === '' || v === '-' || v === '--') continue;
      const num = Number(v);
      if (Number.isFinite(num)) stats[c.key] = (stats[c.key] || 0) + num;
    }
    out.push({ name, teamName, teamId: tId, player: m.player, fuzzy: m.fuzzy, reason: m.reason, stats });
  }
  return { rows: out, columns, ignored };
}

/** Parse a whitespace-separated table (e.g. OCR output): header tokens, then rows whose trailing tokens are numbers. */
function whitespaceTable(lines) {
  const head = lines[0].split(/\s{2,}|\t/).length > 2 ? lines[0].split(/\s{2,}|\t/) : lines[0].split(/\s+/);
  const statCount = head.filter((h) => !['name', 'player', 'team', 'school', 'pos', 'position'].includes(hnorm(h))).length;
  const lead = head.length - statCount;
  const rows = [head];
  for (const l of lines.slice(1)) {
    const toks = l.split(/\s+/);
    const nums = [];
    while (toks.length && /^-?[\d.,%]+$|^--?$/.test(toks[toks.length - 1]) && nums.length < statCount) nums.unshift(toks.pop());
    const row = new Array(head.length).fill('');
    // lead columns: name (+ team / pos)
    const leadCols = head.slice(0, lead).map(hnorm);
    let rest = toks;
    const iTeamCol = leadCols.findIndex((h) => ['team', 'school'].includes(h));
    const iPosCol = leadCols.findIndex((h) => ['pos', 'position'].includes(h));
    if (iPosCol >= 0) { const pi = rest.findIndex((t) => normalizePosition(t)); if (pi >= 0) { row[iPosCol] = rest[pi]; rest = rest.filter((_, i) => i !== pi); } }
    if (iTeamCol >= 0 && rest.length > 1) {
      // try trailing tokens as team name
      let best = null;
      for (let k = 1; k <= Math.min(4, rest.length - 1); k++) {
        const m = matchTeam(rest.slice(-k).join(' '));
        if (m && m.score >= 0.9 && (!best || m.score > best.score)) best = { k, score: m.score };
      }
      if (best) { row[iTeamCol] = rest.slice(-best.k).join(' '); rest = rest.slice(0, -best.k); }
    }
    const iNameCol = leadCols.findIndex((h) => ['name', 'player'].includes(h));
    row[iNameCol >= 0 ? iNameCol : 0] = rest.join(' ');
    nums.forEach((v, i) => { row[lead + (statCount - nums.length) + i] = v; });
    rows.push(row);
  }
  return rows;
}

/** Team season stats: first column team, other columns kept as labels. */
export function parseTeamStats(text) {
  const lines = splitLines(text).filter(Boolean);
  if (lines.length < 2) return { rows: [], headers: [] };
  const delim = detectDelimiter(lines);
  const rows = lines.map((l) => (delim ? splitRow(l, delim) : l.split(/\s{2,}|\t/)));
  const head = rows[0];
  let iTeam = head.findIndex((h) => ['team', 'school', 'name'].includes(hnorm(h)));
  if (iTeam < 0) iTeam = 0;
  const headers = head.map((h, i) => ({ h: h.trim(), i })).filter((x) => x.i !== iTeam && x.h);
  const out = rows.slice(1).map((r) => {
    const m = matchTeam(r[iTeam]);
    const stats = {};
    for (const { h, i } of headers) if (r[i] != null && r[i] !== '') stats[h] = r[i];
    return { name: r[iTeam], team: m?.team || null, stats };
  });
  return { rows: out, headers: headers.map((x) => x.h) };
}

/* ---------------------------------------------------------------- teams */
export function parseTeams(text) {
  const lines = splitLines(text).filter(Boolean);
  const delim = detectDelimiter(lines);
  const out = [];
  if (delim) {
    const rows = lines.map((l) => splitRow(l, delim));
    const head = rows[0].map(hnorm);
    const has = head.some((h) => ['name', 'team', 'school'].includes(h));
    const idx = (...n) => head.findIndex((h) => n.includes(h));
    const iName = has ? idx('name', 'team', 'school') : 0;
    const iAbbr = has ? idx('abbr', 'abbreviation', 'short', 'code') : 1;
    const iMascot = has ? idx('mascot', 'nickname') : 2;
    const iConf = has ? idx('conference', 'conf', 'division') : 3;
    const iColor = has ? idx('color', 'primarycolor', 'color1') : 4;
    const iColor2 = has ? idx('color2', 'secondarycolor') : 5;
    for (const r of rows.slice(has ? 1 : 0)) {
      if (!r[iName]) continue;
      out.push({ name: r[iName], abbr: r[iAbbr] || '', mascot: r[iMascot] || '', conference: r[iConf] || '', color: normColor(r[iColor]), color2: normColor(r[iColor2]) });
    }
    return out;
  }
  let conf = '';
  for (const l of lines) {
    const cm = /^(?:conference|conf|division)\s*[:\-]\s*(.+)$/i.exec(l) || /^(.+?)\s+(?:conference|division)\s*:?\s*$/i.exec(l);
    if (cm) { conf = cm[1].trim(); continue; }
    const name = l.replace(/^[•*\-\d.)\s]+/, '').trim();
    if (name) out.push({ name, abbr: '', mascot: '', conference: conf });
  }
  return out;
}
function normColor(c) {
  if (!c) return undefined;
  c = c.trim();
  if (/^#?[0-9a-f]{6}$/i.test(c)) return c.startsWith('#') ? c : '#' + c;
  return undefined;
}
