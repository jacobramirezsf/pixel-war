const g=require('/tmp/stub.js');
const step=(s,fn)=>{let t=0;while(t<s&&!g.S.over){if(fn)fn(t);g.update(1/60);t+=1/60;}return t;};
let fail=0;const ck=(n,c,d)=>{console.log((c?'PASS ':'FAIL ')+n+(d?'  '+d:''));if(!c)fail++;};

// v2 regressions still intact in v3
g.setCur(g.BUILTIN[0]);g.start('sand');g.S.map.tiles.fill(0);
g.S.ctl=0;g.S.tool='build';g.S.bbrush='wal';
for(let x=1;x<18;x++)if(x!==9&&x!==10)g.bplace(x*8+4,14*8+4,null);
g.S.bbrush='gat';g.bplace(9*8+4,14*8+4,null);
const gt=g.S.blds.find(b=>b.kind==='gate');
ck('gate is 2 tiles',gt&&gt.tiles.length===2,gt&&JSON.stringify(gt.tiles));
ck('gate locked by default',gt&&gt.locked===true);
g.S.tool='place';g.S.brush='kni';for(let i=0;i<4;i++)g.place(40+i*12,150);
g.S.ctl=1;g.place(75,20);
g.B.bPlay.click();step(30);
const g2=g.S.blds.find(b=>b.kind==='gate');
ck('own units pass own locked gate',g.S.units.filter(u=>u.team===0&&u.y<110).length>0,g.S.units.filter(u=>u.team===0&&u.y<110).length+' through');
ck('gate undamaged by own units',g2&&g2.hp===g2.max);

// vertical gate orientation
g.start('sand');g.S.map.tiles.fill(0);
g.S.ctl=0;g.S.tool='build';g.S.bbrush='wal';g.bplace(6*8+4,9*8+4,null);g.bplace(6*8+4,12*8+4,null);
g.S.bbrush='gat';g.bplace(6*8+4,10*8+4,null);
const vg=g.S.blds.find(b=>b.kind==='gate');
ck('vertical gate auto-orients',vg&&vg.dir==='v',vg&&vg.dir);

// worker repair
g.setCur(g.BUILTIN[0]);g.start('camp');
g.S.golds[0]=200;g.S.tool='build';g.S.bbrush='wal';g.bplace(10*8+4,20*8+4,null);
const wall=g.S.blds.find(b=>b.team===0&&b.type==='wal');wall.hp=40;
g.unitTap('wrk');step(40);
ck('worker repairs wall',wall.hp>40,'hp '+Math.round(wall.hp)+'/'+wall.max);

// snapshot/replay/mirror with gates
g.start('sand');g.S.ctl=1;g.S.tool='build';g.S.bbrush='wal';
for(let dx=-3;dx<=3;dx++)if(dx!==0&&dx!==1)g.bplace((10+dx)*8+4,6*8+4,null);
g.S.bbrush='gat';g.bplace(10*8+4,6*8+4,null);
g.S.ctl=0;g.S.tool='place';g.S.brush='inf';g.place(60,150);
g.B.bPlay.click();
ck('gate survives replay',g.S.blds.some(b=>b.kind==='gate'));
g.toEdit();g.S.ctl=1;g.B.bMirror.click();
ck('mirror produces both gates',g.S.blds.filter(b=>b.kind==='gate').length===2,
   g.S.blds.filter(b=>b.kind==='gate').map(b=>b.team+'@'+b.tx+','+b.ty+b.dir).join(' '));
ck('bmap consistent',g.S.bmap.size===g.S.blds.reduce((a,b)=>a+b.tiles.length,0));

// campaign still winnable with a competent bot
function bot(t){
  if(t<25){if(g.S.golds[0]>=35)g.unitTap(t%2<1?'shd':'arc');
    if(Math.abs(t%8)<0.02){g.S.units.forEach(u=>{u.sel=u.team===0;});
      const m=g.S.mines[(t/8|0)%Math.max(1,g.S.mines.length)];if(m)g.tap(m.x,m.y);}return;}
  const mix=t<90?['shd','xbw','arc','med']:['mor','shd','snp','med','xbw','shd'];
  const w=mix[((t*2)|0)%mix.length];
  if(g.S.golds[0]>=g.TYPES[w].cost)g.unitTap(w);
  if(Math.abs(t%15)<0.02&&t>100)g.B.bCharge.click();
}
let wins=0;
for(const n of ['Crossroads','Riverlands','Highlands','Arena']){
  g.setCur(g.BUILTIN.find(m=>m.name===n));g.start('camp');
  const t=step(480,bot);if(g.S.over==='win')wins++;
  console.log('   '+n.padEnd(11),g.S.over,'at',t.toFixed(0)+'s');
}
ck('campaign winnable',wins>=2,wins+'/4 wins');
g.setCur(g.BUILTIN[0]);g.start('camp');
const rt=step(300,t=>{if(g.S.golds[0]>=20)g.unitTap('inf');if(Math.abs(t%12)<0.02)g.B.bCharge.click();});
ck('blind rush still loses',g.S.over==='lose','at '+rt.toFixed(0)+'s');

// map editor round trip
g.setCur(g.BUILTIN[2]);
const code=g.encodeMap(g.BUILTIN[2]);const back=g.decodeMap(code);
ck('map code round trip',back.cols===g.BUILTIN[2].cols&&back.rows===g.BUILTIN[2].rows&&g.connected(back));
console.log(fail?('\n'+fail+' FAILURES'):'\nALL PASS');
