/* Pure calculation and validation; no storage or network. */
(function (root) {
  'use strict';
  // Resolve lazily: Apps Script does not guarantee the evaluation order of .gs files.
  function menuRules() { return typeof module !== 'undefined' && module.exports ? require('./menus.js') : root.SwimMenus; }
  const GRADES = ['7', '6', '5', '4', '3', '2', '1', ...Array.from({length: 10}, (_, i) => `A${i + 1}`)];
  const STROKES = {BF: 'バタフライ', BK: '背泳ぎ', BR: '平泳ぎ', FR: '自由形', IM: '個人メドレー', 'Fly/Back': 'バタフライ／背泳ぎ', 'Breast/Free': '平泳ぎ／自由形'};
  function dateParts(value) {
    if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
    const [year, month, day] = value.split('-').map(Number);
    if (year < 1900 || year > 2200) return null;
    const date = new Date(Date.UTC(year, month - 1, day));
    return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day ? {year, month, day} : null;
  }
  function ageOn(birth, date) {
    const b = dateParts(birth), d = dateParts(date);
    if (!b || !d || birth > date) return null;
    return d.year - b.year - (d.month < b.month || (d.month === b.month && d.day < b.day) ? 1 : 0);
  }
  function schoolYear(birth, date) {
    const d = dateParts(date), b = dateParts(birth);
    if (!d || !b || birth > date) return '—';
    const fiscal = d.year - (d.month < 4 ? 1 : 0);
    const entry = b.year + (b.month < 4 || (b.month === 4 && b.day === 1) ? 6 : 7);
    const n = fiscal - entry + 1;
    return n < 1 ? '未就学' : n <= 6 ? `小学${n}年` : n <= 9 ? `中学${n - 6}年` : n <= 12 ? `高校${n - 9}年` : '高校卒業後';
  }
  function ageBand(age) {
    if (!Number.isInteger(age) || age < 8 || age > 120) return -1;
    return age <= 12 ? age - 8 : age <= 14 ? 5 : 6;
  }
  function nextGrade(grade) {
    const i = GRADES.indexOf(grade);
    return i < 0 || i === GRADES.length - 1 ? null : GRADES[i + 1];
  }
  function gradeLabel(grade) {
    if (!grade) return '未選択';
    return /^A\d+$/.test(grade) ? `${Number(grade.slice(1))}段` : `${grade}級`;
  }
  function sortPupils(pupils) {
    // Higher ranks first; equal grades retain the registration/source order.
    return [...pupils].sort((a, b) => GRADES.indexOf(b.grade) - GRADES.indexOf(a.grade));
  }
  const HISTORY_TYPES = ['registered', 'passed', 'grade_changed', 'transferred', 'class_renamed', 'withdrawn', 'rejoined', 'profile_updated', 'pass_reverted', 'withdraw_reverted', 'test_recorded'];
  function historyEvent(event) {
    if (!event || !HISTORY_TYPES.includes(event.type) || !dateParts(event.date)
        || typeof event.at !== 'string' || !/^\d{4}-\d{2}-\d{2}T/.test(event.at) || !Number.isFinite(Date.parse(event.at))) throw new Error('履歴の日付・内容が正しくありません。');
    const result = {type: event.type, date: event.date, at: event.at, from: text(event.from || '', 200, '変更前の記録'), to: text(event.to || '', 200, '変更後の記録'), note: text(event.note || '', 1000, '履歴メモ'), detail: text(event.detail || '', 500, '履歴の詳細')};
    if (event.type === 'test_recorded') {
      const t = event.test;
      if (!t || !GRADES.slice(1).includes(t.grade) || !Object.hasOwn(STROKES,t.stroke)
          || ![50,100].includes(t.distance) || !Number.isInteger(t.age) || t.age < 0 || t.age > 120
          || !Number.isFinite(t.seconds) || t.seconds < 0.01 || t.seconds >= 3600 || Math.abs(t.seconds*100-Math.round(t.seconds*100))>1e-6
          || (t.standardSeconds !== null && (!Number.isFinite(t.standardSeconds) || t.standardSeconds <= 0))) throw new Error('実測タイムの記録が正しくありません。');
      result.test = {grade:t.grade,stroke:t.stroke,distance:t.distance,age:t.age,seconds:Math.round(t.seconds*100)/100,standardSeconds:t.standardSeconds};
    }
    return result;
  }
  function parseMeasuredTime(value) {
    const input = typeof value === 'string' ? value.normalize('NFKC').trim() : '';
    const colon = /^(\d{1,2}):([0-5]?\d)(?:\.(\d{1,2}))?$/.exec(input);
    const seconds = colon ? Number(colon[1])*60 + Number(colon[2]) + Number('0.'+(colon[3] || '0')) : /^\d{1,4}(?:\.\d{1,2})?$/.test(input) ? Number(input) : NaN;
    if (!Number.isFinite(seconds) || seconds <= 0 || seconds >= 3600) throw new Error('タイムは「1:23.45」または「83.45」の形式で、0秒より大きく60分未満で入力してください。小数は2桁までです。');
    return Math.round(seconds*100)/100;
  }
  function formatMeasuredTime(seconds) {
    if (!Number.isFinite(seconds)) return '—';
    const hundredths = Math.round(seconds*100);
    return `${Math.floor(hundredths/6000)}:${String(Math.floor(hundredths%6000/100)).padStart(2,'0')}.${String(hundredths%100).padStart(2,'0')}`;
  }
  function recordTest(pupil, grade, value, rules, context, pass = false) {
    if (pupil.status === 'withdrawn') throw new Error('再入会後にタイムを記録してください。');
    const index = GRADES.indexOf(grade);
    if (index < 1) throw new Error('種目が登録されている受験級を選択してください。');
    const result = calculate({...pupil,grade:GRADES[index-1]},context.date,rules);
    if (result.age === null || !result.stroke || !result.distance) throw new Error('テスト日・受験級を確認してください。');
    const seconds = parseMeasuredTime(value);
    let changed = recordPupil(pupil,{...context,type:'test_recorded',test:{grade,stroke:result.stroke,distance:result.distance,age:result.age,seconds,standardSeconds:result.seconds}});
    if (pass) {
      if (nextGrade(pupil.grade) !== grade) throw new Error('合格にできるのは現在の合格級のひとつ先です。');
      changed = promotePupil(changed,{...context,detail:`${STROKES[result.stroke]} ${result.distance}m / 実測 ${formatMeasuredTime(seconds)}`});
    }
    return changed;
  }
  function latestTest(pupil, date, grade) {
    return [...(pupil.history || [])].reverse().find(h => h.type === 'test_recorded' && h.date === date && h.test.grade === grade) || null;
  }
  function recordPupil(pupil, event) {
    if ((pupil.history || []).length >= 2000) throw new Error('履歴が上限に達しました。バックアップを保存してください。');
    return {...pupil, history: [...(pupil.history || []), historyEvent(event)]};
  }
  function promotePupil(pupil, context) {
    if (pupil.status === 'withdrawn') throw new Error('退会済みの子どもは再入会後に合格を記録してください。');
    const grade = nextGrade(pupil.grade);
    if (!grade) throw new Error('次の級が登録されていません。');
    return recordPupil({...pupil, grade}, {...context, type:'passed', from:pupil.grade, to:grade});
  }
  function withdrawPupil(pupil, context) {
    if (pupil.status === 'withdrawn') throw new Error('すでに退会済みです。');
    return recordPupil({...pupil, status:'withdrawn'}, {...context, type:'withdrawn', from:pupil.group});
  }
  function rejoinPupil(pupil, group, context) {
    if (pupil.status !== 'withdrawn') throw new Error('この子どもは在籍中です。');
    const value = text(group, 50, 'クラス');
    if (!value) throw new Error('再入会先のクラスを選択してください。');
    return recordPupil({...pupil, status:'active', group:value}, {...context, type:'rejoined', from:pupil.group, to:value});
  }
  function transferPupil(pupil, group, context) {
    if (pupil.status === 'withdrawn') throw new Error('退会済みの子どもは再入会先のクラスを選択してください。');
    const value = text(group, 50, 'クラス');
    if (!value || value === pupil.group) throw new Error('別のクラスを選択してください。');
    return recordPupil({...pupil, group:value}, {...context, type:'transferred', from:pupil.group, to:value});
  }
  function formatTime(seconds) {
    if (!Number.isFinite(seconds)) return '—';
    const tenths = Math.round(seconds * 10);
    return `${Math.floor(tenths / 600)}:${String(Math.floor(tenths % 600 / 10)).padStart(2, '0')}.${tenths % 10}`;
  }
  function calculate(pupil, date, rules) {
    const age = ageOn(pupil.birthDate, date), next = nextGrade(pupil.grade);
    const base = {age, school: schoolYear(pupil.birthDate, date), next, stroke: '', distance: null, seconds: null, status: ''};
    if (age === null) return {...base, status: '生年月日・テスト日を確認'};
    if (!GRADES.includes(pupil.grade)) return {...base, status: '合格級を選択'};
    if (!next) return {...base, status: '次の級の基準表がありません'};
    if (pupil.grade === '7') return {...base, stroke: 'IM', distance: 100, status: 'タイム規定なし'};
    const rule = rules.find(r => r.grade === next);
    if (!rule) return {...base, status: '基準表がありません'};
    const result = {...base, stroke: rule.stroke, distance: rule.distance};
    if (!['male', 'female'].includes(pupil.sex)) return {...result, status: '性別を選択'};
    const band = ageBand(age);
    if (band < 0) return {...result, status: 'この年齢の基準がありません'};
    return {...result, seconds: rule[pupil.sex][band]};
  }
  function text(value, max, label) {
    if (typeof value !== 'string' || value.length > max) throw new Error(`${label}の形式が正しくありません。`);
    return value.trim();
  }
  function validateBackup(raw) {
    if (!raw || raw.format !== 'swim-local' || raw.version !== 1 || !Array.isArray(raw.pupils)) throw new Error('このアプリの初期データ／バックアップJSONを選んでください。');
    if (raw.pupils.length > 10000) throw new Error('名簿は10,000人までです。');
    const ids = new Set();
    const pupils = raw.pupils.map(p => {
      if (!p || typeof p !== 'object') throw new Error('名簿データが正しくありません。');
      const id = text(p.id, 100, 'ID'), name = text(p.name, 100, '氏名');
      if (!id || ids.has(id) || !name) throw new Error('IDの重複または氏名の空欄があります。');
      ids.add(id);
      if (!dateParts(p.birthDate) || !['male', 'female', ''].includes(p.sex) || !['', ...GRADES].includes(p.grade)) throw new Error('生年月日・性別・合格級のいずれかが正しくありません。');
      let source = null;
      if (p.source != null) {
        const s = p.source;
        source = {};
        for (const key of ['file', 'sheet', 'grade', 'stroke', 'distance', 'time']) source[key] = text(s[key], 100, '元表の値');
        source.confirmation = text(s.confirmation || '', 200, '確認内容');
        if (!Number.isInteger(s.row) || s.row < 1) throw new Error('元表の行番号が正しくありません。');
        source.row = s.row;
      }
      if (p.review != null && typeof p.review !== 'boolean') throw new Error('確認状態が正しくありません。');
      const group = text(p.group, 50, 'クラス');
      if (!group) throw new Error('所属クラスが空欄です。');
      const status = p.status || 'active';
      if (!['active', 'withdrawn'].includes(status) || (p.history != null && (!Array.isArray(p.history) || p.history.length > 2000))) throw new Error('在籍状態または履歴の形式が正しくありません。');
      const history = (p.history || []).map(historyEvent);
      return {id, name, birthDate: p.birthDate, sex: p.sex, grade: p.grade, group, status, history, note: text(p.note || '', 1000, 'メモ'), review: Boolean(p.review), source};
    });
    if (raw.testDate && !dateParts(raw.testDate)) throw new Error('テスト日が正しくありません。');
    const revision = raw.dataRevision ?? 0;
    if (!Number.isInteger(revision) || revision < 0 || revision > 2) throw new Error('対応していない名簿の更新版です。');
    // One-time migration for the lower block of the original J workbook.
    // Never reset an explicit move to another group or repeat on later saves.
    if (revision < 2) pupils.forEach(p => {
      if (p.group === 'J' && p.source?.file === 'J.xlsx' && p.source.sheet === '202611'
          && p.source.row >= 11 && p.source.row <= 18 && p.id === `J-${p.source.row}`) p.group = 'J2';
    });
    if (raw.classes != null && (!Array.isArray(raw.classes) || raw.classes.length > 1000)) throw new Error('クラス一覧の形式が正しくありません。');
    const classes = (raw.classes || []).map(name => {
      const value = text(name, 50, 'クラス');
      if (!value) throw new Error('クラス名が空欄です。');
      return value;
    });
    return {format: 'swim-local', version: 1, dataRevision: 2, testDate: raw.testDate || '', classes: [...new Set([...classes, ...pupils.filter(p => p.status === 'active').map(p => p.group)])], pupils, ...menuRules().validate(raw)};
  }
  function csvCell(value) {
    let valueText = String(value ?? '');
    if (/^[\s]*[=+@-]/.test(valueText)) valueText = "'" + valueText;
    return '"' + valueText.replace(/"/g, '""') + '"';
  }
  function importBackup(current, incoming, mode) {
    const valid = validateBackup(incoming);
    const baseline = validateBackup(current);
    if (mode === 'replace') return {...valid, testDate: valid.testDate || baseline.testDate,
      // Older offline backups do not contain practice data; importing them must not erase lesson plans.
      menuCards: incoming.menuCards == null ? baseline.menuCards : valid.menuCards,
      lessons: incoming.lessons == null ? baseline.lessons : valid.lessons};
    if (mode !== 'merge') throw new Error('反映方法を選択してください。');
    const map = new Map(baseline.pupils.map(p => [p.id, p]));
    valid.pupils.forEach(p => {
      const previous = map.get(p.id);
      const events = new Map([...(previous?.history || []), ...p.history].map(h => [JSON.stringify(h), h]));
      map.set(p.id, {...p, history:[...events.values()].sort((a,b) => a.at.localeCompare(b.at))});
    });
    const mergedList=(old,list)=>[...new Map([...old,...list].map(x=>[x.id,x])).values()];
    return validateBackup({...baseline, classes: [...new Set([...baseline.classes, ...valid.classes])], pupils: [...map.values()],menuCards:mergedList(baseline.menuCards,valid.menuCards),lessons:mergedList(baseline.lessons,valid.lessons)});
  }
  function addClass(current, name) {
    const baseline = validateBackup(current), value = text(name, 50, 'クラス');
    if (!value) throw new Error('クラス名を入力してください。');
    if (baseline.classes.includes(value)) throw new Error('同じ名前のクラスがすでにあります。');
    return validateBackup({...baseline, classes: [...baseline.classes, value]});
  }
  function renameClass(current, oldName, name, context) {
    const baseline = validateBackup(current), value = text(name, 50, 'クラス');
    if (!value) throw new Error('クラス名を入力してください。');
    if (!baseline.classes.includes(oldName)) throw new Error('変更するクラスが見つかりません。');
    if (oldName !== value && baseline.classes.includes(value)) throw new Error('同じ名前のクラスがすでにあります。');
    return validateBackup({...baseline, classes: baseline.classes.map(g => g === oldName ? value : g), pupils: baseline.pupils.map(p => {
      if (p.status !== 'active' || p.group !== oldName || oldName === value) return p;
      const changed = {...p, group:value};
      return context ? recordPupil(changed, {...context, type:'class_renamed', from:oldName, to:value}) : changed;
    })});
  }
  function removeClass(current, name) {
    const baseline = validateBackup(current);
    if (baseline.pupils.some(p => p.status === 'active' && p.group === name)) throw new Error('在籍中の子どもを別のクラスへ移してから削除してください。');
    return {...baseline, classes: baseline.classes.filter(g => g !== name)};
  }
  const api = {GRADES, STROKES, dateParts, ageOn, schoolYear, ageBand, nextGrade, gradeLabel, sortPupils, promotePupil, recordPupil, withdrawPupil, rejoinPupil, transferPupil, formatTime, parseMeasuredTime, formatMeasuredTime, recordTest, latestTest, calculate, validateBackup, importBackup, addClass, renameClass, removeClass, csvCell};
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.SwimCore = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
