/* Island Atelier — deterministic procedural terrain; all assets are local. */
(function () {
'use strict';
var previewTerraces=window.location.search.indexOf('preview=terraces')!==-1,previewEmpty=window.location.search.indexOf('preview=empty')!==-1,previewMode=previewTerraces||previewEmpty;
var T=window.THREE, host=document.getElementById('world');
var storage=window.IslandStorage||{getItem:function(k){return localStorage.getItem(k);},setItem:function(k,v){localStorage.setItem(k,v);}};
var $=function(id){return document.getElementById(id);};
$('retry').addEventListener('click',function(){location.reload();});
if(['THREE','IslandTerrain','IslandSurface','IslandWaterfalls','IslandBoatNavigation','IslandDecorations','IslandAudio','IslandFeedback','IslandControls'].some(function(name){return !window[name];})){$('fallback').hidden=false;$('fallback').querySelector('p').textContent='部分资源还未载入，请点「重新载入」继续。';return;}
var islandAudio=window.IslandAudio.create({persist:!previewMode,onChange:function(s){
 $('sound-toggle').textContent=s.muted?'♪':'♫';$('sound-toggle').setAttribute('aria-pressed',String(!s.muted));$('sound-toggle').setAttribute('aria-label',s.muted?'开启声音':'关闭声音');
 $('sfx-enabled').checked=s.sfx;$('music-enabled').checked=s.music;$('sfx-volume').value=Math.round(s.sfxVolume*100);$('music-volume').value=Math.round(s.musicVolume*100);
 $('audio-note').textContent=s.failed?'音乐暂时无法播放':s.muted?'小岛已静音':s.blocked?'再轻点一次，唤醒声音':s.musicPlaying?'轻轻循环播放中':s.music&&s.musicVolume===0?'背景音乐音量为零':s.music?'轻点海岛，听见海风':'背景音乐已关闭';host.setAttribute('data-audio-state',JSON.stringify(s));
}});
document.addEventListener('pointerdown',function(e){if(e.isTrusted)islandAudio.unlock();},true);
document.addEventListener('keydown',function(e){if(e.isTrusted&&(e.key==='Enter'||e.key===' '))islandAudio.unlock();},true);
$('sound-toggle').addEventListener('click',function(){islandAudio.set('muted',!islandAudio.state().muted);});
$('sfx-enabled').addEventListener('change',function(){islandAudio.set('sfx',this.checked);});
$('music-enabled').addEventListener('change',function(){islandAudio.set('music',this.checked);});
$('sfx-volume').addEventListener('input',function(){islandAudio.set('sfxVolume',Number(this.value)/100);});
$('music-volume').addEventListener('input',function(){islandAudio.set('musicVolume',Number(this.value)/100);});
window.addEventListener('pagehide',function(){islandAudio.suspend();});

if(!T){$('fallback').hidden=false;return;}
var renderer;
try{renderer=new T.WebGLRenderer({antialias:true,alpha:false,powerPreference:'low-power'});}catch(e){$('fallback').hidden=false;return;}
host.appendChild(renderer.domElement);
renderer.setClearColor(0x168c9e);renderer.outputColorSpace=T.SRGBColorSpace;
renderer.shadowMap.enabled=true;renderer.shadowMap.type=T.PCFSoftShadowMap;renderer.shadowMap.autoUpdate=false;renderer.shadowMap.needsUpdate=true;
var scene=new T.Scene();
var camera=new T.OrthographicCamera(-12,12,9,-9,.1,100);
var hemi=new T.HemisphereLight(0xf2ffd7,0x3c7475,1.7);scene.add(hemi);
var sun=new T.DirectionalLight(0xfff3ce,2.2);sun.position.set(-9,16,8);sun.castShadow=true;
sun.shadow.mapSize.set(1024,1024);sun.shadow.camera.left=-13;sun.shadow.camera.right=13;sun.shadow.camera.top=13;sun.shadow.camera.bottom=-13;sun.shadow.camera.near=1;sun.shadow.camera.far=48;sun.shadow.normalBias=.055;sun.shadow.bias=-.0003;sun.shadow.radius=3;scene.add(sun);
var fill=new T.DirectionalLight(0x79d5dd,.6);fill.position.set(8,5,-8);scene.add(fill);
var rockMaterial=new T.MeshStandardMaterial({vertexColors:true,roughness:1,flatShading:false});
var newPropsMaterial=new T.MeshStandardMaterial({vertexColors:true,roughness:1,flatShading:true});
var grassMaterial=new T.MeshStandardMaterial({vertexColors:true,roughness:1,side:T.DoubleSide});
var greenMaterial=new T.MeshStandardMaterial({vertexColors:true,roughness:1,side:T.DoubleSide,flatShading:true});
var island=new T.Group();scene.add(island);
var picks=[];
var decorations=[],selectedDecoration='birds',decorClock=0,decorManager=window.IslandDecorations.create(T,scene);
var buildFeedback=window.IslandFeedback.create(T,scene);
var cells={},seed=24,density=.72,mode='raise',history=[],future=[],stroke=null,dirty=false,detailPending=false,lastDraft=-Infinity,plants=0;
var nextDiagnostics=0;
var pitch=.70,yaw=.73,zoom=1,quality=1.35,time=0,waves=true,stopped=false,frame=0,last=0,slow=0,contextLosses=0;
var ray=new T.Raycaster(),pointer=new T.Vector2(),ground=new T.Plane(new T.Vector3(0,1,0),-window.IslandTerrain.sea),hitPoint=new T.Vector3();
var gridOn=false,CELL=window.IslandTerrain.step;
var landMesh,leafMesh,grassMesh,pendingWaterfall=null;
function key(x,z){return x+','+z;}
function rand(n){var s=Math.sin(n*127.1+seed*311.7)*43758.5453123;return s-Math.floor(s);}
function rng(n){return function(){n=(Math.imul(1664525,n)+1013904223)|0;return (n>>>0)/4294967296;};}
function toast(s){$('toast').textContent=s;$('toast').classList.add('show');clearTimeout(toast.timer);toast.timer=setTimeout(function(){$('toast').classList.remove('show');},2200);}
function snapshot(){return JSON.stringify({cells:cells,seed:seed,density:density,decorations:decorations,gridStep:CELL});}
function loadDecorations(saved){
 var list=window.IslandDecorations.validRecords(saved.decorations),oldStep=saved.gridStep===CELL?CELL:1.06,scale=CELL/oldStep;
 // Older saves use the smaller grid. Keep placed props aligned with their island.
 if(scale!==1)list.forEach(function(d){['x','z','ex','ez'].forEach(function(k){if(d[k]!==undefined)d[k]=Math.max(-16,Math.min(16,d[k]*scale));});});
 return list;
}
function checkpoint(){history.push(snapshot());if(history.length>60)history.shift();future=[];updateButtons();}
function restore(s){buildFeedback.clear();var v=JSON.parse(s);cells=v.cells;seed=v.seed;density=v.density;decorations=window.IslandDecorations.validRecords(v.decorations);$('density').value=Math.round(density*100);updateDensity();rebuild();save();}
function undo(){cancelWaterfall();if(!history.length)return;future.push(snapshot());restore(history.pop());updateButtons();toast('已撤销这一笔');}
function redo(){cancelWaterfall();if(!future.length)return;history.push(snapshot());restore(future.pop());updateButtons();toast('已重做');}
function updateButtons(){$('undo').disabled=!history.length;$('redo').disabled=!future.length;}
function save(){if(previewMode)return;try{var result=storage.setItem('island-atelier-v1',snapshot());if(result&&result.then)result.then(function(ok){if(!ok)toast('这次未能保存，先不要关闭小岛');});}catch(e){toast('这次未能保存，先不要关闭小岛');}}
function makeIsland(next){buildFeedback.clear();cells={};decorations=[];seed=next;
for(var x=-5;x<=5;x++)for(var z=-5;z<=5;z++){
 var r=Math.sqrt(x*x*.88+z*z*1.08),edge=4.15+rand(x*41+z*31)*.9;
 if(r>edge)continue;
 var h=1;
 if(r<3.8)h=2;
 if((x+1)*(x+1)+(z+1.3)*(z+1.3)<8.2)h=4;
 if((x+1.8)*(x+1.8)+(z+2.4)*(z+2.4)<1.8)h=6;
 if(x>1&&z>-.5&&r<3.5)h=3;
 if(rand(x*9+z*141)>.87&&r>3.5)continue;
 cells[key(x,z)]={x:x,z:z,h:h,green:1};
}
cells['5,2']={x:5,z:2,h:1,green:1};cells['-4,4']={x:-4,z:4,h:1,green:1};
rebuild();save();}
// Geometry batches keep draw calls independent of the number of leaves and blocks.
function Batch(){this.p=[];this.c=[];}
Batch.prototype.tri=function(a,b,c,color){this.p.push(a[0],a[1],a[2],b[0],b[1],b[2],c[0],c[1],c[2]);for(var i=0;i<3;i++)this.c.push(color.r,color.g,color.b);};
Batch.prototype.quad=function(a,b,c,d,color){this.tri(a,b,c,color);this.tri(a,c,d,color);};
Batch.prototype.geometry=function(){var g=new T.BufferGeometry();g.setAttribute('position',new T.Float32BufferAttribute(this.p,3));g.setAttribute('color',new T.Float32BufferAttribute(this.c,3));g.computeVertexNormals();g.computeBoundingSphere();return g;};
var greens=['#77ad2d','#8fb93a','#a2c94a','#5c992c','#387c36','#b0cc48'];
function leaf(batch,x,y,z,angle,length,width,random,color){
 var dir=[Math.cos(angle),Math.sin(angle)],side=[-dir[1],dir[0]],points=[];
 for(var i=0;i<3;i++){
  var t=i/2,w=Math.sin(t*Math.PI)*width;
  var lift=Math.sin(t*Math.PI*.8)*length*.46-t*t*length*.30;
  var mid=[x+dir[0]*length*t,y+lift,z+dir[1]*length*t];
  points.push({l:[mid[0]+side[0]*w,mid[1]-.025,mid[2]+side[1]*w],m:[mid[0],mid[1]+.045,mid[2]],r:[mid[0]-side[0]*w,mid[1]-.025,mid[2]-side[1]*w]});
 }
 batch.tri(points[0].m,points[1].l,points[1].m,color);batch.tri(points[1].l,points[2].m,points[1].m,color);
 var shade=color.clone().multiplyScalar(.80);batch.tri(points[0].m,points[1].m,points[1].r,shade);batch.tri(points[1].m,points[2].m,points[1].r,shade);
}
function tuft(batch,x,y,z,random,scale){
 var count=3+Math.floor(random()*2),start=random()*Math.PI*2;
 for(var j=0;j<count;j++)leaf(batch,x,y,z,start+j/count*Math.PI*2,(.36+random()*.28)*scale,(.09+random()*.055)*scale,random,new T.Color(greens[Math.floor(random()*greens.length)]));
 plants++;
}
var terrainField,propsMesh,palmCount=0,beachCount=0,meadowCount=0,shoreRocks=[],vineCount=0,cliffTreeCount=0;
var boulderGeo=new T.IcosahedronGeometry(1,1),coconutGeo=new T.IcosahedronGeometry(1,0);
function addBoulder(batch,x,y,z,sx,sy,sz,angle,color,geo){
 var pos=(geo||boulderGeo).attributes.position,ca=Math.cos(angle),sa=Math.sin(angle);
 for(var i=0;i<pos.count;i+=3){var tri=[];for(var j=0;j<3;j++){var vx=pos.getX(i+j)*sx,vy=pos.getY(i+j)*sy,vz=pos.getZ(i+j)*sz;tri.push([x+vx*ca-vz*sa,y+vy,z+vx*sa+vz*ca]);}batch.tri(tri[0],tri[1],tri[2],color.clone().multiplyScalar(.94+.10*Math.sin(i*1.7)));}
}
function addCliffPlate(batch,x,y,z,width,height,depth,normal,tangent,up,random){
 var flip=random()<.5?-1:1,skew=(random()-.5)*.20;
 var outline=[[-.46,-.30],[-.24,-.50],[.46,-.43],[.49,.31],[-.28,.50]];
 // Broken-off corners, broad faces and unequal heights give a columnar rock structure.
 var rim=[],face=[],back=[],shade=.94+random()*.10,color=new T.Color('#91a29a').multiplyScalar(shade);
 outline.forEach(function(v){var u=(v[0]*flip+v[1]*skew)*width,h=v[1]*height,base=new T.Vector3(x,y,z).addScaledVector(tangent,u).addScaledVector(up,h);
  // Find the nearby terrain surface along its outward normal; the back remains buried.
  var shift=0;for(var k=0;k<4;k++){var q=base.clone().addScaledVector(normal,shift),surface=terrainField.sample(q.x,q.z).y;shift+=(surface-q.y)/Math.max(1,1/normal.y);shift=Math.max(-.45,Math.min(.45,shift));}
  var edge=base.clone().addScaledVector(normal,shift+.015),front=new T.Vector3(x,y,z).addScaledVector(tangent,u*.86).addScaledVector(up,h*.94).addScaledVector(normal,shift+depth),rear=base.clone().addScaledVector(normal,shift-.17);
  rim.push(edge.toArray());face.push(front.toArray());back.push(rear.toArray());
 });
 // Preserve outward winding when mirroring the polygon.
 if(flip===-1){rim.reverse();face.reverse();back.reverse();}
 for(var i=1;i<4;i++)batch.tri(face[0],face[i],face[i+1],color);
 for(var i=0;i<5;i++){var j=(i+1)%5;batch.quad(face[i],rim[i],rim[j],face[j],color.clone().multiplyScalar(.90));batch.quad(rim[i],back[i],back[j],rim[j],color.clone().multiplyScalar(.79));}
}
function palm(wood,leaves,x,y,z,random,scale){
 scale=scale||1;var tall=(1.7+random()*1.0)*scale,lean=(.30+random()*.40)*scale,ang=random()*6.283,sections=6,sides=5,rings=[];
 for(var h=0;h<=sections;h++){var t=h/sections,cx=x+Math.cos(ang)*lean*t*t,cz=z+Math.sin(ang)*lean*t*t,r=.115*(1-t*.5)*scale;var ring=[];for(var j=0;j<sides;j++){var a=j/sides*6.283;ring.push([cx+Math.cos(a)*r,y+t*tall,cz+Math.sin(a)*r]);}rings.push(ring);}
 for(var h=0;h<sections;h++)for(var j=0;j<sides;j++){
  var col=new T.Color(h%2?'#9c7252':'#b18a61');
  wood.quad(rings[h][j],rings[h+1][j],rings[h+1][(j+1)%sides],rings[h][(j+1)%sides],col);
 }
 var crownX=x+Math.cos(ang)*lean,crownZ=z+Math.sin(ang)*lean;
 for(var f=0;f<7;f++){
  var a=f*6.283/7+ang,len=(1.05+random()*.40)*scale,w=(.22+random()*.06)*scale,points=[];
  for(var k=0;k<=4;k++){var t=k/4,spread=Math.sin(Math.PI*t)*w*(k%2?.78:1),lift=(Math.sin(t*Math.PI)*.5-t*t*.36)*scale,dist=len*t;
   points.push({m:[crownX+Math.cos(a)*dist,y+tall+lift,crownZ+Math.sin(a)*dist],l:[crownX+Math.cos(a)*dist-Math.sin(a)*spread,y+tall+lift-.065,crownZ+Math.sin(a)*dist+Math.cos(a)*spread],r:[crownX+Math.cos(a)*dist+Math.sin(a)*spread,y+tall+lift-.065,crownZ+Math.sin(a)*dist-Math.cos(a)*spread]});
  }
  var green=new T.Color(['#75a947','#8fba52','#4d883d','#a5c765'][f%4]);
  for(var k=0;k<4;k++){leaves.quad(points[k].m,points[k+1].m,points[k+1].l,points[k].l,green);leaves.quad(points[k].r,points[k+1].r,points[k+1].m,points[k].m,green.clone().multiplyScalar(.79));}
 }
 for(var n=0;n<3;n++)addBoulder(wood,crownX+Math.cos(n*2.1)*.14,y+tall-.12,crownZ+Math.sin(n*2.1)*.14,.12,.15,.12,n,new T.Color('#78603f'),coconutGeo);
 palmCount++;plants++;
}
function hangingVine(batch,x,y,z,dx,dz,length,random){
 var px=x,pz=z,py=y,offset=0,width=.012;
 for(var i=1;i<=10;i++){
  var ny=y-length*i/10;
  // Follow the outside of the actual cliff; never hang a stem inside solid terrain.
  while(offset<1.7&&terrainField.sample(x+dx*offset,z+dz*offset).y>ny-.035)offset+=.04;
  var nx=x+dx*(offset+.035)+dz*Math.sin(i*.9)*.035,nz=z+dz*(offset+.035)-dx*Math.sin(i*.9)*.035;
  if(ny<.22)break;
  batch.quad([px-dz*width,py,pz+dx*width],[nx-dz*width,ny,nz+dx*width],[nx+dz*width,ny,nz-dx*width],[px+dz*width,py,pz-dx*width],new T.Color('#52703a'));
  var side=i%2?1:-1,spread=.10+random()*.07;
  batch.tri([nx,ny+.04,nz],[nx+dz*spread*side+dx*.05,ny+.035,nz-dx*spread*side+dz*.05],[nx+dz*spread*.60*side+dx*.08,ny-.13,nz-dx*spread*.60*side+dz*.08],new T.Color(i%3?'#669744':'#86ac4f'));
  px=nx;py=ny;pz=nz;
 }
 vineCount++;
}

function inWatercourse(x,z,padding){return decorations.some(function(d){if(d.kind!=='waterfall')return false;var dx=d.ex-d.x,dz=d.ez-d.z,t=Math.max(0,Math.min(1,((x-d.x)*dx+(z-d.z)*dz)/(dx*dx+dz*dz)));return Math.hypot(x-d.x-dx*t,z-d.z-dz*t)<padding;});}
function rebuild(draft){
 var buildStarted=performance.now();var all=Object.keys(cells).map(function(k){return cells[k];}),leaves=new Batch(),props=new Batch();if(!draft){plants=0;palmCount=0;vineCount=0;cliffTreeCount=0;shoreRocks=[];}beachCount=0;meadowCount=0;
 terrainField=window.IslandTerrain.create(cells,seed);
 // Shared vertices: there are no cell meshes or coincident interior faces.
 var N=draft?80:112,span=22,step=span/N,positions=[],colors=[],indices=[],heights=[],slopes=[];
 for(var j=0;j<=N;j++)for(var i=0;i<=N;i++){
  var x=-span/2+i*step,z=-span/2+j*step;
  var y=terrainField.height(x,z);heights.push(y);positions.push(x,y,z);
 }
 for(var j=0;j<=N;j++)for(var i=0;i<=N;i++){
  var idx=j*(N+1)+i,x=positions[idx*3],z=positions[idx*3+2],y=heights[idx];
  var dx=(heights[j*(N+1)+Math.min(i+1,N)]-heights[j*(N+1)+Math.max(i-1,0)])/(step*2),dz=(heights[Math.min(j+1,N)*(N+1)+i]-heights[Math.max(j-1,0)*(N+1)+i])/(step*2),slope=Math.sqrt(dx*dx+dz*dz);slopes.push(slope);
  var grain=terrainField.noise(x*1.5,z*1.5),coarse=terrainField.noise(x*.65,z*.65),c=new T.Color('#939689');
  c.set('#8c9e9a').lerp(new T.Color('#a5aca0'),.35+coarse*.12);
  if(y<.46){c.set('#ead39f');c.lerp(new T.Color('#d8bd86'),.22+grain*.15);if(y<-.10)c.multiplyScalar(.88);}
  colors.push(c.r,c.g,c.b);
  if(y>-.05){if(y<.46)beachCount++;else if(slope<.65)meadowCount++;}
 }
 for(var j=0;j<N;j++)for(var i=0;i<N;i++){
  var a=j*(N+1)+i,b=a+1,c=a+N+1,d=c+1;
  if(Math.max(heights[a],heights[b],heights[c],heights[d])<-.8)continue;
  if((i+j)%2){indices.push(a,c,b,b,c,d);}else{indices.push(a,c,d,a,d,b);}
 }
 var cap=window.IslandSurface.build(T,terrainField,cells,density,positions,slopes,indices,{fringe:!draft});
 if(grassMesh){island.remove(grassMesh);grassMesh.geometry.dispose();}
 grassMesh=new T.Mesh(cap.geometry,grassMaterial);grassMesh.castShadow=true;grassMesh.receiveShadow=true;island.add(grassMesh);
 var geometry=new T.BufferGeometry();geometry.setAttribute('position',new T.Float32BufferAttribute(positions,3));geometry.setAttribute('color',new T.Float32BufferAttribute(colors,3));geometry.setIndex(indices);geometry.computeVertexNormals();geometry.computeBoundingSphere();
 if(landMesh){island.remove(landMesh);landMesh.geometry.dispose();}
 landMesh=new T.Mesh(geometry,rockMaterial);landMesh.castShadow=true;landMesh.receiveShadow=true;island.add(landMesh);landMesh.updateMatrixWorld();picks=[landMesh];
 if(!draft){
 // Wide, level regions are kept readable; palms are sparse and spaced apart.
 var planted=[];
 all.sort(function(a,b){return (a.x*17+a.z*73)-(b.x*17+b.z*73);}).forEach(function(c){
  var random=rng((c.x+30)*13499+(c.z+30)*773+seed*571),x=c.x*CELL+(random()-.5)*.35,z=c.z*CELL+(random()-.5)*.35,p=terrainField.surface(x,z);
  if(!c.green||density===0||inWatercourse(x,z,.55))return;
  var wide=p.y>.5&&p.slope<.35;
  [[.45,0],[-.45,0],[0,.45],[0,-.45]].forEach(function(o){if(Math.abs(terrainField.sample(x+o[0],z+o[1]).y-p.y)>.12)wide=false;});
  if(wide&&random()<density*.56&&palmCount<18&&planted.every(function(q){return Math.hypot(q.x-x,q.z-z)>1.65;})){
   palm(props,leaves,x,p.y+.01,z,random);planted.push({x:x,z:z});
  }
  for(var k=0;k<3;k++){
   var a=random()*6.283,r=.3+random()*.46,px=c.x*CELL+Math.cos(a)*r,pz=c.z*CELL+Math.sin(a)*r,pp=terrainField.surface(px,pz);
   if(pp.y>.14&&pp.slope<2.0&&pp.slope>.28&&random()<density*.85)tuft(leaves,px,pp.y+.19,pz,random,.42+random()*.32);
   else if(pp.y>.5&&pp.slope<.4&&random()<density*.12)tuft(leaves,px,pp.y+.19,pz,random,.25);
  }
 });
 // High exposed cliff lips can support smaller wind-shaped palms and vines.
 all.forEach(function(c){
  if(c.h<3||!c.green||density===0)return;
  var random=rng((c.x+40)*1747+(c.z+40)*3613+seed*17),dirs=[[1,0],[-1,0],[0,1],[0,-1]];
  dirs.forEach(function(d){
   var neighbor=cells[key(c.x+d[0],c.z+d[1])];if(neighbor&&neighbor.h>c.h-2)return;
   var x=c.x*CELL+d[0]*.28,z=c.z*CELL+d[1]*.28,p=terrainField.surface(x,z);
   if(p.y<1.2||inWatercourse(x,z,.55))return;
   if(random()<density*.50&&cliffTreeCount<10&&planted.every(function(q){return Math.hypot(q.x-x,q.z-z)>1.05;})){
    palm(props,leaves,x,p.y,z,random,.48+random()*.18);planted.push({x:x,z:z});cliffTreeCount++;
   }
   if(random()<density*.85){
    for(var v=0;v<2+Math.floor(random()*2);v++){var side=(v-1)*.17,px=x+d[1]*side,pz=z-d[0]*side,top=terrainField.sample(px,pz).y;
     hangingVine(leaves,px,top+.025,pz,d[0],d[1],Math.min(top-.18,.8+random()*1.5),random);
    }
   }
  });
 });
 // Broad, irregular pentagonal columns sit inside the cliff rather than dotting it with pebbles.
 var cliffStones=0,cliffGrass=0,stoneSites=[];
 for(var gz=-10;gz<10;gz+=.29)for(var gx=-10;gx<10;gx+=.29){
  var random=rng(Math.round((gx+10)*100)*7717+Math.round((gz+10)*100)*3433+seed*83),x=gx+(random()-.5)*.23,z=gz+(random()-.5)*.23,p=terrainField.surface(x,z);
  if(p.y<.58||p.slope<1.65||random()>.76||inWatercourse(x,z,.65))continue;
  var dx=(terrainField.sample(x+.04,z).y-terrainField.sample(x-.04,z).y)/.08,dz=(terrainField.sample(x,z+.04).y-terrainField.sample(x,z-.04).y)/.08;
  var normal=new T.Vector3(-dx,1,-dz).normalize(),tangent=new T.Vector3(-normal.z,0,normal.x).normalize(),up=new T.Vector3().crossVectors(normal,tangent).normalize();
  var width=.43+Math.pow(random(),.75)*.66,height=width*(1.35+random()*1.8),depth=.07+random()*.10;
  // Keep the top and foot within the rock band below the soft grass cap.
  for(var fit=0;fit<5;fit++){var high=terrainField.surface(x+up.x*height*.46,z+up.z*height*.46),low=terrainField.surface(x-up.x*height*.46,z-up.z*height*.46);if(high.slope>1.15&&low.slope>1.15&&low.y>.42)break;height*=.79;}
  if(stoneSites.some(function(q){var vx=x-q.x,vy=p.y-q.y,vz=z-q.z;return Math.abs(vx*tangent.x+vy*tangent.y+vz*tangent.z)<(width+q.w)*.36&&Math.abs(vx*up.x+vy*up.y+vz*up.z)<(height+q.h)*.37&&Math.abs(vx*normal.x+vy*normal.y+vz*normal.z)<.4;}))continue;
  addCliffPlate(props,x,p.y,z,width,height,depth,normal,tangent,up,random);
  var grassCell=cells[key(Math.round(x/CELL),Math.round(z/CELL))];
  if(density>0&&(!grassCell||grassCell.green)&&random()<density*.36){
   var lift=height*(random()<.65?.42:-.14),px=x+up.x*lift+normal.x*(depth+.025),pz=z+up.z*lift+normal.z*(depth+.025),py=Math.max(p.y+up.y*lift+normal.y*(depth+.025),terrainField.sample(px,pz).y+.015);
   tuft(leaves,px,py,pz,random,.28+random()*.16);cliffGrass++;
  }
  stoneSites.push({x:x,y:p.y,z:z,w:width,h:height});cliffStones++;
 }
 // Only actual shore cells emit rocks, so rebuilding/removing an island moves them too.
 all.forEach(function(c){
  var random=rng((c.x+40)*3779+(c.z+40)*4517+seed*313);
  [[1,0],[-1,0],[0,1],[0,-1]].forEach(function(v){
   if(cells[key(c.x+v[0],c.z+v[1])]||random()>.44)return;
   var x=c.x*CELL+v[0]*(.85+random()*.50)+v[1]*(random()-.5)*.65,z=c.z*CELL+v[1]*(.85+random()*.50)+v[0]*(random()-.5)*.65,p=terrainField.sample(x,z);
   if(p.y>.04)return;
   var r=.15+random()*.28,cy=-.17+random()*.06;
   addBoulder(props,x,cy,z,r,r*(.8+random()*.7),r*(.8+random()*.5),random()*6.283,new T.Color('#a5a38e'));
   shoreRocks.push({x:x,z:z,r:r*.7});
   if(random()>.4)addBoulder(props,x+.35,cy-.05,z+.2,r*.45,r*.38,r*.5,random()*6.283,new T.Color('#c1b99b'));
  });
 });
 if(leafMesh){island.remove(leafMesh);leafMesh.geometry.dispose();}if(propsMesh){island.remove(propsMesh);propsMesh.geometry.dispose();}
 leafMesh=new T.Mesh(leaves.geometry(),greenMaterial);leafMesh.castShadow=true;leafMesh.receiveShadow=true;island.add(leafMesh);
 propsMesh=new T.Mesh(props.geometry(),newPropsMaterial);propsMesh.castShadow=true;propsMesh.receiveShadow=true;island.add(propsMesh);
 }
 updateShore(all);if(!draft)decorManager.refresh(decorations,terrainField,shoreRocks);updateDecorCount();renderer.shadowMap.needsUpdate=true;$('count').textContent=all.length;$('height').textContent=terrainField.max;$('plants').textContent=palmCount;
 host.setAttribute('data-terrain-stats',JSON.stringify({buildMs:Number((performance.now()-buildStarted).toFixed(2)),draft:!!draft,continuous:true,grassTriangles:cap.geometry.attributes.position.count/3,grassRimEdges:cap.rimEdges,grassFringeTufts:cap.fringeTufts,cliffStones:cliffStones,cliffGrass:cliffGrass,vertices:positions.length/3,triangles:indices.length/3,palms:palmCount,cliffTrees:cliffTreeCount,vines:vineCount,shoreRocks:shoreRocks.length,beachSamples:beachCount,meadowSamples:meadowCount}));var stateText=snapshot(),checksum=0;for(var cs=0;cs<stateText.length;cs++)checksum=(Math.imul(checksum,31)+stateText.charCodeAt(cs))|0;host.setAttribute('data-state-checksum',String(checksum));dirty=false;detailPending=!!draft;lastDraft=performance.now();
}
// A world-space distance field replaces a second full-screen depth pass.
var texSize=128,mapSpan=32,shoreBytes=new Uint8Array(texSize*texSize*4);
var shore=new T.DataTexture(shoreBytes,texSize,texSize,T.RGBAFormat);shore.minFilter=T.LinearFilter;shore.magFilter=T.LinearFilter;shore.generateMipmaps=false;
function updateShore(all){
 // Seeds come from the fused surface's actual water intersection, not the editing squares.
 var size=texSize,field=new Float32Array(size*size),scale=mapSpan/size;
 for(var j=0;j<size;j++)for(var i=0;i<size;i++){
  var x=((i+.5)/size-.5)*mapSpan,z=((j+.5)/size-.5)*mapSpan;
  var land=terrainField.height(x,z)>-.07;
  for(var r=0;r<shoreRocks.length&&!land;r++){var rock=shoreRocks[r];var rx=x-rock.x,rz=z-rock.z;land=rx*rx+rz*rz<rock.r*rock.r;}
  field[j*size+i]=land?0:100;
 }
 for(var j=0;j<size;j++)for(var i=0;i<size;i++){var k=j*size+i,d=field[k];if(i)d=Math.min(d,field[k-1]+1);if(j)d=Math.min(d,field[k-size]+1);if(i&&j)d=Math.min(d,field[k-size-1]+1.414);if(i<size-1&&j)d=Math.min(d,field[k-size+1]+1.414);field[k]=d;}
 for(var j=size-1;j>=0;j--)for(var i=size-1;i>=0;i--){var k=j*size+i,d=field[k];if(i<size-1)d=Math.min(d,field[k+1]+1);if(j<size-1)d=Math.min(d,field[k+size]+1);if(i<size-1&&j<size-1)d=Math.min(d,field[k+size+1]+1.414);if(i&&j<size-1)d=Math.min(d,field[k+size-1]+1.414);field[k]=d;shoreBytes[k*4]=Math.round(Math.min(1,d*scale/12)*255);shoreBytes[k*4+3]=255;}
 shore.needsUpdate=true;
}
var waterMat=new T.ShaderMaterial({transparent:true,depthWrite:false,uniforms:{uTime:{value:0},uShore:{value:shore},uDetail:{value:1}},vertexShader:[
 'varying vec3 vWorld;','void main(){vec4 w=modelMatrix*vec4(position,1.0);vWorld=w.xyz;gl_Position=projectionMatrix*viewMatrix*w;}'
].join('\n'),fragmentShader:[
 'precision highp float; varying vec3 vWorld; uniform float uTime; uniform sampler2D uShore; uniform float uDetail;',
 'float hash(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}',
 'float noise(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.0-2.0*f);return mix(mix(hash(i),hash(i+vec2(1,0)),f.x),mix(hash(i+vec2(0,1)),hash(i+vec2(1,1)),f.x),f.y);}',
 'float cells(vec2 p){vec2 i=floor(p),f=fract(p);float a=9.0,b=9.0;for(int y=-1;y<=1;y++){for(int x=-1;x<=1;x++){vec2 g=vec2(float(x),float(y));vec2 h=vec2(hash(i+g),hash(i+g+19.7));vec2 o=.5+.36*sin(uTime*.28+6.2831*h);vec2 r=g+o-f;float d=dot(r,r);if(d<a){b=a;a=d;}else if(d<b){b=d;}}}return sqrt(b)-sqrt(a);}',
 'void main(){vec2 p=vWorld.xz;float t=uTime;vec2 uv=p/32.0+.5;float d=texture2D(uShore,clamp(uv,0.001,0.999)).r*12.0;',
 'float n=noise(p*.38+vec2(t*.025,-t*.018));float depth=smoothstep(0.0,6.7,d+n*.8);',
 'vec3 shallow=vec3(.12,.77,.69),deep=vec3(.035,.46,.58);vec3 col=mix(shallow,deep,depth);',
 'float mottling=noise(p*.65+noise(p*.22)*2.0);col*=.91+mottling*.17;',
 'vec2 warp=vec2(sin(p.y*.65+t*.27),cos(p.x*.72+t*.20))*.38;float caustic=1.0-smoothstep(.022,.10,cells(p*1.05+warp));',
 'col+=vec3(.28,.50,.35)*caustic*(1.0-depth)*.22*uDetail;',
 'float shade=texture2D(uShore,clamp((p-vec2(1.2,-1.0))/32.0+.5,.001,.999)).r*12.0;col*=1.0-(1.0-smoothstep(.1,1.5,shade))*.15;',
 'float wobble=noise(p*2.3+vec2(t*.15,-t*.12));float edge=d+wobble*.13;float band=1.0-smoothstep(.04,.115,abs(edge-(.17+.07*sin(t*.8+p.x*.4))));',
 'float outer=1.0-smoothstep(.025,.07,abs(d-(.65+sin(t*.5)*.15)));outer*=smoothstep(.55,.8,wobble)*.55;',
 'float foam=max(band,outer)*(1.0-smoothstep(1.0,1.5,d));col=mix(col,vec3(.83,.98,.85),foam*.83);',
 'float sparkle=pow(max(0.0,sin(p.x*2.9+t*.55)*sin(p.y*4.7-t*.4)),35.0);col+=sparkle*.12;',
 'gl_FragColor=vec4(col,mix(.72,.98,depth));}'
].join('\n')});
var water=new T.Mesh(new T.PlaneGeometry(160,160),waterMat);water.rotation.x=-Math.PI/2;water.position.y=-.07;water.renderOrder=2;scene.add(water);
// Submerged apron with faceted stones, visible through the shallow-water tint.
var seabed=new T.Mesh(new T.PlaneGeometry(160,160),new T.MeshBasicMaterial({color:0x267879}));seabed.rotation.x=-Math.PI/2;seabed.position.y=-1.7;scene.add(seabed);
// Reusable hover outline, lifted onto the selected rock top.
var outlinePoints=[[-.48,-.48],[.48,-.48],[.48,.48],[-.48,.48],[-.48,-.48]].map(function(p){return new T.Vector3(p[0]*CELL,0,p[1]*CELL);});
var hover=new T.Line(new T.BufferGeometry().setFromPoints(outlinePoints),new T.LineBasicMaterial({color:0xfff5be,transparent:true,opacity:.9,depthTest:false}));hover.renderOrder=8;hover.visible=false;scene.add(hover);
// One reusable horizontal overlay, independent of the sea shader and terrain meshes.
var gridHeld=false,gridRemaining=0,gridY=window.IslandTerrain.sea;
var editPlane=new T.Plane(new T.Vector3(0,1,0),-gridY);
var buildGridMaterial=new T.ShaderMaterial({transparent:true,depthWrite:false,uniforms:{uOpacity:{value:0},uCell:{value:CELL}},vertexShader:[
 'varying vec2 vGrid; uniform float uCell;',
 'void main(){vec4 world=modelMatrix*vec4(position,1.0);vGrid=world.xz/uCell;gl_Position=projectionMatrix*viewMatrix*world;}'
].join('\n'),fragmentShader:[
 'precision mediump float; varying vec2 vGrid; uniform float uOpacity;',
 'void main(){vec2 q=abs(fract(vGrid+.5)-.5);float line=smoothstep(.468,.494,max(q.x,q.y));float edge=1.-smoothstep(6.7,7.5,max(abs(vGrid.x),abs(vGrid.y)));gl_FragColor=vec4(.91,.98,.86,line*uOpacity*(.5+.5*edge));}'
].join('\n')});
var buildGrid=new T.Mesh(new T.PlaneGeometry(CELL*15,CELL*15),buildGridMaterial);buildGrid.rotation.x=-Math.PI/2;buildGrid.position.y=gridY+.03;buildGrid.renderOrder=6;buildGrid.visible=false;scene.add(buildGrid);
function gridState(){host.setAttribute('data-grid-state',JSON.stringify({visible:buildGrid.visible,held:gridHeld,height:gridY,cellSize:CELL,columns:15}));}
function tickBuildGrid(dt){var visible=buildGrid.visible;if(!gridHeld)gridRemaining=Math.max(0,gridRemaining-dt);var alpha=(gridOn||gridHeld) ? .62 : .62*Math.min(1,gridRemaining/.45);buildGridMaterial.uniforms.uOpacity.value=alpha;buildGrid.visible=alpha>.005;if(visible!==buildGrid.visible)gridState();}
function showBuildGrid(c,held){if(!c||mode==='orbit'||mode==='decorate')return;gridY=Math.max(window.IslandTerrain.sea,terrainField.height(c.x*CELL,c.z*CELL));editPlane.constant=-gridY;var cell=cells[key(c.x,c.z)],grass=cell&&cell.green&&density>0&&gridY>.48;buildGrid.position.y=gridY+(grass ? .21 : .03);gridHeld=!!held;gridRemaining=1.2;tickBuildGrid(0);gridState();}
function releaseBuildGrid(){gridHeld=false;gridRemaining=1.2;gridState();}
function cancelBuildGrid(){gridHeld=false;gridRemaining=0;tickBuildGrid(0);gridState();}
function updateProjection(){var w=host.clientWidth,h=host.clientHeight,size=8.6*h/w;camera.left=-size*w/h/zoom;camera.right=size*w/h/zoom;camera.top=size/zoom;camera.bottom=-size/zoom;camera.updateProjectionMatrix();updateCamera();}
function resize(){var w=host.clientWidth,h=host.clientHeight,dpr=Math.min(window.devicePixelRatio||1,quality,Math.sqrt((quality>1?1800000:1000000)/(w*h)));renderer.setPixelRatio(dpr);renderer.setSize(w,h);updateProjection();}
function updateCamera(){var target=new T.Vector3(0,1.05,0);camera.position.set(target.x+Math.sin(yaw)*22*Math.cos(pitch),target.y+Math.sin(pitch)*22,target.z+Math.cos(yaw)*22*Math.cos(pitch));camera.lookAt(target);camera.updateMatrixWorld();}
function aim(e){var rect=renderer.domElement.getBoundingClientRect();pointer.set((e.clientX-rect.left)/rect.width*2-1,-(e.clientY-rect.top)/rect.height*2+1);ray.setFromCamera(pointer,camera);}
function surfacePoint(e){aim(e);return window.IslandTerrain.intersect(terrainField,ray.ray.origin,ray.ray.direction);}
function select(e){var p;if(stroke&&!stroke.orbit&&stroke.planeActive){aim(e);p=ray.ray.intersectPlane(editPlane,hitPoint);}else p=surfacePoint(e);if(!p){if(!ray.ray.intersectPlane(ground,hitPoint))return null;p=hitPoint;}var x=Math.round(p.x/CELL),z=Math.round(p.z/CELL);if(Math.abs(x)>7||Math.abs(z)>7)return null;return {x:x,z:z};}
function hoverAt(c){hover.visible=!!c&&mode!=='orbit';if(!c)return;hover.position.set(c.x*CELL,stroke&&!stroke.orbit?buildGrid.position.y:Math.max(.01,terrainField.height(c.x*CELL,c.z*CELL)+.21),c.z*CELL);hover.material.color.set(mode==='lower'?0xffcb9c:mode==='plant'?0xc9fa75:0xfff5be);if(gridOn&&!stroke)showBuildGrid(c,false);}
function paintOne(x,z){if(Math.abs(x)>7||Math.abs(z)>7)return;var k=key(x,z);if(stroke.visited[k])return;stroke.visited[k]=true;var c=cells[k],wx=x*CELL,wz=z*CELL,oldHeight=terrainField.sample(wx,wz).y,wasGreen=c&&c.green;
 if(mode==='raise'){if(c){if(c.h>=8){toast('这座山已经足够高了 · 最高 8 层');return;}c.h++;}else cells[k]={x:x,z:z,h:1,green:1};}
 else if(mode==='lower'){if(!c)return;c.h--;if(c.h<=0)delete cells[k];}
 else if(mode==='plant'){if(!c)return;c.green=stroke.plantValue;}
 if(mode==='raise')buildFeedback.queue(oldHeight<=-.07?'water':'leaves',wx,wz);else if(mode==='plant'&&!wasGreen&&c.green)buildFeedback.queue('leaves',wx,wz);
 islandAudio.sound(mode);dirty=true;
}
function paint(c){if(!c)return;if(stroke.prev){var dx=c.x-stroke.prev.x,dz=c.z-stroke.prev.z,steps=Math.max(Math.abs(dx),Math.abs(dz));for(var i=1;i<=steps;i++)paintOne(Math.round(stroke.prev.x+dx*i/steps),Math.round(stroke.prev.z+dz*i/steps));}else paintOne(c.x,c.z);stroke.prev=c;}
function finishStroke(){if(!stroke)return;if(dirty||detailPending)rebuild();if(!stroke.orbit){save();if(stroke.before===snapshot()&&history.length&&history[history.length-1]===stroke.before){history.pop();future=stroke.futureBefore;}updateButtons();if(stroke.planeActive)releaseBuildGrid();}stroke=null;}
var pendingPointer=null;
function startPointer(e){if(stroke)return;if(mode==='decorate'&&e.button===0&&!e.altKey){decorationTap={id:e.pointerId,x:e.clientX,y:e.clientY};return;}var c=select(e),orbit=mode==='orbit'||e.button===2||e.altKey,before=snapshot(),futureBefore=future.slice();stroke={id:e.pointerId,orbit:orbit,planeActive:!!c,lastX:e.clientX,lastY:e.clientY,visited:{},prev:null,before:before,futureBefore:futureBefore,plantValue:c&&cells[key(c.x,c.z)]?!cells[key(c.x,c.z)].green:1};if(!orbit){showBuildGrid(c,true);hoverAt(c);checkpoint();paint(c);}else cancelBuildGrid();}
function movePointer(e){if(mode==='decorate'&&!stroke){decorationHover(e);return;}if(stroke&&stroke.id!==e.pointerId)return;if(stroke&&stroke.orbit){yaw-=(e.clientX-stroke.lastX)*.008;pitch=Math.max(.35,Math.min(1.25,pitch+(e.clientY-stroke.lastY)*.005));stroke.lastX=e.clientX;stroke.lastY=e.clientY;updateCamera();hover.visible=false;}else{var c=select(e);if(stroke&&!stroke.planeActive&&c){showBuildGrid(c,true);stroke.planeActive=true;}hoverAt(c);if(stroke)paint(c);}}
function flushPointer(){if(pendingPointer){var p=pendingPointer;pendingPointer=null;movePointer(p);}}
function cancelPointer(){pendingPointer=null;decorationTap=null;hover.visible=false;cancelBuildGrid();if(!stroke)return;var old=stroke;stroke=null;buildFeedback.clear();if(!old.orbit){if(history[history.length-1]===old.before)history.pop();future=old.futureBefore;if(snapshot()!==old.before||detailPending)restore(old.before);updateButtons();}}
var controls=window.IslandControls.create(renderer.domElement,{
 preview:function(e){var c=select(e);showBuildGrid(c,true);hoverAt(c);},start:startPointer,move:function(e){pendingPointer=e;},hover:function(e){pendingPointer=e;},
 end:function(e){flushPointer();if(decorationTap&&decorationTap.id===e.pointerId){var tap=decorationTap;decorationTap=null;if(Math.hypot(e.clientX-tap.x,e.clientY-tap.y)<12)placeDecoration(e);return;}finishStroke();},cancel:cancelPointer,
 view:function(g){pendingPointer=null;hover.visible=false;zoom=Math.max(.6,Math.min(1.8,zoom*g.scale));yaw-=g.dx*.008+g.twist;pitch=Math.max(.35,Math.min(1.25,pitch+g.dy*.005));updateProjection();}
});
renderer.domElement.addEventListener('pointerleave',function(){if(!stroke)hover.visible=false;});renderer.domElement.addEventListener('contextmenu',function(e){e.preventDefault();});
renderer.domElement.addEventListener('wheel',function(e){e.preventDefault();zoom=Math.max(.6,Math.min(1.8,zoom*Math.exp(-e.deltaY*.001)));updateProjection();},{passive:false});
function setMode(v){cancelWaterfall();flushPointer();finishStroke();controls.reset();decorationTap=null;mode=v;$('decor-tray').hidden=v!=='decorate';$('settings').hidden=true;$('settings-toggle').setAttribute('aria-expanded','false');document.querySelectorAll('.tool').forEach(function(b){b.classList.toggle('active',b.getAttribute('data-mode')===v);b.setAttribute('aria-pressed',b.getAttribute('data-mode')===v?'true':'false');});$('hint').textContent=v==='decorate'?decorationHint():v==='orbit'?'双指捏合缩放 · 拖动或扭转环顾海岛':v==='plant'?'点击切换植被 · 拖划批量种植或清除 · 丰度滑杆控制密度':v==='lower'?'点击削低一层 · 拖划整理海岸 · 可随时撤销':'单指造岛 · 双指缩放、环顾';host.style.cursor=v==='orbit'?'grab':'crosshair';hover.visible=false;}
var decorationTap=null;
function decorationHint(){if(selectedDecoration==='waterfall')return pendingWaterfall?'② 轻点附近海面 · 点「装饰」可重选':'① 轻点山体，选择瀑布出水口';return selectedDecoration==='erase'?'轻点已有的装饰即可移除 · 随时可以撤销':selectedDecoration==='boat'?'轻点空旷海面，小船会自动环岛巡游':'轻点放置，鸟群会寻找最近的山峦';}
function cancelWaterfall(){pendingWaterfall=null;if(typeof sourceMarker!=='undefined')sourceMarker.visible=false;host.removeAttribute('data-waterfall-pending');if(mode==='decorate')$('hint').textContent=decorationHint();}
var sourceMarker=new T.Mesh(new T.SphereGeometry(.11,12,8),new T.MeshBasicMaterial({color:0xc5fff0}));sourceMarker.visible=false;scene.add(sourceMarker);
function updateDecorCount(){$('decor-count').textContent=decorations.length+' / 10';}
function decorationPoint(e){var p=surfacePoint(e);if(!p){if(!ray.ray.intersectPlane(ground,hitPoint))return null;p=hitPoint;}if(Math.abs(p.x)>12||Math.abs(p.z)>12)return null;return new T.Vector3(p.x,p.y,p.z);}
function decorationHover(e){var p=decorationPoint(e);hover.visible=!!p;if(!p)return;var allowed=selectedDecoration!=='boat'||window.IslandDecorations.canFloat(terrainField,p.x,p.z,shoreRocks);hover.position.set(p.x,Math.max(.03,terrainField.sample(p.x,p.z).y+.07),p.z);hover.material.color.set(allowed?0xf5ebbc:0xe97f6d);}
function placeDecoration(e){
 var p=decorationPoint(e);if(selectedDecoration==='erase'){cancelWaterfall();var id=decorManager.pick(ray);if(id===null){toast('轻点要移除的装饰');return;}checkpoint();decorations=decorations.filter(function(d){return d.id!==id;});rebuild();save();toast('装饰已移除，可撤销');return;}if(!p){toast('请放在小岛周围的范围内');return;}
 if(selectedDecoration==='waterfall'){
  if(decorations.length>=10){toast('已有 10 组装饰，请先移除一组');return;}
  if(!pendingWaterfall){if(p.y<.7){toast('请先点较高的山体，作为出水口');return;}pendingWaterfall={x:p.x,z:p.z};sourceMarker.position.copy(p);sourceMarker.position.y+=.13;sourceMarker.visible=true;host.setAttribute('data-waterfall-pending','true');$('hint').textContent=decorationHint();toast('出水口已选好，再点附近的海面');return;}
  var route=window.IslandWaterfalls.plan(terrainField,pendingWaterfall,p);if(route.error){toast(route.error);return;}
  checkpoint();buildFeedback.queue('leaves',pendingWaterfall.x,pendingWaterfall.z);decorations.push({id:Date.now()+Math.floor(Math.random()*1000),kind:'waterfall',x:pendingWaterfall.x,z:pendingWaterfall.z,ex:p.x,ez:p.z});cancelWaterfall();rebuild();save();$('hint').textContent=decorationHint();islandAudio.sound('waterfall');toast('瀑布已流向大海 · 可以撤销或移除');return;
 }
 if(selectedDecoration==='boat'&&!window.IslandDecorations.canFloat(terrainField,p.x,p.z,shoreRocks)){toast('小船需要空旷的海面，离岸稍远一点');return;}
 if(decorations.length>=10){toast('已有 10 组装饰，可撤销最近的放置');return;}
 checkpoint();decorations.push({id:Date.now()+Math.floor(Math.random()*1000),kind:selectedDecoration,x:p.x,z:p.z});decorManager.refresh(decorations,terrainField,shoreRocks);updateDecorCount();$('decor-tray').hidden=true;save();if(selectedDecoration==='boat')buildFeedback.queue('water',p.x,p.z);else if(terrainField.sample(p.x,p.z).y>-.07)buildFeedback.queue('leaves',p.x,p.z);islandAudio.sound(selectedDecoration);toast(selectedDecoration==='boat'?'小船出发了，会沿岛屿外围巡游':'飞鸟正在寻找附近的山峦');
}
document.querySelectorAll('.decor-option').forEach(function(b){b.addEventListener('click',function(){cancelWaterfall();selectedDecoration=b.getAttribute('data-decor');$('decor-tray').hidden=true;$('decor-erase').classList.remove('active');$('decor-erase').setAttribute('aria-pressed','false');document.querySelectorAll('.decor-option').forEach(function(q){var active=q===b;q.classList.toggle('active',active);q.setAttribute('aria-pressed',String(active));});$('hint').textContent=decorationHint();});});
$('decor-erase').addEventListener('click',function(){cancelWaterfall();selectedDecoration='erase';$('decor-tray').hidden=true;this.classList.add('active');this.setAttribute('aria-pressed','true');document.querySelectorAll('.decor-option').forEach(function(b){b.classList.remove('active');b.setAttribute('aria-pressed','false');});$('hint').textContent=decorationHint();});
$('settings-toggle').addEventListener('click',function(){var open=$('settings').hidden;$('settings').hidden=!open;this.setAttribute('aria-expanded',String(open));if(open)$('decor-tray').hidden=true;else if(mode==='decorate')$('decor-tray').hidden=false;});
$('settings-close').addEventListener('click',function(){$('settings').hidden=true;$('settings-toggle').setAttribute('aria-expanded','false');if(mode==='decorate')$('decor-tray').hidden=false;});
document.querySelectorAll('.tool').forEach(function(b){b.addEventListener('click',function(){setMode(b.getAttribute('data-mode'));});});
$('undo').addEventListener('click',undo);$('redo').addEventListener('click',redo);
$('regenerate').addEventListener('click',function(){checkpoint();makeIsland(seed+1);toast('另一座岛，另一种可能');});
$('empty').addEventListener('click',function(){checkpoint();buildFeedback.clear();cells={};decorations=[];rebuild();save();toast('海面准备好了，落下第一笔吧 · 可撤销');});
$('grid').addEventListener('change',function(){gridOn=this.checked;tickBuildGrid(0);gridState();});
$('waves').addEventListener('change',function(){waves=this.checked;});
function updateDensity(){$('density-label').textContent=density===0?'裸岩':density<.35?'稀疏':density<.75?'葱郁':'雨林';}
var densityEditing=false;
$('density').addEventListener('input',function(){if(!densityEditing){checkpoint();densityEditing=true;}density=Number(this.value)/100;updateDensity();dirty=true;});
$('density').addEventListener('change',function(){densityEditing=false;if(dirty)rebuild();save();});
$('rotate-left').addEventListener('click',function(){yaw+=Math.PI/8;updateCamera();});$('rotate-right').addEventListener('click',function(){yaw-=Math.PI/8;updateCamera();});
$('zoom-in').addEventListener('click',function(){zoom=Math.min(1.8,zoom*1.15);updateProjection();});$('zoom-out').addEventListener('click',function(){zoom=Math.max(.6,zoom/1.15);updateProjection();});
$('reset-view').addEventListener('click',function(){yaw=.73;pitch=.70;zoom=1;resize();toast('回到最初的视角');});
window.addEventListener('keydown',function(e){if(e.key==='Escape'){cancelWaterfall();$('hint').textContent=decorationHint();return;}if(e.target.tagName==='INPUT')return;if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==='z'){e.preventDefault();e.shiftKey?redo():undo();return;}var modes={'1':'raise','2':'lower','3':'plant','4':'orbit'};if(modes[e.key])setMode(modes[e.key]);});
window.addEventListener('resize',resize);
renderer.domElement.addEventListener('webglcontextlost',function(e){e.preventDefault();stopped=true;cancelAnimationFrame(frame);contextLosses++;$('fallback').hidden=false;$('fallback').querySelector('p').textContent='画面暂时中断，正在尝试保留小岛。';save();});
renderer.domElement.addEventListener('webglcontextrestored',function(){if(contextLosses>2)return;stopped=false;$('fallback').hidden=true;shore.needsUpdate=true;rebuild();last=0;frame=requestAnimationFrame(animate);});
window.addEventListener('blur',function(){flushPointer();finishStroke();controls.reset();});
document.addEventListener('visibilitychange',function(){flushPointer();finishStroke();controls.reset();if(document.hidden){cancelAnimationFrame(frame);last=0;}else if(!stopped){last=0;frame=requestAnimationFrame(animate);}});
function animate(now){if(stopped||document.hidden)return;frame=requestAnimationFrame(animate);if(last&&now-last<31)return;var dt=last?Math.min((now-last)/1000,.1):.033;last=now;flushPointer();tickBuildGrid(dt);decorClock+=dt;decorManager.update(decorClock,quality>1);if(waves)time+=dt;waterMat.uniforms.uTime.value=time;if(dirty&&(!stroke||stroke.orbit||performance.now()-lastDraft>=100))rebuild(!!stroke&&!stroke.orbit);var decorState=decorManager.summary();if(now>=nextDiagnostics)host.setAttribute('data-decoration-state',JSON.stringify(decorState));islandAudio.updateAmbience(decorState,dt);buildFeedback.update(decorClock,terrainField,dirty);renderer.render(scene,camera);if(now>=nextDiagnostics){nextDiagnostics=now+200;host.setAttribute('data-build-feedback',JSON.stringify(buildFeedback.summary()));host.setAttribute('data-view-state',JSON.stringify({zoom:zoom,yaw:yaw,pitch:pitch}));host.setAttribute('data-render-stats',JSON.stringify({drawCalls:renderer.info.render.calls,triangles:renderer.info.render.triangles,geometries:renderer.info.memory.geometries,textures:renderer.info.memory.textures,quality:quality}));}
 if((dt>.065||renderer.info.render.triangles>100000)&&!stroke){slow++;}else slow=Math.max(0,slow-1);
 if(slow>50){slow=0;if(quality>1){quality=1;sun.castShadow=false;renderer.shadowMap.enabled=false;buildFeedback.setEnabled(false);waterMat.uniforms.uDetail.value=.3;resize();toast('已减轻光影，让海岛更流畅');}else if(waves){waves=false;$('waves').checked=false;toast('已暂停海浪动画，保留造岛操作');}else{stopped=true;cancelAnimationFrame(frame);save();islandAudio.suspend();$('fallback').hidden=false;$('fallback').querySelector('p').textContent='这座岛暂时超出了设备的绘制能力，请稍后重新进入。';}}
}
var loaded=false;
try{var saved=JSON.parse(storage.getItem('island-atelier-v1'));if(!previewMode&&saved&&saved.cells&&typeof saved.seed==='number'&&typeof saved.density==='number'&&Object.keys(saved.cells).length<=225){var valid=Object.keys(saved.cells).every(function(k){var c=saved.cells[k];return Number.isInteger(c.x)&&Number.isInteger(c.z)&&Math.abs(c.x)<=7&&Math.abs(c.z)<=7&&Number.isInteger(c.h)&&c.h>=1&&c.h<=8&&k===key(c.x,c.z);});if(valid){cells=saved.cells;seed=saved.seed;decorations=loadDecorations(saved);density=Math.max(0,Math.min(1,saved.density));$('density').value=Math.round(density*100);rebuild();loaded=true;}}}catch(e){}
if(!loaded){if(previewTerraces)makeIsland(24);else rebuild();}if(previewMode){document.querySelector('.bottom-note').textContent='示例可自由试玩 · 不覆盖原有存档';}updateDensity();updateButtons();setMode('raise');resize();
if(window.IslandStorage&&storage.hasReadError())toast('之前的小岛暂时未能读取，请稍后重新进入');
renderer.debug.onShaderError=function(gl,program,vs,fs){console.error('Shader error',gl.getProgramInfoLog(program),gl.getShaderInfoLog(vs),gl.getShaderInfoLog(fs));stopped=true;$('fallback').hidden=false;$('fallback').querySelector('p').textContent='当前设备无法编译水面效果。请稍后重新进入小工具。';};
renderer.compile(scene,camera);if(!stopped)frame=requestAnimationFrame(animate);
// Read-only diagnostics for local testing; not required by gameplay.
window.islandDiagnostics=function(){return {cells:Object.keys(cells).length,plants:plants,triangles:renderer.info.render.triangles,drawCalls:renderer.info.render.calls,geometries:renderer.info.memory.geometries,textures:renderer.info.memory.textures,seed:seed,mode:mode,density:density,quality:quality,webgl2:renderer.capabilities.isWebGL2,history:history.length,future:future.length};};
})();
