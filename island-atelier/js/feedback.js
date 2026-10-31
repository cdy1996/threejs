/* Bundled: feedback.js */
/* Brief, pooled construction effects. No textures and no saved particle state. */
(function(root){'use strict';
function create(T,scene){
 var clock=0,pending=[],total=0,last=null,disposed=false,enabled=true,dummy=new T.Object3D(),up=new T.Vector3(0,1,0),direction=new T.Vector3();
 var material=new T.ShaderMaterial({transparent:true,depthWrite:false,side:T.DoubleSide,forceSinglePass:true,vertexShader:[
  'attribute vec4 burstTint;varying vec4 vTint;varying float vLight;',
  'void main(){vTint=burstTint;vec3 n=normalize(mat3(modelMatrix*instanceMatrix)*normal);vLight=.80+.20*abs(dot(n,normalize(vec3(-.4,.8,.3))));gl_Position=projectionMatrix*modelViewMatrix*instanceMatrix*vec4(position,1.);}'
 ].join('\n'),fragmentShader:[
  'varying vec4 vTint;varying float vLight;',
  'void main(){gl_FragColor=vec4(vTint.rgb*vLight,vTint.a);',
  '#include <tonemapping_fragment>',
  '#include <colorspace_fragment>',
  '}'
 ].join('\n')});
 var leafGeometry=new T.BufferGeometry();
 // A folded almond shape, with a raised centre crease, catches light as it turns.
 leafGeometry.setAttribute('position',new T.Float32BufferAttribute([
  0,0,-.72,-.30,0,-.08,0,.12,.05, -.30,0,-.08,0,0,.72,0,.12,.05,
  0,0,-.72,0,.12,.05,.30,0,-.08, .30,0,-.08,0,.12,.05,0,0,.72
 ],3));leafGeometry.computeVertexNormals();
 function pool(name,geometry,capacity,colors){
  var tint=new T.InstancedBufferAttribute(new Float32Array(capacity*4),4);tint.setUsage(T.DynamicDrawUsage);geometry.setAttribute('burstTint',tint);
  var mesh=new T.InstancedMesh(geometry,material,capacity);mesh.name='build-'+name;mesh.instanceMatrix.setUsage(T.DynamicDrawUsage);mesh.count=0;mesh.visible=false;mesh.frustumCulled=false;mesh.renderOrder=6;scene.add(mesh);
  return {mesh:mesh,tint:tint,capacity:capacity,next:0,particles:[],colors:colors.map(function(c){return new T.Color(c);})};
 }
 var water=pool('water',new T.SphereGeometry(1,6,4),72,['#d9fff0','#a9eddf','#effff0']);
 var leaves=pool('leaves',leafGeometry,48,['#c1df65','#81bc43','#4c9951','#a3cd4d']);
 function queue(kind,x,z){
  if(disposed||!enabled||(kind!=='water'&&kind!=='leaves')||!Number.isFinite(x)||!Number.isFinite(z))return;
  if(pending.some(function(p){return p.kind===kind&&Math.hypot(p.x-x,p.z-z)<.25;}))return;
  if(pending.length>=6)pending.shift();pending.push({kind:kind,x:x,z:z});
 }
 function emit(request,field){
  var wet=request.kind==='water',p=wet?water:leaves,count=wet?12:7;
  var y=wet?-.015:Math.max(.02,field.sample(request.x,request.z).y+.28);
  for(var i=0;i<count;i++){
   var a=i*2.399963+Math.random()*.55,r=wet?.52+Math.random()*.23:.08+Math.random()*.18,speed=wet?.8+Math.random()*1.25:.55+Math.random()*.9;
   var index=p.next;p.next=(index+1)%p.capacity;var q=p.particles[index]||(p.particles[index]={});
   q.born=clock;q.life=wet?.72+Math.random()*.38:1.10+Math.random()*.48;q.x=request.x+Math.cos(a)*r;q.y=y;q.z=request.z+Math.sin(a)*r;
   q.vx=Math.cos(a)*speed;q.vz=Math.sin(a)*speed;q.vy=wet?1.7+Math.random()*1.25:1.2+Math.random()*.9;
   q.size=wet?.065+Math.random()*.045:.19+Math.random()*.12;q.angle=a;q.spin=(Math.random()-.5)*9;q.color=p.colors[i%p.colors.length];q.active=true;
  }
  total++;last={kind:request.kind,x:request.x,y:y,z:request.z};
 }
 function draw(p,wet){
  var count=0;
  p.particles.forEach(function(q){
   if(!q.active)return;var age=clock-q.born,t=age/q.life;if(t>=1){q.active=false;return;}
   var spread=wet?age:(1-Math.exp(-age*1.1))/1.1,gravity=wet?5.8:2.6;
   var y=q.y+q.vy*age-.5*gravity*age*age;if(wet&&y<-.065){q.active=false;return;}
   dummy.position.set(q.x+q.vx*spread,y,q.z+q.vz*spread);
   if(wet){direction.set(q.vx,q.vy-gravity*age,q.vz).normalize();dummy.quaternion.setFromUnitVectors(up,direction);}
   else{dummy.position.x+=Math.sin(age*8+q.angle)*.055*t;dummy.position.z+=Math.cos(age*7+q.angle)*.055*t;dummy.rotation.set(q.angle+age*q.spin,age*q.spin*.6,q.angle*.4+Math.sin(age*6)*.5);}
   var tail=Math.max(0,Math.min(1,(1-t)/.35)),size=q.size*(.6+.4*tail);
   dummy.scale.set(size,wet?size*(1.3+.6*(1-t)):size,size);dummy.updateMatrix();p.mesh.setMatrixAt(count,dummy.matrix);
   p.tint.setXYZW(count,q.color.r,q.color.g,q.color.b,(wet?.87:.96)*tail);count++;
  });
  p.mesh.count=count;p.mesh.visible=count>0;if(count){p.mesh.instanceMatrix.needsUpdate=true;p.tint.needsUpdate=true;}
 }
 function update(time,field,holdPending){if(disposed)return;clock=time;
  // Resolve land height after a rebuild, so leaves start above the newly raised grass.
  if(!holdPending){pending.forEach(function(p){emit(p,field);});pending.length=0;}draw(water,true);draw(leaves,false);
 }
 function clear(){pending.length=0;[water,leaves].forEach(function(p){p.particles.forEach(function(q){q.active=false;});p.mesh.count=0;p.mesh.visible=false;});}
 function summary(){return {water:water.mesh.count,leaves:leaves.mesh.count,pending:pending.length,bursts:total,last:last};}
 function dispose(){if(disposed)return;clear();disposed=true;[water,leaves].forEach(function(p){scene.remove(p.mesh);p.mesh.geometry.dispose();p.mesh.dispose();});material.dispose();}
 return {queue:queue,update:update,clear:clear,summary:summary,dispose:dispose,setEnabled:function(v){enabled=!!v;if(!enabled)clear();}};
}
var api={create:create};if(typeof module!=='undefined'&&module.exports)module.exports=api;else root.IslandFeedback=api;
})(typeof window!=='undefined'?window:this);
