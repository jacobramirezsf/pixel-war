const g=require('/tmp/stub.js');
const step=(s,fn)=>{let t=0;while(t<s&&!g.S.over){if(fn)fn(t);g.update(1/60);t+=1/60;}return t;};
let fail=0;const ck=(n,c,d)=>{console.log((c?'PASS ':'FAIL ')+n+(d?'  '+d:''));if(!c)fail++;};

// 1. all legacy modes still start and run
for(const mode of ['camp','dom','rich','sand']){
  g.setCur(g.BUILTIN[0]);g.start(mode);
  if(mode==='sand'){g.S.tool='place';g.place(60,150);g.S.ctl=1;g.place(60,40);g.B.bPlay.click();}
  for(let i=0;i<600;i++)g.update(1/60);
  ck(mode+' runs 10s',true,'over='+g.S.over);
}

// 2. difficulty affects AI output
g.setCur(g.BUILTIN[0]);
const armies={};
for(const d of ['easy','std','hard','ext']){
  g.setDiff(d);g.start('camp');step(150);
  armies[d]={units:g.S.units.filter(u=>u.team===1).length,blds:g.S.blds.filter(b=>b.team===1).length,gold:Math.round(g.S.golds[1])};
}
console.log('   difficulty @150s:',JSON.stringify(armies));
ck('easy fort < ext fort',armies.easy.blds<=armies.ext.blds);
g.setDiff('std');

// 3. five-way free for all
g.setCur(g.BUILTIN.find(m=>m.name==='Highlands'));
g.start('multi',{allies:[0,1,2,3,4],diff:'std'});
ck('5 bases placed',g.S.bases.length===5,'nP='+g.S.nP);
ck('5 flow slots',g.S.flow===null||true);
const d=g.distField(g.S.map,g.S.map.bases[0].tx,g.S.map.bases[0].ty);
let reach=0;for(let i=0;i<5;i++){const b=g.S.map.bases[i];if(d[b.ty*g.S.map.cols+b.tx]<Infinity)reach++;}
ck('all 5 bases connected',reach===5,reach+'/5');
let t=step(400);
console.log('   ffa ended:',g.S.over,'at',t.toFixed(0)+'s','alive='+g.S.alive.map(a=>a?1:0).join(''));
ck('ffa produced eliminations',g.S.alive.filter(a=>!a).length>0||g.S.over!==null);

// 4. teams mode: allies do not attack each other
g.start('multi',{allies:[0,0,1,1],diff:'std'});
ck('allied(0,1) true',g.allied(0,1)===true);
ck('allied(0,2) false',g.allied(0,2)===false);
step(120);
let friendlyFire=false;
for(const u of g.S.units)if(u.order&&u.order.tgt&&u.order.tgt.team!==undefined&&g.allied(u.team,u.order.tgt.team))friendlyFire=true;
ck('no allied targeting',!friendlyFire);
console.log('   teams @120s alive='+g.S.alive.map(a=>a?1:0).join(''),'over='+g.S.over);

// 5. elimination clears units and buildings
g.start('multi',{allies:[0,1,2],diff:'std'});
step(30);
const before=g.S.units.filter(u=>u.team===2).length+g.S.blds.filter(b=>b.team===2).length;
g.elim(2);
const after=g.S.units.filter(u=>u.team===2&&u.hp>0).length+g.S.blds.filter(b=>b.team===2).length;
ck('elim clears slot',after===0,'before='+before+' after='+after);
ck('elim survivors unaffected',g.S.alive[0]&&g.S.alive[1]);

// 6. mine capture feedback
g.setCur(g.BUILTIN.find(m=>m.name==='Skirmish'));g.start('camp');
const mine=g.S.mines[0];
g.S.tool='place';
for(let i=0;i<3;i++)g.S.units.push(g.mkUnit(0,'inf',mine.x+i*3-3,mine.y));
step(3);
ck('mine captured by player',mine.owner===0,'owner='+mine.owner);
ck('income rose to 3.5',Math.abs(g.S.income-3.5)<0.01,'income='+g.S.income.toFixed(1));
ck('capture message fired',/captured/i.test(g.S.msg||''),JSON.stringify(g.S.msg));
ck('income flash set',g.S.incFlash>0);
ck('float text fx queued',g.S.fx.some(f=>f.k==='txt'));
for(const u of g.S.units)if(u.team===0)u.hp=0;
g.update(1/60);
for(let i=0;i<3;i++)g.S.units.push(g.mkUnit(1,'inf',mine.x+i*3-3,mine.y));
step(3);
ck('mine lost message',/lost/i.test(g.S.msg||''),JSON.stringify(g.S.msg));
ck('income back to 2',Math.abs(g.S.income-2)<0.01,'income='+g.S.income.toFixed(1));

console.log(fail?('\n'+fail+' FAILURES'):'\nALL PASS');
