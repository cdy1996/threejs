/* Bundled: boat-navigation.js */
/* Safe sea routes; independent of rendering and saved placement coordinates. */
(function(root){'use strict';
function hull(points){
 points.sort(function(a,b){return a.x-b.x||a.z-b.z;});
 function cross(a,b,c){return (b.x-a.x)*(c.z-a.z)-(b.z-a.z)*(c.x-a.x);}
 var lower=[],upper=[];points.forEach(function(p){while(lower.length>1&&cross(lower[lower.length-2],lower[lower.length-1],p)<=0)lower.pop();lower.push(p);});
 points.slice().reverse().forEach(function(p){while(upper.length>1&&cross(upper[upper.length-2],upper[upper.length-1],p)<=0)upper.pop();upper.push(p);});lower.pop();upper.pop();return lower.concat(upper);
}
function create(field,rocks,canFloat){
 rocks=rocks||[];
 function safe(x,z){return Math.abs(x)<=16&&Math.abs(z)<=16&&canFloat(field,x,z,rocks);}
 function segment(a,b){var count=Math.max(1,Math.ceil(Math.hypot(a.x-b.x,a.z-b.z)/.16));for(var i=0;i<=count;i++){var t=i/count;if(!safe(a.x+(b.x-a.x)*t,a.z+(b.z-a.z)*t))return false;}return true;}
 var route=[],land=field.all||[];
 if(land.length){
  for(var margin=2.15;margin<=3.4;margin+=.4){
   var cloud=[];land.forEach(function(c){for(var i=0;i<24;i++){var a=i*Math.PI/12;cloud.push({x:c.x*field.step+Math.cos(a)*margin,z:c.z*field.step+Math.sin(a)*margin});}});
   rocks.forEach(function(r){for(var i=0;i<24;i++){var a=i*Math.PI/12;cloud.push({x:r.x+Math.cos(a)*(r.r+1.15),z:r.z+Math.sin(a)*(r.r+1.15)});}});
   var outline=hull(cloud);route=[];outline.forEach(function(a,i){var b=outline[(i+1)%outline.length],steps=Math.ceil(Math.hypot(a.x-b.x,a.z-b.z)/.35);for(var j=0;j<steps;j++)route.push({x:a.x+(b.x-a.x)*j/steps,z:a.z+(b.z-a.z)*j/steps});});
   if(route.every(function(p,i){return segment(p,route[(i+1)%route.length]);}))break;route=[];
  }
 }
 function nearestSea(p){if(safe(p.x,p.z))return {x:p.x,z:p.z};for(var radius=.3;radius<35;radius+=.3)for(var i=0;i<48;i++){var a=i*Math.PI/24,x=p.x+Math.cos(a)*radius,z=p.z+Math.sin(a)*radius;if(safe(x,z))return {x:x,z:z};}return null;}
 // Grid search is only used when a direct connection to the offshore loop is obstructed.
 var GRID=65,STEP=.5,cache={};
 function point(id){return {x:(id%GRID)*STEP-16,z:Math.floor(id/GRID)*STEP-16};}
 function clear(id){if(cache[id]===undefined){var p=point(id);cache[id]=safe(p.x,p.z);}return cache[id];}
 function join(start,end){
  if(segment(start,end))return [end];
  function nearby(p){var out=[],ix=Math.round((p.x+16)/STEP),iz=Math.round((p.z+16)/STEP);for(var z=Math.max(0,iz-2);z<=Math.min(GRID-1,iz+2);z++)for(var x=Math.max(0,ix-2);x<=Math.min(GRID-1,ix+2);x++){var id=z*GRID+x,q=point(id);if(clear(id)&&segment(p,q))out.push(id);}return out;}
  var starts=nearby(start),goals=nearby(end),goalSet={},parents={},queue=[],head=0,found=-1;
  goals.forEach(function(id){goalSet[id]=true;});starts.forEach(function(id){parents[id]=-1;queue.push(id);});
  while(head<queue.length){var id=queue[head++];if(goalSet[id]){found=id;break;}var x=id%GRID,z=Math.floor(id/GRID);
   [[1,0],[-1,0],[0,1],[0,-1],[1,1],[-1,1],[1,-1],[-1,-1]].forEach(function(d){var nx=x+d[0],nz=z+d[1],next=nz*GRID+nx;if(nx<0||nx>=GRID||nz<0||nz>=GRID||parents[next]!==undefined||!clear(next))return;if(!segment(point(id),point(next)))return;parents[next]=id;queue.push(next);});
  }
  if(found<0)return [];var reverse=[];while(found!==-1){reverse.push(point(found));found=parents[found];}var path=reverse.reverse().concat([end]),result=[],from=start;
  for(var i=0;i<path.length;){var far=i;for(var j=path.length-1;j>i;j--)if(segment(from,path[j])){far=j;break;}result.push(path[far]);from=path[far];i=far+1;}return result;
 }
 function course(start,direction){
  var loop=route;
  if(!loop.length){var cx=Math.max(-14,Math.min(14,start.x)),cz=Math.max(-14,Math.min(14,start.z));loop=[];for(var i=0;i<32;i++){var a=i*Math.PI/16;loop.push({x:cx+Math.cos(a)*1.35,z:cz+Math.sin(a)*1.35});}if(!loop.every(function(p,i){return segment(p,loop[(i+1)%loop.length]);}))return null;}
  var closest=0;loop.forEach(function(p,i){if(Math.hypot(p.x-start.x,p.z-start.z)<Math.hypot(loop[closest].x-start.x,loop[closest].z-start.z))closest=i;});
  var approach=join(start,loop[closest]);if(!approach.length)return null;
  var ordered=[];for(var i=1;i<=loop.length;i++)ordered.push(loop[(closest+direction*i+loop.length)%loop.length]);return {approach:approach,loop:ordered};
 }
 return {safe:safe,segment:segment,course:course,nearestSea:nearestSea,route:route};
}
var api={create:create};if(typeof module!=='undefined'&&module.exports)module.exports=api;else root.IslandBoatNavigation=api;
})(typeof window!=='undefined'?window:this);
