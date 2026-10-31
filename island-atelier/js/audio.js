/* Bundled: audio.js */
/* Local audio (credits in audio/ORIGIN.md); gesture start and background pause. */
(function(root){'use strict';
function create(options){
 options=options||{};var env=options.env||root,doc=env.document,storage=env.IslandStorage||{getItem:function(k){return env.localStorage.getItem(k);},setItem:function(k,v){env.localStorage.setItem(k,v);}},storageKey='island-atelier-audio-v1',bufferFactory=null;
 var prefs={muted:false,music:true,sfx:true,musicVolume:.55,sfxVolume:.65};
 if(options.persist!==false)try{var saved=JSON.parse(storage.getItem(storageKey));if(saved){['muted','music','sfx'].forEach(function(k){if(typeof saved[k]==='boolean')prefs[k]=saved[k];});['musicVolume','sfxVolume'].forEach(function(k){if(Number.isFinite(saved[k]))prefs[k]=Math.max(0,Math.min(1,saved[k]));});}}catch(e){}
 var music=null,voices=[],context=null,musicGain=null,sfxGain=null,limiter=null,unlocked=false,blocked=false,failed=false,lastSound=-Infinity,played=0,lastKind='',disposed=false;
 var ambient=null,ambientGain=null,ambientKind='',ambientLevel=.45,ambientSerial=0,ambientPlayed=0,ambientLast='',ambientGap=0;
 var ambientCounts={birds:0,waterfall:0},ambientWait={birds:0,waterfall:0},random=options.random||Math.random;
 var files={raise:'raise.wav',lower:'lower.wav',plant:'plant.wav',birds:'seagull.wav',boat:'boat-bubbles.wav',waterfall:'water-flow.wav'};
 function state(){return {unlocked:unlocked,muted:prefs.muted,music:prefs.music,sfx:prefs.sfx,musicVolume:prefs.musicVolume,sfxVolume:prefs.sfxVolume,musicPlaying:!!(music&&!music.paused&&!doc.hidden&&!prefs.muted&&prefs.music),blocked:blocked,failed:failed,played:played,lastSound:lastKind,ambient:{birds:ambientCounts.birds,waterfalls:ambientCounts.waterfall,playing:!!(ambient&&!ambient.paused&&!ambient.ended),played:ambientPlayed,lastSound:ambientLast}};}
 function changed(){if(options.onChange)options.onChange(state());}
 function store(){if(options.persist!==false)try{var result=storage.setItem(storageKey,JSON.stringify(prefs));if(result&&result.then)result.then(function(ok){if(!ok){failed=true;changed();}});}catch(e){failed=true;}changed();}
 function element(name){var a=bufferFactory?bufferFactory.element():doc.createElement('audio');a.preload='none';a.setAttribute('playsinline','');a.setAttribute('aria-hidden','true');a.hidden=true;a.setAttribute('data-island-audio',name);if(!a.isBufferVoice)doc.body.appendChild(a);return a;}
 function link(a,bus){if(a.isBufferVoice){a.connect(context?bus:null);return;}if(context){context.createMediaElementSource(a).connect(bus);a.volume=1;}else a.volume=bus==='music'?prefs.musicVolume:prefs.sfxVolume;}
 function init(){
  if(music||disposed)return;
  try{var AC=env.AudioContext||env.webkitAudioContext;if(AC){context=new AC();musicGain=context.createGain();sfxGain=context.createGain();ambientGain=context.createGain();musicGain.gain.value=0;sfxGain.gain.value=prefs.sfxVolume;ambientGain.gain.value=prefs.sfxVolume*ambientLevel;limiter=context.createDynamicsCompressor();limiter.threshold.value=-10;limiter.knee.value=12;limiter.ratio.value=4;limiter.attack.value=.006;limiter.release.value=.15;musicGain.connect(limiter);sfxGain.connect(limiter);ambientGain.connect(limiter);limiter.connect(context.destination);}}catch(e){context=null;}
  if(env.IslandAudioBuffers&&env.ISLAND_AUDIO_ASSETS)bufferFactory=env.IslandAudioBuffers.createFactory(context,env.ISLAND_AUDIO_ASSETS);
  music=element('music');music.src='./audio/island-breeze.m4a';music.loop=true;music.preload='auto';link(music,context?musicGain:'music');
  music.addEventListener('error',function(){failed=true;changed();});music.addEventListener('playing',function(){blocked=false;failed=false;changed();});music.addEventListener('pause',changed);
  for(var i=0;i<4;i++){var a=element('effect');a.preload='auto';link(a,context?sfxGain:'sfx');voices.push(a);}
 }
 function gain(node,value){if(!node)return;var t=context.currentTime;node.gain.cancelScheduledValues(t);node.gain.setTargetAtTime(value,t,.12);}
 function volumes(){if(context){gain(musicGain,prefs.muted||!prefs.music?0:prefs.musicVolume);gain(sfxGain,prefs.muted||!prefs.sfx?0:prefs.sfxVolume);gain(ambientGain,prefs.muted||!prefs.sfx?0:prefs.sfxVolume*ambientLevel);}else{if(music)music.volume=prefs.muted?0:prefs.musicVolume;voices.forEach(function(a){a.volume=prefs.muted?0:prefs.sfxVolume;});if(ambient)ambient.volume=prefs.muted||!prefs.sfx?0:prefs.sfxVolume*ambientLevel;}}
 function interval(kind){return kind==='birds'?7+random()*8:10+random()*9;}
 function stopAmbient(){ambientSerial++;if(ambient)ambient.pause();ambientKind='';}
 function resetAmbience(){Object.keys(ambientWait).forEach(function(k){ambientWait[k]=interval(k);});ambientGap=3;}
 function effectsOff(){voices.forEach(function(a){a.pause();});stopAmbient();resetAmbience();}
 function playMusic(){
  if(!music||!unlocked||doc.hidden||prefs.muted||!prefs.music||prefs.musicVolume===0||disposed)return;
  if(!music.paused)return;
  var promise=music.play();if(promise&&promise.then)promise.then(function(){if(doc.hidden||prefs.muted||!prefs.music||disposed)music.pause();blocked=false;changed();}).catch(function(){blocked=true;changed();});
 }
 function unlock(){
  if(disposed||doc.hidden)return;init();unlocked=true;blocked=false;
  if(context&&context.state!=='running'){var resumed=context.resume();if(resumed&&resumed.catch)resumed.catch(function(){blocked=true;changed();});}
  volumes();playMusic();changed();
 }
 function sound(kind){
  if(!files[kind]||prefs.muted||!prefs.sfx||prefs.sfxVolume===0||doc.hidden||disposed)return;
  var now=env.performance.now();if(now-lastSound<85)return;lastSound=now;unlock();
  // Foreground actions take priority over the occasional background calls.
  stopAmbient();ambientGap=3;if(ambientCounts[kind])ambientWait[kind]=interval(kind);
  var a=voices.filter(function(v){return v.paused||v.ended;})[0]||voices[played%voices.length];a.pause();
  if(a.getAttribute('data-kind')!==kind){a.src='./audio/'+files[kind];a.setAttribute('data-kind',kind);}else try{a.currentTime=0;}catch(e){}
  a.playbackRate=.96+Math.random()*.08;a.preservesPitch=false;a.webkitPreservesPitch=false;
  var promise=a.play();if(promise&&promise.catch)promise.catch(function(){blocked=true;changed();});played++;lastKind=kind;changed();
 }
 function ambienceAllowed(){return unlocked&&!disposed&&!doc.hidden&&!prefs.muted&&prefs.sfx&&prefs.sfxVolume>0&&!blocked&&(!context||context.state==='running');}
 function playAmbient(kind){
  if(!ambient){ambient=element('ambience');ambient.preload='auto';link(ambient,context?ambientGain:'sfx');ambient.addEventListener('ended',changed);}
  stopAmbient();ambientKind=kind;ambientLevel=kind==='birds'?.48:.40;
  if(ambient.getAttribute('data-kind')!==kind){ambient.src='./audio/'+files[kind];ambient.setAttribute('data-kind',kind);}else try{ambient.currentTime=0;}catch(e){}
  ambient.playbackRate=.93+random()*.12;ambient.preservesPitch=false;ambient.webkitPreservesPitch=false;volumes();
  var token=ambientSerial,promise=ambient.play();
  if(promise&&promise.then)promise.then(function(){if(token!==ambientSerial)return;if(!ambienceAllowed()||!ambientCounts[kind])stopAmbient();changed();}).catch(function(){if(token!==ambientSerial)return;blocked=true;changed();});
  ambientPlayed++;ambientLast=kind;ambientWait[kind]=interval(kind);ambientGap=4+random()*2;changed();
 }
 function updateAmbience(records,dt){
  if(disposed)return;
  var counts={birds:0,waterfall:0},sourcesChanged=false;
  (records||[]).forEach(function(r){if(r&&r.active!==false&&Object.prototype.hasOwnProperty.call(counts,r.kind))counts[r.kind]++;});
  Object.keys(counts).forEach(function(kind){if(counts[kind]!==ambientCounts[kind])sourcesChanged=true;if(!ambientCounts[kind]&&counts[kind])ambientWait[kind]=interval(kind);if(!counts[kind])ambientWait[kind]=0;});
  ambientCounts=counts;if(ambientKind&&!counts[ambientKind])stopAmbient();if(sourcesChanged)changed();
  if(!ambienceAllowed())return;
  // Run on the visible scene clock: no timers or catch-up bursts after returning.
  dt=Math.max(0,Math.min(.1,Number(dt)||0));ambientGap=Math.max(0,ambientGap-dt);
  Object.keys(counts).forEach(function(k){if(counts[k])ambientWait[k]-=dt;});
  if(ambientGap>0||(ambient&&!ambient.paused&&!ambient.ended)||env.performance.now()-lastSound<1800)return;
  var due=Object.keys(counts).filter(function(k){return counts[k]&&ambientWait[k]<=0;});
  due.sort(function(a,b){return ambientWait[a]-ambientWait[b];});if(due.length)playAmbient(due[0]);
 }
 function set(key,value){if(!(key in prefs))return;if(key==='musicVolume'||key==='sfxVolume')prefs[key]=Math.max(0,Math.min(1,Number(value)||0));else prefs[key]=!!value;
  volumes();if(music&&(prefs.muted||!prefs.music||prefs.musicVolume===0))music.pause();if(prefs.muted||!prefs.sfx||prefs.sfxVolume===0)effectsOff();if(unlocked)playMusic();store();
 }
 function suspend(){if(music)music.pause();effectsOff();if(context&&context.state==='running'){var p=context.suspend();if(p&&p.catch)p.catch(function(){});}changed();}
 function visibility(){if(doc.hidden)suspend();else if(unlocked)unlock();}
 function dispose(){disposed=true;suspend();doc.removeEventListener('visibilitychange',visibility);[music,ambient].concat(voices).forEach(function(a){if(a){a.removeAttribute('src');a.load();a.remove();}});if(context){var p=context.close();if(p&&p.catch)p.catch(function(){});}}
 doc.addEventListener('visibilitychange',visibility);changed();
 return {unlock:unlock,sound:sound,set:set,state:state,updateAmbience:updateAmbience,suspend:suspend,dispose:dispose};
}
var api={create:create};if(typeof module!=='undefined'&&module.exports)module.exports=api;else root.IslandAudio=api;
})(typeof window!=='undefined'?window:this);
