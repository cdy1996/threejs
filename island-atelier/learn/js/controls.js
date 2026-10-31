/* Bundled: controls.js */
/* Pointer gestures: single-finger editing, two-finger navigation, no browser zoom. */
(function(root){'use strict';
function create(canvas,handlers){
 var points={},single=null,multi=false,previous=null;
 function copy(e){return {pointerId:e.pointerId,pointerType:e.pointerType||'mouse',clientX:e.clientX,clientY:e.clientY,button:e.button||0,altKey:!!e.altKey};}
 function touchPoints(){return Object.keys(points).map(function(k){return points[k];}).filter(function(p){return p.pointerType==='touch';});}
 function measure(){var p=touchPoints();if(p.length<2)return null;var a=p[0],b=p[1];return {x:(a.clientX+b.clientX)/2,y:(a.clientY+b.clientY)/2,d:Math.hypot(b.clientX-a.clientX,b.clientY-a.clientY),a:Math.atan2(b.clientY-a.clientY,b.clientX-a.clientX)};}
 function down(e){
  if(e.button!==0&&e.button!==2)return;e.preventDefault();var p=copy(e);
  if(single&&single.start.pointerType==='mouse'&&p.pointerType==='mouse'&&single.start.pointerId===p.pointerId)end(e,false,true);
  if(single&&single.start.pointerType!=='touch')return;
  if(p.pointerType!=='touch'&&(single||multi))return;
  points[p.pointerId]=p;try{canvas.setPointerCapture(p.pointerId);}catch(ignore){}
  if(p.pointerType==='touch'){
   if(touchPoints().length>=2){handlers.cancel();single=null;multi=true;previous=measure();return;}
   if(multi)return;
   // Delay a touch edit until movement or release, allowing the second finger to arrive.
   single={start:p,started:false};if(handlers.preview)handlers.preview(p);return;
  }
  single={start:p,started:true};handlers.start(p);
 }
 function move(e){
  var p=copy(e);if(!points[p.pointerId]){if(p.pointerType!=='touch'&&!single&&!multi)handlers.hover(p);return;}
  // Recover a release missed outside the canvas or while capture was unavailable.
  if(single&&p.pointerType==='mouse'&&typeof e.buttons==='number'&&!(e.buttons&(single.start.button===2?2:1))){end(e,false,true);return;}
  points[p.pointerId]=p;e.preventDefault();
  if(multi){var current=measure();if(current&&previous&&current.d>12&&previous.d>12){var angle=current.a-previous.a;handlers.view({dx:current.x-previous.x,dy:current.y-previous.y,scale:current.d/previous.d,twist:Math.atan2(Math.sin(angle),Math.cos(angle))});}previous=current;return;}
  if(!single||single.start.pointerId!==p.pointerId)return;
  if(!single.started){if(Math.hypot(p.clientX-single.start.clientX,p.clientY-single.start.clientY)<8)return;single.started=true;handlers.start(single.start);}
  handlers.move(p);
 }
 function end(e,cancel,useLast){
  var p=points[e.pointerId];if(!p)return;e.preventDefault();delete points[e.pointerId];
  if(multi){previous=measure();if(!Object.keys(points).length){multi=false;previous=null;}return;}
  if(single&&single.start.pointerId===e.pointerId){var current=single;single=null;if(cancel){handlers.cancel();}else{if(!current.started)handlers.start(current.start);var last=useLast?p:copy(e);if(current.started)handlers.move(last);handlers.end(last);}}
 }
 function interrupted(e){
  var p=points[e.pointerId];if(!p)return;
  // Capture loss is not an undo request. Mouse interruption keeps the last
  // painted point; lost/cancel events can carry zero or unrelated coordinates.
  end(e,p.pointerType!=='mouse',true);
 }
 function reset(){var ids=Object.keys(points);points={};single=null;multi=false;previous=null;handlers.cancel();ids.forEach(function(id){try{if(canvas.hasPointerCapture(Number(id)))canvas.releasePointerCapture(Number(id));}catch(ignore){}});}
 canvas.addEventListener('pointerdown',down);
 canvas.addEventListener('pointermove',move);
 canvas.addEventListener('pointerup',function(e){end(e,false);});
 canvas.addEventListener('pointercancel',interrupted);
 canvas.addEventListener('lostpointercapture',interrupted);
 // Capture can fail in embedded browsers. Observe only an already-owned mouse
 // gesture; ordinary document clicks never start or place anything on the island.
 var eventRoot=canvas.ownerDocument;
 if(eventRoot){
  eventRoot.addEventListener('pointermove',function(e){var p=points[e.pointerId];if(e.target!==canvas&&p&&p.pointerType==='mouse')move(e);});
  eventRoot.addEventListener('pointerup',function(e){var p=points[e.pointerId];if(p&&p.pointerType==='mouse')end(e,false);});
 }
 return {reset:reset};
}
var api={create:create};if(typeof module!=='undefined'&&module.exports)module.exports=api;else root.IslandControls=api;
})(typeof window!=='undefined'?window:this);
