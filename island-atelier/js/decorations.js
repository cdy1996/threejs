/* Bundled: decorations.js */
(function(root){
'use strict';
var BoatNavigation=root.IslandBoatNavigation||(typeof require==='function'?require('./boat-navigation.js'):null);
var Waterfalls=root.IslandWaterfalls||(typeof require==='function'?require('./waterfalls.js'):null);
function canFloat(field,x,z,rocks){
 for(var i=0;i<9;i++){var a=i*6.283/8,r=i===8?0:.78;if(field.sample(x+Math.cos(a)*r,z+Math.sin(a)*r).y>-.14)return false;}
 return !(rocks||[]).some(function(p){return Math.hypot(p.x-x,p.z-z)<p.r+.78;});
}
function validRecords(input){return Array.isArray(input)?input.filter(function(p){return p&&['birds','boat','waterfall'].indexOf(p.kind)!==-1&&Number.isFinite(p.x)&&Number.isFinite(p.z)&&Math.abs(p.x)<=16&&Math.abs(p.z)<=16&&Number.isFinite(p.id)&&(p.kind!=='waterfall'||(Number.isFinite(p.ex)&&Number.isFinite(p.ez)&&Math.abs(p.ex)<=16&&Math.abs(p.ez)<=16));}).slice(0,10).map(function(p){var r={id:p.id,kind:p.kind,x:p.x,z:p.z};if(p.kind==='waterfall'){r.ex=p.ex;r.ez=p.ez;}return r;}):[];}
// Find the closest connected elevated landmass, using distance to its edge.
function findMountain(field,x,z){
 var land=field.all||[],high=land.filter(function(c){return c.h>=3;});if(!high.length)high=land;
 if(!high.length)return {x:x,z:z,peak:.3,radius:.85,rx:1,rz:1,found:false};
 var lookup={},visited={},groups=[];
 high.forEach(function(c){lookup[c.x+','+c.z]=c;});
 high.forEach(function(start){var key=start.x+','+start.z;if(visited[key])return;var queue=[start],group=[];visited[key]=true;
  while(queue.length){var c=queue.pop();group.push(c);[[1,0],[-1,0],[0,1],[0,-1]].forEach(function(d){var k=(c.x+d[0])+','+(c.z+d[1]);if(lookup[k]&&!visited[k]){visited[k]=true;queue.push(lookup[k]);}});}groups.push(group);
 });
 groups.sort(function(a,b){function near(g){return g.reduce(function(m,c){return Math.min(m,Math.hypot(c.x*field.step-x,c.z*field.step-z));},Infinity);}return near(a)-near(b);});
 var chosen=groups[0],cx=0,cz=0,weight=0,peak=.3;
 chosen.forEach(function(c){cx+=c.x*field.step*c.h;cz+=c.z*field.step*c.h;weight+=c.h;peak=Math.max(peak,field.sample(c.x*field.step,c.z*field.step).y);});cx/=weight;cz/=weight;
 var rx=.8,rz=.8;chosen.forEach(function(c){rx=Math.max(rx,Math.abs(c.x*field.step-cx)+.9);rz=Math.max(rz,Math.abs(c.z*field.step-cz)+.9);});
 return {x:cx,z:cz,peak:peak,radius:Math.max(rx,rz),rx:rx,rz:rz,found:true};
}

function create(T,scene){
 var items={},clock=0,terrain=null,navigation=null,navigationField=null,navigationRocks=null;
 var cream=new T.MeshStandardMaterial({color:0xfff4d8,roughness:.9,side:T.DoubleSide});
 var dark=new T.MeshStandardMaterial({color:0x446766,roughness:1});
 var boatMaterial=new T.MeshStandardMaterial({vertexColors:true,roughness:.78,flatShading:false,side:T.DoubleSide});
 var sphere=new T.IcosahedronGeometry(1,1),wing=new T.BufferGeometry();
 wing.setAttribute('position',new T.Float32BufferAttribute([0,0,0,.38,.025,-.08,.18,0,.12, .38,.025,-.08,.74,-.04,.10,.18,0,.12, .74,-.04,.10,.51,-.025,.15,.18,0,.12],3));wing.computeVertexNormals();
 function mesh(g,m,sx,sy,sz){var o=new T.Mesh(g,m);o.scale.set(sx,sy,sz);return o;}
 function boatGeometry(){
  var positions=[],normals=[],colors=[];
  function add(geometry,color,position,rotation,scale){
   if(geometry.index){var unindexed=geometry.toNonIndexed();geometry.dispose();geometry=unindexed;}
   var matrix=new T.Matrix4().compose(new T.Vector3().fromArray(position||[0,0,0]),new T.Quaternion().setFromEuler(new T.Euler().fromArray((rotation||[0,0,0]).concat(['XYZ']))),new T.Vector3().fromArray(scale||[1,1,1]));
   geometry.applyMatrix4(matrix);var p=geometry.attributes.position,n=geometry.attributes.normal,c=new T.Color(color);
   for(var i=0;i<p.count;i++){positions.push(p.getX(i),p.getY(i),p.getZ(i));normals.push(n.getX(i),n.getY(i),n.getZ(i));colors.push(c.r,c.g,c.b);}geometry.dispose();
  }
  function ball(color,pos,scale){add(new T.SphereGeometry(1,12,8),color,pos,null,scale);}
  function roundedBox(w,h,d,r,color,pos){
   var shape=new T.Shape(),x=-w/2,y=-h/2;shape.moveTo(x+r,y);shape.lineTo(x+w-r,y);shape.quadraticCurveTo(x+w,y,x+w,y+r);shape.lineTo(x+w,y+h-r);shape.quadraticCurveTo(x+w,y+h,x+w-r,y+h);shape.lineTo(x+r,y+h);shape.quadraticCurveTo(x,y+h,x,y+h-r);shape.lineTo(x,y+r);shape.quadraticCurveTo(x,y,x+r,y);
   var g=new T.ExtrudeGeometry(shape,{depth:d-2*r,bevelEnabled:true,bevelSegments:2,steps:1,bevelSize:r*.55,bevelThickness:r,curveSegments:3});g.translate(0,0,-d/2+r);add(g,color,pos);
  }
  // Overlapping soft forms read as a chunky painted toy, rather than a thin sailboat.
  ball('#28728b',[0,.09,0],[.46,.23,.75]);
  ball('#d95550',[0,.28,0],[.48,.22,.78]);
  ball('#e9b75f',[0,.425,0],[.445,.07,.715]);
  add(new T.TorusGeometry(1,.065,5,24),'#f3bd54',[0,.46,0],[Math.PI/2,0,0],[.46,.72,.75]);
  roundedBox(.57,.61,.52,.06,'#eab744',[0,.775,.105]);
  roundedBox(.76,.105,.69,.07,'#c64d3e',[0,1.12,.08]);
  roundedBox(.68,.025,.62,.035,'#e89940',[0,1.17,.08]);
  // Round turquoise windows with thick brass rims on front and both sides.
  [-.155,.155].forEach(function(x){ball('#287e97',[x,.89,.399],[.087,.095,.035]);add(new T.TorusGeometry(.09,.017,5,12),'#edc46e',[x,.89,.404]);});
  [-1,1].forEach(function(side){
   ball('#246f86',[side*.322,.88,.17],[.03,.095,.095]);add(new T.TorusGeometry(.092,.018,5,12),'#f4d180',[side*.33,.88,.17],[0,Math.PI/2,0]);
   roundedBox(.018,.33,.145,.025,'#b77848',[side*.334,.68,-.095]);
   [-.39,.39].forEach(function(z){
    add(new T.TorusGeometry(.118,.035,5,16),'#465c60',[side*.476,.32,z],[0,Math.PI/2,0]);
    for(var k=0;k<4;k++)add(new T.TorusGeometry(.115,.03,7,8,Math.PI/2),k%2?'#f7db9d':'#e17a48',[side*.487,.325,z],[0,side*Math.PI/2,k*Math.PI/2]);
   });
  });
  // A stout leaning smokestack, a tiny barrel and a cheerful pennant.
  add(new T.CylinderGeometry(.08,.10,.35,14),'#ca4f40',[.13,.68,-.43],[0,0,-.14]);
  add(new T.CylinderGeometry(.105,.105,.085,14),'#365e69',[.151,.875,-.43],[0,0,-.14]);
  add(new T.CylinderGeometry(.065,.065,.01,14),'#203e48',[.157,.92,-.43],[0,0,-.14]);
  add(new T.CylinderGeometry(.10,.10,.19,12),'#b78043',[-.21,.57,-.40]);
  add(new T.TorusGeometry(.102,.012,5,16),'#78543d',[-.21,.60,-.40],[Math.PI/2,0,0]);
  add(new T.CylinderGeometry(.012,.015,.63,6),'#6d664a',[0,1.48,-.15],[0,0,-.07]);
  var flag=new T.BufferGeometry();flag.setAttribute('position',new T.Float32BufferAttribute([.02,1.8,-.15,.37,1.7,-.12,.04,1.59,-.15],3));flag.computeVertexNormals();add(flag,'#e68636');
  var geo=new T.BufferGeometry();geo.setAttribute('position',new T.Float32BufferAttribute(positions,3));geo.setAttribute('normal',new T.Float32BufferAttribute(normals,3));geo.setAttribute('color',new T.Float32BufferAttribute(colors,3));geo.computeBoundingSphere();return geo;
 }
 var boatGeo=boatGeometry();
 function construct(record){
  var group=new T.Group(),obj={group:group,record:record,birds:[],phase:(record.id%997)/997*6.283,base:0};
  if(record.kind==='boat'){group.add(new T.Mesh(boatGeo,boatMaterial));group.rotation.y=obj.phase;}
  if(record.kind==='birds'){
   var count=Math.floor(record.id)%2?3:2;
   for(var i=0;i<count;i++){
    var bird=new T.Group(),body=mesh(sphere,cream,.038,.042,.125);bird.add(body);
    // Stable variation keeps individual sizes through terrain rebuilds and reloads.
    var sizeSeed=Math.sin((record.id%100003)*.731)*43758.5453,size=.85+.30*((sizeSeed-Math.floor(sizeSeed)+i*.61803398875)%1);bird.scale.setScalar(size);
    var left=new T.Mesh(wing,cream),right=new T.Mesh(wing,cream);right.scale.x=-1;bird.add(left,right);group.add(bird);obj.birds.push({body:bird,left:left,right:right});
   }
  }
  scene.add(group);return obj;
 }
 function refresh(records,field,rocks){
  var navChanged=navigationField!==field||navigationRocks!==rocks;
  if(records.some(function(r){return r.kind==='boat';})&&(!navigation||navChanged)){navigation=BoatNavigation.create(field,rocks,canFloat);navigationField=field;navigationRocks=rocks;}
  terrain=field;var ids={};records.forEach(function(r){ids[r.id]=true;});Object.keys(items).forEach(function(id){if(!ids[id]){scene.remove(items[id].group);if(items[id].waterfall)items[id].waterfall.dispose();delete items[id];}});
  records.forEach(function(r){
   var relocated=false;
   if(r.kind==='boat'&&!canFloat(field,r.x,r.z,rocks)){
    var originX=r.x,originZ=r.z,found=false;
    for(var radius=.5;radius<=20&&!found;radius+=.5)for(var n=0;n<24&&!found;n++){var x=originX+Math.cos(n*6.283/24)*radius,z=originZ+Math.sin(n*6.283/24)*radius;if(Math.abs(x)<=16&&Math.abs(z)<=16&&canFloat(field,x,z,rocks)){r.x=x;r.z=z;found=true;relocated=true;}}
   }
   var obj=items[r.id];if(r.kind==='waterfall'){if(obj){scene.remove(obj.group);obj.waterfall.dispose();}var wf=Waterfalls.create(T,r,field);obj={group:wf.group,record:r,birds:[],waterfall:wf,base:0};items[r.id]=obj;scene.add(obj.group);return;}if(!obj){obj=construct(r);items[r.id]=obj;}if(r.kind==='boat')prepareBoat(obj,r,navChanged,relocated);obj.record=r;if(r.kind==='birds'){var route=findMountain(field,r.x,r.z);if(!obj.route||Math.hypot(route.x-obj.route.x,route.z-obj.route.z)>.2){obj.departure={x:obj.route?obj.group.position.x:r.x,z:obj.route?obj.group.position.z:r.z};obj.routeStart=clock;}obj.route=route;}
   var height=field.sample(r.x,r.z).y;
   if(r.kind!=='boat')for(var n=0;n<8;n++)height=Math.max(height,field.sample(r.x+Math.cos(n*.785)*1.5,r.z+Math.sin(n*.785)*1.5).y);
   obj.base=r.kind==='boat'?-.015:Math.max(.3,height)+1.25;
  });update(clock);
 }
 function prepareBoat(obj,r,replan,relocated){
  var old=obj.sailing,changed=old&&!relocated&&(old.anchorX!==r.x||old.anchorZ!==r.z);
  if(old&&!replan&&!changed)return;
  var position=old&&!changed?{x:old.x,z:old.z}:{x:r.x,z:r.z},safe=navigation.nearestSea(position);
  if(!safe){obj.sailing=null;return;}
  var course=navigation.course(safe,r.id%2?1:-1);
  obj.sailing={x:safe.x,z:safe.z,anchorX:r.x,anchorZ:r.z,course:course,index:0,approaching:true,speed:old?old.speed:.3,heading:old?old.heading:obj.group.rotation.y};
 }
 function sail(o,t,dt){
  var m=o.sailing;if(!m)return;
  // Smooth seeded speed changes avoid sudden starts while giving every boat its own pace.
  var interval=7+o.phase*.8,slot=Math.floor(t/interval),blend=t/interval-slot;blend=blend*blend*(3-2*blend);
  function speedAt(n){var value=Math.sin(n*127.1+(o.record.id%100003)*.173)*43758.5453;return .24+(value-Math.floor(value))*.42;}
  var target=speedAt(slot)*(1-blend)+speedAt(slot+1)*blend;
  m.speed+=(target-m.speed)*(1-Math.exp(-dt*.65));var remaining=m.speed*dt,dx=0,dz=0;
  for(var n=0;n<20&&remaining>0&&m.course;n++){
   var list=m.approaching?m.course.approach:m.course.loop,goal=list[m.index],vx=goal.x-m.x,vz=goal.z-m.z,d=Math.hypot(vx,vz);
   if(d<.00001){m.index++;if(m.index>=list.length){m.index=0;m.approaching=false;}continue;}
   var step=Math.min(d,remaining),next={x:m.x+vx/d*step,z:m.z+vz/d*step};
   if(!navigation.segment({x:m.x,z:m.z},next)){m.course=navigation.course({x:m.x,z:m.z},o.record.id%2?1:-1);m.index=0;m.approaching=true;break;}
   dx=next.x-m.x;dz=next.z-m.z;m.x=next.x;m.z=next.z;remaining-=step;
   if(step===d){m.index++;if(m.index>=list.length){m.index=0;m.approaching=false;}}
  }
  if(Math.hypot(dx,dz)>.000001){var wanted=Math.atan2(dx,dz),delta=Math.atan2(Math.sin(wanted-m.heading),Math.cos(wanted-m.heading));m.heading+=delta*(1-Math.exp(-dt*4));}
  o.group.position.x=m.x;o.group.position.z=m.z;o.group.rotation.y=m.heading;
 }
 function update(t,effects){var dt=Math.max(0,Math.min(.25,t-clock));clock=t;Object.keys(items).forEach(function(id){var o=items[id],r=o.record,p=o.phase;if(o.waterfall){o.waterfall.update(t,effects);return;}o.group.position.set(r.x,o.base,r.z);
  if(r.kind==='boat'){sail(o,t,dt);o.group.position.y+=Math.sin(t*1.8+p)*.065;o.group.rotation.z=Math.sin(t*1.3+p)*.055;o.group.rotation.x=Math.cos(t*1.5+p)*.035;}
  if(r.kind==='birds'){
   var route=o.route,blend=Math.min(1,Math.max(0,(t-o.routeStart)/4.5));blend=blend*blend*(3-2*blend);
   var cx=o.departure.x+(route.x-o.departure.x)*blend,cz=o.departure.z+(route.z-o.departure.z)*blend;o.group.position.set(cx,0,cz);
   o.birds.forEach(function(b,i){
    var speed=.24+((r.id+i*37)%71)/710,direction=r.id%2?1:-1;
    function flight(at){var a=at*speed*direction+p+i*.33+.17*Math.sin(at*.23+i+p),wander=1+.11*Math.sin(at*.31+p+i)+.07*Math.sin(at*.17+i*2);
     var rx=(.6+(route.rx-.6)*blend+i*.10)*wander,rz=(.5+(route.rz-.5)*blend+i*.08)*wander;
     return {x:Math.cos(a)*rx,z:Math.sin(a)*rz};}
    var here=flight(t),next=flight(t+.05),wx=cx+here.x,wz=cz+here.z;
    var targetY=Math.max(route.peak*.85+.9+Math.sin(t*.43+p+i)*.24+i*.13,terrain.sample(wx,wz).y+.85,terrain.sample(cx+next.x,cz+next.z).y+.85);
    b.body.position.set(here.x,targetY,here.z);b.body.rotation.y=Math.atan2(next.x-here.x,next.z-here.z);b.body.rotation.z=-direction*.16+Math.sin(t*.6+p+i)*.10;
    // Alternate gliding and short flapping bursts, with a different rhythm per bird.
    var flap=.08+.42*Math.pow(Math.max(0,Math.sin(t*.72+p+i)),2);
    b.left.rotation.z=.10+Math.sin(t*(6.6+i*.3)+i)*flap;b.right.rotation.z=-b.left.rotation.z;
   });
  }
 });}
 function summary(){return Object.keys(items).map(function(id){var o=items[id],r=o.record;return {kind:r.kind,x:r.kind==='boat'?Number(o.group.position.x.toFixed(3)):r.x,z:r.kind==='boat'?Number(o.group.position.z.toFixed(3)):r.z,speed:o.sailing?Number(o.sailing.speed.toFixed(3)):0,cruising:!!(o.sailing&&o.sailing.course),y:Number(o.group.position.y.toFixed(3)),birds:o.birds.length,active:o.waterfall?o.waterfall.active:true,splashBends:o.waterfall?o.waterfall.bends||0:0,mountain:o.route?{x:o.route.x,z:o.route.z,found:o.route.found}:null,phase:o.birds.length?Number(o.birds[0].body.position.x.toFixed(3)):Number(o.group.position.x.toFixed(3))};});}
 function pick(ray){var found=null,distance=Infinity;Object.keys(items).forEach(function(id){var o=items[id];o.group.updateMatrixWorld(true);var hits=ray.intersectObject(o.group,true);if(hits.length&&hits[0].distance<distance){distance=hits[0].distance;found=o.record.id;}else if(ray.ray.distanceToPoint(o.group.position)<.6){var d=ray.ray.origin.distanceTo(o.group.position);if(d<distance){distance=d;found=o.record.id;}}});return found;}
 return {refresh:refresh,update:update,summary:summary,pick:pick};
}
var api={create:create,canFloat:canFloat,validRecords:validRecords,findMountain:findMountain};
if(typeof module!=='undefined'&&module.exports)module.exports=api;else root.IslandDecorations=api;
})(typeof window!=='undefined'?window:this);
