/* Bundled: waterfalls.js */
(function(root){'use strict';
function halfWidth(t){return .28*(1+.5*t*t*(3-2*t));}
function plan(field,start,end){
 var distance=Math.hypot(end.x-start.x,end.z-start.z),height=field.sample(start.x,start.z).y;
 if(height<.7)return {error:'起点需要选在较高的山体上'};
 if(distance<.6||distance>7)return {error:'请选择起点附近的海面（距离不超过 7 格）'};
 if(field.sample(end.x,end.z).y>-.12)return {error:'终点需要选在海面上'};
 var points=[],raw=[],sideX=(end.z-start.z)/distance,sideZ=-(end.x-start.x)/distance;
 for(var i=0;i<=48;i++){
  var t=i/48,clearance=halfWidth(t)+.02,x=start.x+(end.x-start.x)*t,z=start.z+(end.z-start.z)*t,y=-.025;
  // Sample the entire widening ribbon, including its banks, not just the centreline.
  for(var lane=-2;lane<=2;lane++){var ground=field.sample(x+sideX*clearance*lane/2,z+sideZ*clearance*lane/2).y;y=Math.max(y,ground+(ground>-.07?.24:.025));}
  raw.push(y);points.push({x:x,y:y,z:z});
 }
 if(raw[0]>height+.45)return {error:'起点旁的山体太高，请选择更开阔的出水位置'};
 if(raw[48]>-.024)return {error:'终点靠岸太近，请选择稍宽的海面'};
 // A backwards upper envelope bridges small surface dips. Clamping downwards
 // would hide the uphill sections inside the next ledge, so never lower below ground.
 for(var i=47;i>=0;i--)points[i].y=Math.max(points[i].y,points[i+1].y);
 if(points[0].y>raw[0]+.035||points.some(function(p,i){return p.y-raw[i]>.34;}))return {error:'这条水路有逆坡阻挡，请换一个更顺坡的海面终点'};
 // Smooth the bottoms of drops while preserving the monotone, above-ground envelope.
 for(var pass=0;pass<2;pass++){
  var ys=points.map(function(p){return p.y;});
  for(var i=1;i<48;i++)points[i].y=Math.max(ys[i],(ys[i-1]+ys[i]*2+ys[i+1])/4);
 }
 // Check between vertices too: a narrow shoulder must not poke through the ribbon.
 for(var pass=0;pass<2;pass++){
  for(var i=0;i<48;i++){
   var a=points[i],b=points[i+1],raise=0;
   for(var sub=1;sub<4;sub++){var f=sub/4,t=(i+f)/48,w=halfWidth(t)+.02,x=a.x+(b.x-a.x)*f,z=a.z+(b.z-a.z)*f,level=a.y+(b.y-a.y)*f;
    for(var lane=-2;lane<=2;lane++){var ground=field.sample(x+sideX*w*lane/2,z+sideZ*w*lane/2).y,required=Math.max(-.025,ground+(ground>-.07?.24:.025));raise=Math.max(raise,required-level);}
   }
   if(raise>1e-6){points[i].y+=raise;if(i<47)points[i+1].y+=raise;else return {error:'终点前有浅滩，请把终点移向开阔海面'};}
  }
  for(var i=47;i>=0;i--)points[i].y=Math.max(points[i].y,points[i+1].y);
 }
 if(points[0].y>raw[0]+.08||points.some(function(p,i){return p.y-raw[i]>.40;}))return {error:'这条水路有逆坡阻挡，请换一个更顺坡的海面终点'};

 return {points:points,height:height,distance:distance};
}
// Select genuine changes of flow direction, not every small terrain sampling kink.
function bends(points){
 var candidates=[],distance=[0];
 for(var i=1;i<points.length;i++)distance.push(distance[i-1]+Math.hypot(points[i].x-points[i-1].x,points[i].y-points[i-1].y,points[i].z-points[i-1].z));
 for(var i=2;i<points.length-2;i++){var a=points[i-2],b=points[i],c=points[i+2],u=[b.x-a.x,b.y-a.y,b.z-a.z],v=[c.x-b.x,c.y-b.y,c.z-b.z],dot=(u[0]*v[0]+u[1]*v[1]+u[2]*v[2])/(Math.hypot.apply(null,u)*Math.hypot.apply(null,v)||1),angle=Math.acos(Math.max(-1,Math.min(1,dot)));
  if(angle>.32&&b.y>.08)candidates.push({index:i,strength:angle,distance:distance[i]});
 }
 var chosen=[];candidates.sort(function(a,b){return b.strength-a.strength;}).forEach(function(c){if(chosen.length<6&&chosen.every(function(q){return Math.abs(q.distance-c.distance)>.70;}))chosen.push(c);});
 return chosen.sort(function(a,b){return a.index-b.index;});
}
function create(T,record,field){
 var group=new T.Group(),result=plan(field,record,{x:record.ex,z:record.ez});if(result.error)return {group:group,active:false,update:function(){},dispose:function(){}};
 var points=result.points,dx=record.ex-record.x,dz=record.ez-record.z,len=Math.hypot(dx,dz);dx/=len;dz/=len;
 var turns=bends(points),pos=[],uv=[],idx=[],foamWeights=[],travel=0;
 points.forEach(function(p,i){if(i)travel+=Math.hypot(p.x-points[i-1].x,p.y-points[i-1].y,p.z-points[i-1].z);var width=halfWidth(i/48),weight=0;turns.forEach(function(b){weight=Math.max(weight,Math.exp(-Math.pow((i-b.index)/1.7,2))*.75);});[-1,1].forEach(function(s){pos.push(p.x+dz*width*s,p.y,p.z-dx*width*s);uv.push((s+1)/2,travel);foamWeights.push(weight);});if(i<48){var k=i*2;idx.push(k,k+2,k+1,k+1,k+2,k+3);}});
 var g=new T.BufferGeometry();g.setAttribute('position',new T.Float32BufferAttribute(pos,3));g.setAttribute('uv',new T.Float32BufferAttribute(uv,2));g.setAttribute('bendFoam',new T.Float32BufferAttribute(foamWeights,1));g.setIndex(idx);g.computeVertexNormals();
 // Match the ocean's teal palette, low-frequency mottling and soft cellular caustics.
 // Advect in arc-length coordinates so highlights flow downstream without moving the route.
 var water=new T.ShaderMaterial({side:T.DoubleSide,transparent:true,depthWrite:false,forceSinglePass:true,uniforms:{time:{value:0},flowLength:{value:travel}},vertexShader:[
  'varying vec2 vUv;varying float vFoam;varying vec3 vWorld;attribute float bendFoam;',
  'void main(){vUv=uv;vFoam=bendFoam;vec4 world=modelMatrix*vec4(position,1.);vWorld=world.xyz;gl_Position=projectionMatrix*viewMatrix*world;}'
 ].join('\n'),fragmentShader:[
  'precision highp float;varying vec2 vUv;varying float vFoam;varying vec3 vWorld;uniform float time;uniform float flowLength;',
  'float hash(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}',
  'float noise(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);return mix(mix(hash(i),hash(i+vec2(1,0)),f.x),mix(hash(i+vec2(0,1)),hash(i+vec2(1,1)),f.x),f.y);}',
  'float cells(vec2 p){vec2 i=floor(p),f=fract(p);float a=9.,b=9.;for(int y=-1;y<=1;y++){for(int x=-1;x<=1;x++){vec2 g=vec2(float(x),float(y));vec2 h=vec2(hash(i+g),hash(i+g+19.7));vec2 o=.5+.36*sin(time*.28+6.2831*h);vec2 r=g+o-f;float d=dot(r,r);if(d<a){b=a;a=d;}else if(d<b){b=d;}}}return sqrt(b)-sqrt(a);}',
  'void main(){float x=vUv.x,d=vUv.y,t=time;vec2 p=vec2(x*2.1,d*.95-t*.48);',
  'float n=noise(p*.38);float depth=.14+n*.19;vec3 col=mix(vec3(.12,.77,.69),vec3(.035,.46,.58),depth);',
  'float mottling=noise(p*.65+noise(p*.22)*2.);col*=.91+mottling*.17;',
  'vec2 warp=vec2(sin(p.y*.65+t*.27),cos(p.x*.72+t*.20))*.38;float caustic=1.-smoothstep(.022,.10,cells(p+warp));',
  'col+=vec3(.28,.50,.35)*caustic*(1.-depth)*.22;',
  'float current=noise(vec2(x*7.,d*.65-t*.65));col+=vec3(.10,.19,.14)*smoothstep(.52,.88,current)*.12;',
  'float edge=smoothstep(.40,.495,abs(x-.5));float foam=vFoam*smoothstep(.48,.83,noise(p*3.2))* .35;',
  'col=mix(col,vec3(.83,.98,.85),foam+edge*.12);',
  // Fade only the low, final section; the seabed and existing ocean supply the contact colour.
  'float remaining=max(0.,flowLength-d);float contact=1.-smoothstep(.015,.28,vWorld.y+.025);float landing=mix(1.,smoothstep(0.,.62,remaining),contact);',
  'float bank=1.-smoothstep(.465,.5,abs(x-.5));gl_FragColor=vec4(col,.94*bank*landing);}'
 ].join('\n')});
 var sheet=new T.Mesh(g,water);sheet.name='flow';sheet.renderOrder=3;group.add(sheet);
 var rock=new T.MeshStandardMaterial({color:0x899d9b,roughness:1,flatShading:true}),green=new T.MeshStandardMaterial({vertexColors:true,roughness:1,side:T.DoubleSide}),foam=new T.MeshBasicMaterial({color:0xd4fadd,transparent:true,opacity:.72,depthWrite:false});
 var start=points[0],end=points[points.length-1],stoneGeo=new T.DodecahedronGeometry(1,0);
 function stone(side,forward,rise,sx,sy,sz,angle){var o=new T.Mesh(stoneGeo,rock);o.position.set(start.x+dz*side+dx*forward,start.y+rise,start.z-dx*side+dz*forward);o.scale.set(sx,sy,sz);o.rotation.set(.12,Math.atan2(dx,dz)+angle,.08);o.castShadow=true;o.receiveShadow=true;group.add(o);return o;}
 // Water emerges beneath a loose rock cap; terrain and grass underneath remain intact.
 stone(0,-.17,.11,.47,.28,.38,.3);stone(-.34,.015,-.015,.25,.24,.30,-.3);stone(.37,-.08,.015,.29,.29,.32,.1);
 var gp=[],gc=[];
 function grass(side,forward,rise,scale){var x=start.x+dz*side+dx*forward,z=start.z-dx*side+dz*forward,y=start.y+rise;
  for(var i=0;i<5;i++){var a=i*2.399+side*4,ux=Math.cos(a),uz=Math.sin(a),length=scale*(.19+.06*Math.sin(i*3+1)),w=scale*.037,mid=[x+ux*length*.4,y+length*.65,z+uz*length*.4],tip=[x+ux*length,y+length*.53,z+uz*length],left=[x-uz*w,y,z+ux*w],right=[x+uz*w,y,z-ux*w];
   [left,mid,tip,right,tip,mid].forEach(function(p,j){gp.push(p[0],p[1],p[2]);var c=new T.Color(j<3?'#8ec857':'#4c944b');gc.push(c.r,c.g,c.b);});
  }
 }
 grass(-.14,-.24,.37,1.05);grass(.40,-.09,.25,.8);grass(-.32,.08,.13,.85);grass(.22,.04,.11,.7);
 var grassGeo=new T.BufferGeometry();grassGeo.setAttribute('position',new T.Float32BufferAttribute(gp,3));grassGeo.setAttribute('color',new T.Float32BufferAttribute(gc,3));grassGeo.computeVertexNormals();var plants=new T.Mesh(grassGeo,green);plants.castShadow=true;group.add(plants);
 var emitters=turns.map(function(b){return {point:points[b.index],strength:Math.min(1,b.strength)};});emitters.push({point:end,strength:1});
 var spray=new T.InstancedMesh(new T.SphereGeometry(1,6,4),foam,emitters.length*6),dummy=new T.Object3D();spray.name='bend-splashes';spray.renderOrder=4;spray.frustumCulled=false;group.add(spray);
 return {group:group,active:true,bends:turns.length,update:function(t,effects){water.uniforms.time.value=t;spray.visible=effects!==false;if(!spray.visible)return;
  emitters.forEach(function(e,k){for(var i=0;i<6;i++){var f=(t*(.75+(i%3)*.15)+i/6+k*.27)%1,a=i*2.4+k,r=(i<2?.10:.18)+f*.26,base=e.point;
   dummy.position.set(base.x+dz*Math.cos(a)*r+dx*f*.12,base.y+.04+Math.sin(f*Math.PI)*(.14+e.strength*.16),base.z-dx*Math.cos(a)*r+dz*f*.12);
   var size=(i<2?.095:.043)*(1-f*.64);dummy.scale.set(size,size*(i<2?1:1.3),size);dummy.updateMatrix();spray.setMatrixAt(k*6+i,dummy.matrix);
  }});spray.instanceMatrix.needsUpdate=true;
 },dispose:function(){var geometries=new Set();group.traverse(function(o){if(o.geometry)geometries.add(o.geometry);if(o.isInstancedMesh)o.dispose();});geometries.forEach(function(g){g.dispose();});water.dispose();rock.dispose();green.dispose();foam.dispose();}};
}
var api={plan:plan,bends:bends,create:create};if(typeof module!=='undefined'&&module.exports)module.exports=api;else root.IslandWaterfalls=api;
})(typeof window!=='undefined'?window:this);
