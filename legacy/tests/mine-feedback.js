const g=require('/tmp/stub.js');
let fail=0;const ck=(n,c,d)=>{console.log((c?'PASS ':'FAIL ')+n+(d?'  '+d:''));if(!c)fail++;};
// step only until the capture registers, since flash and float text both expire on a timer
g.setCur(g.BUILTIN.find(m=>m.name==='Skirmish'));g.start('camp');
const mine=g.S.mines[0];
for(let i=0;i<3;i++)g.S.units.push(g.mkUnit(0,'inf',mine.x+i*3-3,mine.y));
let ticks=0;while(mine.owner!==0&&ticks<300){g.update(1/60);ticks++;}
ck('captured',mine.owner===0,'after '+ticks+' ticks');
ck('income flash set at capture',g.S.incFlash>0,'incFlash='+g.S.incFlash.toFixed(2));
const txt=g.S.fx.filter(f=>f.k==='txt');
ck('float text queued at capture',txt.length>0,JSON.stringify(txt.map(f=>f.str)));
// and confirm both do expire rather than sticking
for(let i=0;i<150;i++)g.update(1/60);
ck('flash expires',g.S.incFlash<=0);
ck('float text expires',!g.S.fx.some(f=>f.k==='txt'));
// loss side
for(const u of g.S.units)if(u.team===0)u.hp=0;
g.update(1/60);
for(let i=0;i<3;i++)g.S.units.push(g.mkUnit(1,'inf',mine.x+i*3-3,mine.y));
ticks=0;while(mine.owner!==1&&ticks<300){g.update(1/60);ticks++;}
ck('lost float text',g.S.fx.some(f=>f.k==='txt'&&f.str==='LOST'),JSON.stringify(g.S.fx.filter(f=>f.k==='txt').map(f=>f.str)));
ck('flash set on loss',g.S.incFlash>0);
console.log(fail?('\n'+fail+' FAILURES'):'\nALL PASS');
