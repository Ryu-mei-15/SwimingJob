const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const C = require('../src/core.js');
const root = path.resolve(__dirname, '..');
const rules = JSON.parse(fs.readFileSync(path.join(root,'src/rules.json'),'utf8'));
const seed = JSON.parse(fs.readFileSync(path.join(root,'tests/fixtures/roster.json'),'utf8'));
const child = (overrides={}) => ({id:'test-child',name:'動作確認',birthDate:'2015-11-07',sex:'male',group:'確認用',grade:'6',note:'',review:false,source:null,...overrides});
const backup = pupils => ({format:'swim-local',version:1,testDate:'2026-11-01',pupils});
const context = {date:'2026-10-26',at:'2026-10-26T09:00:00.000Z'};

test('birthday changes the threshold on the selected test date',()=>{
  const pupil=child({birthDate:'2016-11-07'});
  const before=C.calculate(pupil,'2026-11-06',rules), on=C.calculate(pupil,'2026-11-07',rules);
  assert.equal(before.age,9); assert.equal(before.seconds,75);
  assert.equal(on.age,10); assert.equal(on.seconds,70);
  assert.equal(on.next,'5'); assert.equal(on.stroke,'BF'); assert.equal(on.distance,50);
});
test('date arithmetic handles year rollover, leap day and invalid dates',()=>{
  assert.equal(C.ageOn('2016-12-31','2026-01-01'),9);
  assert.equal(C.ageOn('2016-02-29','2026-02-28'),9);
  assert.equal(C.ageOn('2016-02-29','2026-03-01'),10);
  for(const d of ['2025-02-29','2026-04-31','2026-13-01','',null,'2026-1-2']) assert.equal(C.dateParts(d),null);
  assert.equal(C.ageOn('2027-01-01','2026-01-01'),null);
});
test('school years handle April 1 / April 2 birth and fiscal rollover',()=>{
  assert.equal(C.schoolYear('2014-04-01','2026-04-01'),'中学1年');
  assert.equal(C.schoolYear('2014-04-02','2026-04-01'),'小学6年');
  assert.equal(C.schoolYear('2014-04-01','2026-03-31'),'小学6年');
  assert.equal(C.schoolYear('2021-04-02','2026-04-01'),'未就学');
});
test('age bands include 13/14 together and 15+ without extrapolating under 8',()=>{
  assert.deepEqual([7,8,9,10,11,12,13,14,15,18].map(C.ageBand),[-1,0,1,2,3,4,5,5,6,6]);
  assert.equal(C.calculate(child({birthDate:'2019-11-07'}),'2026-11-01',rules).seconds,null);
});
test('progression crosses numeric / A grade and stops at unsupported end',()=>{
  assert.equal(C.nextGrade('7'),'6'); assert.equal(C.nextGrade('2'),'1'); assert.equal(C.nextGrade('1'),'A1');
  assert.equal(C.nextGrade('A1'),'A2'); assert.equal(C.nextGrade('A9'),'A10'); assert.equal(C.nextGrade('A10'),null);
  assert.equal(C.nextGrade('8'),null); assert.equal(C.nextGrade(''),null);
});
test('Excel A-prefixed identifiers are displayed as dan ranks everywhere',()=>{
  assert.equal(C.gradeLabel('1'),'1級');
  assert.equal(C.gradeLabel('A1'),'1段');
  assert.equal(C.gradeLabel('A2'),'2段');
  assert.equal(C.gradeLabel('A10'),'10段');
  assert.equal(C.gradeLabel(''),'未選択');
});
test('grade 7 has medley 100m with no time requirement',()=>{
  const r=C.calculate(child({grade:'7'}),'2026-11-01',rules);
  assert.deepEqual([r.next,r.stroke,r.distance,r.seconds,r.status],['6','IM',100,null,'タイム規定なし']);
});
test('sex-specific A-grade times and 13/14/15 boundaries',()=>{
  const expected={male:[65,63,60,57,55,53,53,52],female:[65,63,60,58,56,54,54,53]};
  for(const sex of ['male','female']) {
    const actual=[8,9,10,11,12,13,14,15].map(age=>C.calculate(child({birthDate:`${2026-age}-01-01`,sex,grade:'1'}),'2026-11-01',rules).seconds);
    assert.deepEqual(actual,expected[sex]);
  }
});
test('advanced combination events preserve stroke and distance',()=>{
  const r=C.calculate(child({birthDate:'2013-01-01',grade:'A7'}),'2026-11-01',rules);
  assert.equal(r.next,'A8'); assert.equal(r.stroke,'Breast/Free'); assert.equal(r.distance,100); assert.equal(r.seconds,96);
});
test('missing inputs and A10 never invent a time',()=>{
  for(const patch of [{birthDate:''},{sex:''},{grade:''},{grade:'A10'}]) {
    const r=C.calculate(child(patch),'2026-11-01',rules);
    assert.equal(r.seconds,null); assert.ok(r.status);
  }
});
test('time formatting carries minute boundary and preserves tenths',()=>{
  assert.equal(C.formatTime(55),'0:55.0'); assert.equal(C.formatTime(125),'2:05.0');
  assert.equal(C.formatTime(59.96),'1:00.0'); assert.equal(C.formatTime(null),'—');
});
test('measured times accept minutes or seconds and preserve hundredths without guessing invalid input',()=>{
  for(const [input,expected] of [['1:23.45',83.45],['83.45',83.45],['0:59.8',59.8],[' １：２３．４５ ',83.45],['2:05',125],['59:59.99',3599.99]]) {
    assert.equal(C.parseMeasuredTime(input),expected);
    assert.equal(C.parseMeasuredTime(C.formatMeasuredTime(expected)),expected);
  }
  assert.equal(C.formatMeasuredTime(83.45),'1:23.45');
  for(const input of ['',null,'0','0:00','1:60','-20','NaN','1:23.456','83s','1e2','3600','60:00']) assert.throws(()=>C.parseMeasuredTime(input));
});
test('recording a time alone preserves grade and snapshots event, age and target at the test date',()=>{
  const pupil=child({birthDate:'2016-11-07'});
  const recorded=C.recordTest(pupil,'5','1:14.23',rules,{...context,date:'2026-11-06',note:'後半も安定'});
  assert.equal(recorded.grade,'6'); assert.equal(pupil.history,undefined);
  const event=recorded.history[0];
  assert.deepEqual(event.test,{grade:'5',stroke:'BF',distance:50,age:9,seconds:74.23,standardSeconds:75});
  assert.equal(event.date,'2026-11-06'); assert.equal(event.note,'後半も安定');
  const restored=C.validateBackup(JSON.parse(JSON.stringify(backup([recorded]))));
  assert.deepEqual(restored.pupils[0].history,recorded.history);
  const changedBirth={...restored.pupils[0],birthDate:'2014-01-01'};
  assert.equal(C.latestTest(changedBirth,'2026-11-06','5').test.standardSeconds,75);
  assert.equal(C.latestTest(changedBirth,'2026-11-07','5'),null);
  assert.equal(C.latestTest(changedBirth,'2026-11-06','4'),null);
});
test('recording and passing is atomic and remains optional; past-grade timing does not re-promote',()=>{
  const pupil=child();
  const passed=C.recordTest(pupil,'5','70',rules,context,true);
  assert.equal(passed.grade,'5');
  assert.deepEqual(passed.history.map(h=>h.type),['test_recorded','passed']);
  const later=C.recordTest(passed,'5','68.91',rules,context);
  assert.equal(later.grade,'5'); assert.equal(C.latestTest(later,context.date,'5').test.seconds,68.91);
  assert.equal(later.history.length,3);
  assert.throws(()=>C.recordTest(pupil,'4','70',rules,context,true));
  assert.throws(()=>C.recordTest(pupil,'5','bad',rules,context,true));
  assert.equal(pupil.grade,'6'); assert.equal(pupil.history,undefined);
  const withdrawn=C.withdrawPupil(later,context);
  const restored=C.importBackup(backup([]),backup([withdrawn]),'replace');
  assert.equal(restored.pupils[0].history[0].test.seconds,70);
  assert.throws(()=>C.recordTest(withdrawn,'5','70',rules,context));
});
test('untimed events may record measured times and malformed timing backups are rejected',()=>{
  const recorded=C.recordTest(child({grade:'7'}),'6','2:50.99',rules,context);
  assert.equal(recorded.history[0].test.standardSeconds,null);
  for(const patch of [{seconds:0},{seconds:0.001},{seconds:70.123},{seconds:3600},{grade:'7'},{stroke:'invalid'},{distance:0},{age:-1},{standardSeconds:-1}]) {
    const bad=structuredClone(recorded); Object.assign(bad.history[0].test,patch);
    assert.throws(()=>C.validateBackup(backup([bad])));
  }
  const missing=structuredClone(recorded);delete missing.history[0].test;
  assert.throws(()=>C.validateBackup(backup([missing])));
  assert.throws(()=>C.recordTest(child(),'7','70',rules,context));
  assert.throws(()=>C.recordTest(child(),'5','70',rules,{...context,date:'2010-01-01'}));
});
test('all imported pupils round-trip with user-confirmed event corrections',()=>{
  const data=C.validateBackup(seed);
  assert.equal(data.pupils.length,28);
  assert.deepEqual(Object.fromEntries(['D5','D7','J','J2'].map(g=>[g,data.pupils.filter(p=>p.group===g).length])),{D5:3,D7:9,J:8,J2:8});
  assert.deepEqual(data.pupils.filter(p=>p.review).map(p=>p.id),[]);
  assert.equal(data.pupils.find(p=>p.id==='J-2').grade,'A1');
  const mikiya=data.pupils.find(p=>p.id==='D5-2'), sawa=data.pupils.find(p=>p.id==='J-2');
  assert.equal(C.calculate(mikiya,'2026-11-01',rules).stroke,'Breast/Free');
  assert.equal(C.calculate(sawa,'2026-11-01',rules).stroke,'BK');
  assert.match(mikiya.source.confirmation,/平泳ぎ＋クロール100m/);
  assert.match(sawa.source.confirmation,/背泳ぎ50m/);
  assert.deepEqual(C.validateBackup(JSON.parse(JSON.stringify(data))),data);
  for(const p of data.pupils) {const r=C.calculate(p,'2026-11-01',rules); assert.ok(r.stroke); assert.ok(r.age>=8);}
});
test('restore rejects wrong schema, duplicate IDs and malformed fields',()=>{
  for(const data of [null,{}, {...backup([]),version:2},backup([child(),child()]),backup([child({birthDate:'2026-02-30'})]),backup([child({sex:'x'})]),backup([child({grade:'A11'})]),backup([child({group:' '})]),backup([child({name:''})]),backup([child({source:{}})])]) assert.throws(()=>C.validateBackup(data));
});
test('CSV treats spreadsheet formulas and quotes as literal text',()=>{
  assert.equal(C.csvCell('=HYPERLINK("https://example.invalid")'),'"\'=HYPERLINK(""https://example.invalid"")"');
  assert.equal(C.csvCell('氏名,"確認"'),'"氏名,""確認"""');
  assert.ok(C.csvCell('\t@SUM(1)').startsWith('"\''));
});
test('merge updates a moved child by stable ID, adds new children, and keeps other classes',()=>{
  const current=backup([child(),child({id:'keep',group:'D7'})]);
  const incoming={...backup([child({group:'移動先',grade:'A1'}),child({id:'new',name:'新規登録'})]),testDate:'2026-12-01'};
  const result=C.importBackup(current,incoming,'merge');
  assert.equal(result.pupils.length,3);
  assert.equal(result.pupils.find(p=>p.id==='test-child').group,'移動先');
  assert.equal(result.pupils.find(p=>p.id==='test-child').grade,'A1');
  assert.equal(result.pupils.find(p=>p.id==='keep').group,'D7');
  assert.equal(result.testDate,'2026-11-01');
  assert.equal(current.pupils[0].group,'確認用');
  assert.deepEqual(C.importBackup(result,incoming,'merge'),result);
});
test('replace fully restores deleted children and the backup date',()=>{
  const saved={...backup([child()]),testDate:'2026-12-07'};
  const result=C.importBackup(backup([child({id:'temporary'})]),saved,'replace');
  assert.deepEqual(result,C.validateBackup(saved));
  assert.equal(C.importBackup(backup([]),seed,'replace').testDate,'2026-11-01');
  assert.throws(()=>C.importBackup(backup([]),saved,'invalid'));
});
test('built HTML has no personal roster or remote dependencies',()=>{
  const html=fs.readFileSync(path.join(root,'index.html'),'utf8');
  assert.ok(html.includes("connect-src 'none'"));
  assert.doesNotMatch(html,/<script[^>]+src=|<link[^>]+href=["']https?:|\bfetch\s*\(|XMLHttpRequest|WebSocket/);
  for(const p of seed.pupils) assert.ok(!html.includes(p.name));
  assert.doesNotMatch(html,/__(STYLES|RULES|CORE|APP)__/);
});
test('sorting follows achievement rank, handles 10段 correctly and preserves equal-rank order',()=>{
  const pupils=['7','1','A2','A10','','3','A1','A2'].map((grade,i)=>child({id:String(i),grade}));
  const sorted=C.sortPupils(pupils);
  assert.deepEqual(sorted.map(p=>p.grade),['A10','A2','A2','A1','1','3','7','']);
  assert.deepEqual(sorted.filter(p=>p.grade==='A2').map(p=>p.id),['2','7']);
  assert.equal(pupils[0].grade,'7');
});
test('pass action advances one rank and updates the next event without changing identity',()=>{
  for(const [grade,expected,nextStroke] of [['7','6','BF'],['2','1','BF'],['1','A1','BK'],['A9','A10','']]) {
    const original=child({grade}), promoted=C.promotePupil(original,context);
    assert.equal(promoted.grade,expected);
    assert.equal(promoted.id,original.id); assert.equal(promoted.birthDate,original.birthDate);
    assert.equal(original.grade,grade);
    assert.equal(promoted.history[0].type,'passed');
    assert.equal(promoted.history[0].date,context.date);
    assert.equal(promoted.history[0].from,grade);
    assert.equal(C.calculate(promoted,'2026-11-01',rules).stroke,nextStroke);
  }
  assert.throws(()=>C.promotePupil(child({grade:'A10'})));
  assert.throws(()=>C.promotePupil(child({grade:''})));
});
test('legacy rosters become active without inventing historical events',()=>{
  const data=C.validateBackup(backup([child()]));
  assert.equal(data.pupils[0].status,'active');
  assert.deepEqual(data.pupils[0].history,[]);
});
test('transfer, withdrawal and rejoining retain identity, grade and complete history',()=>{
  const initial=C.validateBackup(backup([child()])).pupils[0];
  const passed=C.promotePupil(initial,{...context,detail:'バタフライ 50m / 規定 1:10.0'});
  const moved=C.transferPupil(passed,'J2',{...context,note:'曜日の変更'});
  const withdrawn=C.withdrawPupil(moved,{...context,note:'転居'});
  assert.equal(withdrawn.status,'withdrawn');
  assert.equal(withdrawn.group,'J2'); assert.equal(withdrawn.grade,'5');
  assert.throws(()=>C.promotePupil(withdrawn,context));
  assert.throws(()=>C.transferPupil(withdrawn,'J',context));
  assert.throws(()=>C.withdrawPupil(withdrawn,context));
  const restored=C.validateBackup(JSON.parse(JSON.stringify(backup([withdrawn]))));
  assert.deepEqual(restored.pupils[0],withdrawn);
  assert.deepEqual(restored.classes,[]);
  const rejoined=C.rejoinPupil(restored.pupils[0],'J',{...context,note:'再開'});
  assert.equal(rejoined.status,'active'); assert.equal(rejoined.group,'J');
  assert.equal(rejoined.id,initial.id); assert.equal(rejoined.birthDate,initial.birthDate); assert.equal(rejoined.grade,'5');
  assert.deepEqual(rejoined.history.map(h=>h.type),['passed','transferred','withdrawn','rejoined']);
  assert.deepEqual(rejoined.history.map(h=>h.note),['','曜日の変更','転居','再開']);
  assert.equal(rejoined.history[1].from,'確認用'); assert.equal(rejoined.history[1].to,'J2');
  assert.equal(initial.history.length,0); assert.equal(initial.group,'確認用');
  assert.throws(()=>C.rejoinPupil(rejoined,'J',context));
  assert.throws(()=>C.transferPupil(rejoined,'J',context));
});
test('class changes affect active members and preserve archived final class',()=>{
  const archived=C.withdrawPupil(child({id:'retired'}),context);
  const data=C.validateBackup(backup([child(),archived]));
  const renamed=C.renameClass(data,'確認用','J3',context);
  assert.equal(renamed.pupils[0].group,'J3');
  assert.equal(renamed.pupils[0].history[0].type,'class_renamed');
  assert.equal(renamed.pupils[1].group,'確認用');
  assert.deepEqual(renamed.pupils[1].history,archived.history);
  const onlyArchived=C.validateBackup({...backup([archived]),classes:['確認用']});
  const removed=C.removeClass(onlyArchived,'確認用');
  assert.deepEqual(removed.classes,[]); assert.equal(removed.pupils[0].group,'確認用');
  assert.deepEqual(C.validateBackup(JSON.parse(JSON.stringify(removed))),removed);
});
test('backup merge retains both event histories without duplicating them; replace restores exact snapshot',()=>{
  const initial=child();
  const passed=C.promotePupil(initial,context);
  const moved=C.transferPupil(passed,'J',{...context,at:'2026-10-26T10:00:00.000Z'});
  const withdrawn=C.withdrawPupil(moved,{...context,at:'2026-10-26T11:00:00.000Z'});
  const current=C.validateBackup(backup([withdrawn]));
  const incoming=C.validateBackup(backup([passed]));
  const merged=C.importBackup(current,incoming,'merge');
  assert.equal(merged.pupils[0].status,'active');
  assert.deepEqual(merged.pupils[0].history.map(h=>h.type),['passed','transferred','withdrawn']);
  assert.deepEqual(C.importBackup(merged,incoming,'merge'),merged);
  assert.deepEqual(C.importBackup(current,incoming,'replace'),incoming);
});
test('invalid membership and malformed histories are rejected before replacing saved data',()=>{
  for(const patch of [{status:'deleted'},{history:{}},{history:[{...context,type:'unknown'}]},{history:[{...context,type:'withdrawn',date:'2026-02-30'}]},{history:[{...context,type:'passed',at:'not-a-date'}]}]) assert.throws(()=>C.validateBackup(backup([child(patch)])));
});
test('old J lower block migrates once without overwriting grades, notes or deliberate class moves',()=>{
  const legacy=JSON.parse(JSON.stringify(seed));
  delete legacy.dataRevision; delete legacy.classes;
  legacy.pupils.forEach(p=>{if(p.group==='J2')p.group='J';});
  const changed=legacy.pupils.find(p=>p.id==='J-11'); changed.grade='A7'; changed.note='保存済みのメモ';
  const moved=legacy.pupils.find(p=>p.id==='J-12'); moved.group='移動済み';
  const migrated=C.validateBackup(legacy);
  assert.equal(migrated.pupils.find(p=>p.id==='J-11').group,'J2');
  assert.equal(migrated.pupils.find(p=>p.id==='J-11').grade,'A7');
  assert.equal(migrated.pupils.find(p=>p.id==='J-11').note,'保存済みのメモ');
  assert.equal(migrated.pupils.find(p=>p.id==='J-12').group,'移動済み');
  assert.equal(migrated.pupils.find(p=>p.id==='J-9').group,'J');
  migrated.pupils.find(p=>p.id==='J-11').group='J';
  assert.equal(C.validateBackup(migrated).pupils.find(p=>p.id==='J-11').group,'J');
  assert.equal(C.importBackup(backup([]),migrated,'merge').pupils.find(p=>p.id==='J-11').group,'J');
  assert.equal(legacy.pupils.find(p=>p.id==='J-11').group,'J');
});
test('empty classes survive save/restore; renaming moves members and occupied deletion is blocked',()=>{
  const initial=C.validateBackup(backup([child()]));
  const added=C.addClass(initial,'J3');
  assert.ok(added.classes.includes('J3'));
  assert.ok(C.validateBackup(JSON.parse(JSON.stringify(added))).classes.includes('J3'));
  assert.ok(C.importBackup(backup([]),added,'replace').classes.includes('J3'));
  const renamed=C.renameClass(added,'確認用','新クラス');
  assert.equal(renamed.pupils[0].group,'新クラス');
  assert.equal(renamed.pupils[0].grade,initial.pupils[0].grade);
  assert.equal(renamed.pupils[0].id,initial.pupils[0].id);
  assert.throws(()=>C.removeClass(renamed,'新クラス'));
  assert.throws(()=>C.addClass(renamed,'J3'));
  assert.throws(()=>C.renameClass(renamed,'新クラス','J3'));
  assert.throws(()=>C.addClass(renamed,' '));
  assert.ok(!C.removeClass(renamed,'J3').classes.includes('J3'));
  assert.equal(initial.pupils[0].group,'確認用');
});
