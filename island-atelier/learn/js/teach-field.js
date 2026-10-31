/* Bundled: teach-field.js —— 教学复刻版
 * 与 island-atelier/js/terrain.js 使用完全相同的公式与运算顺序，
 * 仅额外开放两个开关，供第 4 步做「域扭曲 / 高斯模糊」对照实验：
 *   opts.warp  域扭曲振幅，默认 0.06（与 terrain.js 一致），传 0 即关闭
 *   opts.blur  高斯模糊开关，默认 true（与 terrain.js 一致）
 * 默认参数下与真实模块逐位一致，由 test-field.mjs 断言 parity。
 * 同时导出单格距离场 cellDistance / smin / smooth，供第 2、3 步实验。
 */
(function(root){
'use strict';
var STEP=1.325,SEA=-.07;
function clamp(x,a,b){return Math.max(a,Math.min(b,x));}
function smooth(a,b,x){var t=clamp((x-a)/(b-a),0,1);return t*t*(3-2*t);}
function smin(a,b,k){var h=Math.max(k-Math.abs(a-b),0)/k;return Math.min(a,b)-h*h*k*.25;}
function noise(x,z,seed){return Math.sin(x*1.37+z*.77+seed)*Math.cos(z*1.11-x*.49+seed*.3)*.6+Math.sin(x*3.7-z*2.9+seed)*.16;}
/* 单个格子的圆角盒距离场：terrain.js:23-24 的同款公式抽出来复用。
 * core 是半边扣除圆角的内核半宽，radius 是圆角半径，core+radius 即「面距」。 */
function cellDistance(x,z,cx,cz,core,radius){
 var qx=Math.abs(x-cx)-core,qz=Math.abs(z-cz)-core;
 return Math.sqrt(Math.max(qx,0)*Math.max(qx,0)+Math.max(qz,0)*Math.max(qz,0))+Math.min(Math.max(qx,qz),0)-radius;
}
function create(cells,seed,opts){
 opts=opts||{};
 var warp=opts.warp===undefined?.06:opts.warp;
 var blur=opts.blur===undefined?true:!!opts.blur;
 var all=Object.keys(cells).sort().map(function(k){return cells[k];});
 var max=all.reduce(function(h,c){return Math.max(h,c.h);},0);
 // Only nearby cells can affect a sample. Keep the original sorted order inside
 // each bucket so smooth-union results are identical to the full scan.
 var buckets={},bucketSize=STEP*2;
 all.forEach(function(c){for(var bz=Math.floor((c.z*STEP-2.4)/bucketSize);bz<=Math.floor((c.z*STEP+2.4)/bucketSize);bz++)for(var bx=Math.floor((c.x*STEP-2.4)/bucketSize);bx<=Math.floor((c.x*STEP+2.4)/bucketSize);bx++){var key=bx+','+bz;(buckets[key]||(buckets[key]=[])).push(c);}});
 function rawDistances(x,z){
  var out=[9,9,9,9,9,9,9,9];
  // Domain warp moves an entire contour, including shared edges, coherently.
  var wx=x+noise(x*.65,z*.65,seed)*warp,wz=z+noise(z*.71,x*.71,seed+17)*warp;
  var nearby=buckets[Math.floor(wx/bucketSize)+','+Math.floor(wz/bucketSize)]||[];
  for(var i=0;i<nearby.length;i++){
   var c=nearby[i],core=STEP*.5-.31,qx=Math.abs(wx-c.x*STEP)-core,qz=Math.abs(wz-c.z*STEP)-core;
   var d=Math.sqrt(Math.max(qx,0)*Math.max(qx,0)+Math.max(qz,0)*Math.max(qz,0))+Math.min(Math.max(qx,qz),0)-.44;
   if(d>1.5)continue;
   for(var l=0;l<c.h;l++)out[l]=smin(out[l],d,.72);
  }
  return out;
 }
 // Smooth the shared scalar layers, not separate cell meshes. A separable
 // Gaussian filter rounds both outward coast bumps and inward bay corners.
 var RES=96,EXT=10.8,spacing=EXT*2/RES,layers=[],stride=RES+1;
 for(var l=0;l<max;l++)layers.push(new Float32Array(stride*stride));
 for(var j=0;j<=RES;j++)for(var i=0;i<=RES;i++){
  var d=rawDistances(-EXT+i*spacing,-EXT+j*spacing);
  for(var l=0;l<max;l++)layers[l][j*stride+i]=d[l];
 }
 var kernel=[1,4,6,4,1];
 if(blur){
  for(var l=0;l<max;l++){
   var src=layers[l],temp=new Float32Array(src.length),out=new Float32Array(src.length);
   for(var j=0;j<=RES;j++)for(var i=0;i<=RES;i++){var v=0;for(var k=-2;k<=2;k++)v+=src[j*stride+clamp(i+k,0,RES)]*kernel[k+2];temp[j*stride+i]=v/16;}
   for(var j=0;j<=RES;j++)for(var i=0;i<=RES;i++){var v=0;for(var k=-2;k<=2;k++)v+=temp[clamp(j+k,0,RES)*stride+i]*kernel[k+2];out[j*stride+i]=v/16;}
   layers[l]=out;
  }
 }
 function distances(x,z){
  var fx=clamp((x+EXT)/spacing,0,RES-.001),fz=clamp((z+EXT)/spacing,0,RES-.001),i=Math.floor(fx),j=Math.floor(fz),tx=fx-i,tz=fz-j,result=[9,9,9,9,9,9,9,9];
  for(var l=0;l<max;l++){var a=layers[l],k=j*stride+i;result[l]=(a[k]*(1-tx)+a[k+1]*tx)*(1-tz)+(a[k+stride]*(1-tx)+a[k+stride+1]*tx)*tz;}
  return result;
 }
 function sample(x,z){
  var d=distances(x,z),y=-1.1;
  if(max){y+=1.34*(1-smooth(-.13,.65,d[0]));
   for(var l=1;l<max;l++)y+=.86*(1-smooth(-.24,.23,d[l]));
  }
  return {y:y,shore:d[0],distance:d};
 }
 function height(x,z){
  var fx=clamp((x+EXT)/spacing,0,RES-.001),fz=clamp((z+EXT)/spacing,0,RES-.001),i=Math.floor(fx),j=Math.floor(fz),tx=fx-i,tz=fz-j,k=j*stride+i,y=-1.1;
  for(var l=0;l<max;l++){var a=layers[l],d=(a[k]*(1-tx)+a[k+1]*tx)*(1-tz)+(a[k+stride]*(1-tx)+a[k+stride+1]*tx)*tz;y+=(l===0?1.34:.86)*(1-smooth(l===0?-.13:-.24,l===0?.65:.23,d));}return y;
 }
 function surface(x,z){var p=sample(x,z),e=.065,dx=(height(x+e,z)-height(x-e,z))/(2*e),dz=(height(x,z+e)-height(x,z-e))/(2*e);p.slope=Math.sqrt(dx*dx+dz*dz);return p;}
 function biome(p,x,z){
  if(p.y<SEA)return 'water';
  if(p.y<.48)return 'sand';
  return p.slope<.8?'meadow':'cliff';
 }
 return {sample:sample,height:height,surface:surface,biome:biome,all:all,max:max,step:STEP,noise:function(x,z){return noise(x,z,seed);}};
}
var api={create:create,cellDistance:cellDistance,smin:smin,smooth:smooth,noise:noise,step:STEP,sea:SEA};
if(typeof module!=='undefined'&&module.exports)module.exports=api;else root.IslandTeachField=api;
})(typeof window!=='undefined'?window:this);
