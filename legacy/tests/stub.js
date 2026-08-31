const noop=()=>{};
const mkCtx=()=>new Proxy({},{get:(t,p)=>p==='measureText'?()=>({width:0}):noop,set:()=>true});
function mkEl(id){const el={id,children:[],classList:{toggle:noop,add:noop,remove:noop},dataset:{},style:{},
  addEventListener(ev,fn){this._h=this._h||{};this._h[ev]=fn;},click(){this._h&&this._h.click&&this._h.click();},
  appendChild(c){this.children.push(c);this.firstChild=this.firstChild||c;},
  getContext:mkCtx,getBoundingClientRect:()=>({width:390,height:600,left:0,top:0}),
  querySelectorAll:(q)=>q.startsWith('#cmd')?['bTeam','bAll','bCharge','bHold','bPause','bEdit','bErase','bMirror','bClear','bMap','bPlay','bSize','bRandom','bMirrorMap','bClearMap','bCode','bDone','bMenu'].map(i=>els[i]||(els[i]=mkEl(i))):[],
  setPointerCapture:noop,set innerHTML(v){this._i=v;},get innerHTML(){return this._i;},
  set textContent(v){this._t=v;},get textContent(){return this._t;}};return el;}
const els={};
global.document={getElementById:id=>els[id]||(els[id]=mkEl(id)),createElement:()=>mkEl(),querySelectorAll:(q)=>els.c.querySelectorAll(q)};
global.window={addEventListener:noop};global.navigator={clipboard:{writeText:noop}};
global.requestAnimationFrame=noop;global.setTimeout=noop;
els.c=mkEl('c');
const src=require('fs').readFileSync('/tmp/g.js','utf8');
const code=src+`
;module.exports={get S(){return S},get W(){return W},get H(){return H},start,update,draw,hud,place,tap,paint,bplace,sell,B,unitTap,toEdit,startBattle,openEditor,TYPES,ORDER,BLD,BORDER,mkUnit,count,addBld,canBuild,BUILTIN,randomMap,connected,distField,encodeMap,decodeMap,allied,DIFF,mkBases,cloneMap,elim,get DIFFKEY(){return DIFFKEY},setDiff:(k)=>{DIFFKEY=k},get curMap(){return curMap},setCur:(m)=>{curMap=m}};`;
const m=new Function('module','require',code);const out={};m(out,require);
module.exports=out.exports;
