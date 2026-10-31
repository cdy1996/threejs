/* Bundled: surface-details.js */
/* Physical grass caps and embedded cliff stones; deterministic, no image textures. */
(function(root){'use strict';
function build(T,field,cells,density,positions,slopes,indices,options){
 var top=[],col=[],mask=[],edges={},count=0,fringeCount=0,vertices=[],dark=new T.Color('#347d46'),light=new T.Color('#95c957');
 function color(p){if(p.tint)return p.tint;var x=p[0],z=p[2],n=Math.max(.04,Math.min(.96,.5+field.noise(x*.85,z*.85)*.59+field.noise(x*3.1+9,z*3.1-4)*.09));return p.tint=[dark.r+(light.r-dark.r)*n,dark.g+(light.g-dark.g)*n,dark.b+(light.b-dark.b)*n];}
 function random(x,z,s){var n=Math.sin(x*127.1+z*311.7+s*19.19)*43758.5453;return n-Math.floor(n);}
 function vertex(i){return vertices[i]||(vertices[i]={p:[positions[i*3],positions[i*3+1]+.18,positions[i*3+2]],m:mask[i]});}
 function tri(a,b,c,shade){[a,b,c].forEach(function(p){top.push(p[0],p[1],p[2]);var q=color(p);col.push(q[0]*shade,q[1]*shade,q[2]*shade);});}
 function tag(p){return p.key||(p.key=p[0].toFixed(5)+','+p[1].toFixed(5)+','+p[2].toFixed(5));}
 function edge(a,b){var ak=tag(a),bk=tag(b),k=ak<bk?ak+'|'+bk:bk+'|'+ak;if(edges[k])delete edges[k];else edges[k]=[a,b];}
 for(var i=0;i<positions.length/3;i++){var x=positions[i*3],y=positions[i*3+1],z=positions[i*3+2],c=cells[Math.round(x/field.step)+','+Math.round(z/field.step)];var n=field.noise(x*3,z*3);mask.push(density>0&&(!c||c.green)?Math.min(y-.40,.95+n*.25-slopes[i]):-1);}
 for(var i=0;i<indices.length;i+=3){var input=[vertex(indices[i]),vertex(indices[i+1]),vertex(indices[i+2])],poly=[];
  for(var j=0;j<3;j++){var a=input[j],b=input[(j+1)%3];if(a.m>=0)poly.push(a.p);if((a.m>=0)!==(b.m>=0)){var t=a.m/(a.m-b.m);poly.push(a.p.map(function(v,k){return v+(b.p[k]-v)*t;}));}}
  if(poly.length<3)continue;
  for(var j=1;j<poly.length-1;j++)tri(poly[0],poly[j],poly[j+1],1);
  for(var j=0;j<poly.length;j++)edge(poly[j],poly[(j+1)%poly.length]);
 }
 // Shared boundary normals give the thicker lip a continuous, slightly rounded overhang.
 var outward={};
 Object.keys(edges).forEach(function(k){var a=edges[k][0],b=edges[k][1],dx=b[0]-a[0],dz=b[2]-a[2];[a,b].forEach(function(p){var id=tag(p);if(!outward[id])outward[id]=[0,0];outward[id][0]-=dz;outward[id][1]+=dx;});});
 function offset(p,width,drop){var n=outward[tag(p)],len=Math.hypot(n[0],n[1])||1;return [p[0]+n[0]/len*width,p[1]-drop,p[2]+n[1]/len*width];}
 Object.keys(edges).forEach(function(k){
  var e=edges[k],a=e[0],b=e[1],wa=.075+field.noise(a[0]*3,a[2]*3)*.028,wb=.075+field.noise(b[0]*3,b[2]*3)*.028;
  var oa=offset(a,wa,.025),ob=offset(b,wb,.025),ba=offset(a,wa*.66,.28),bb=offset(b,wb*.66,.28);
  tri(a,b,ob,.97);tri(a,ob,oa,.97);tri(oa,ob,bb,.79);tri(oa,bb,ba,.79);count++;
  var x=(oa[0]+ob[0])*.5,y=(oa[1]+ob[1])*.5,z=(oa[2]+ob[2])*.5,dx=b[0]-a[0],dz=b[2]-a[2],len=Math.hypot(dx,dz);
  if((options&&options.fringe===false)||len<.025||random(x,z,1)>Math.min(.50,len*1.8)*Math.min(1,density*1.5))return;
  var nx=-dz/len,nz=dx/len,tx=dx/len,tz=dz/len;
  // Small folded blades flare outside the silhouette, with some drooping over the lip.
  for(var j=0;j<2;j++){
   var spread=(j-.5)*.075,reach=.12+random(x,z,j+3)*.23,w=.022+random(x,z,j+8)*.024,bend=(j-.5)*.48;
   var root=[x+tx*spread-nx*.025,y+.01,z+tz*spread-nz*.025],mid=[root[0]+nx*reach*.47+tx*bend*.14,y+.07+random(x,z,j+11)*.07,root[2]+nz*reach*.47+tz*bend*.14];
   var tip=[root[0]+nx*reach+tx*bend*.3,y-.035-random(x,z,j+18)*.12,root[2]+nz*reach+tz*bend*.3];
   var l=[root[0]+tx*w,root[1],root[2]+tz*w],r=[root[0]-tx*w,root[1],root[2]-tz*w];
   tri(l,tip,mid,1.04);tri(l,mid,root,.95);tri(root,mid,r,.82);tri(r,mid,tip,.89);
  }fringeCount++;
 });
 var geo=new T.BufferGeometry();geo.setAttribute('position',new T.Float32BufferAttribute(top,3));geo.setAttribute('color',new T.Float32BufferAttribute(col,3));geo.computeVertexNormals();geo.computeBoundingSphere();return {geometry:geo,rimEdges:count,fringeTufts:fringeCount};
}
root.IslandSurface={build:build};
})(typeof window!=='undefined'?window:this);
