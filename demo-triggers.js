(function () {
  if (window.Air2DemoTriggers && window.Air2DemoTriggers.version === 26) return;
  var CAP = 6.09;
  var BASE_FLOW = 0.002 * 28.3495;
  var DEMO_MILK_ACCEL = 14;
  var LETDOWN_STEP_MS = 650;
  var SWITCH_CONFIRM_MS = 1200;
  var END_CONFIRM_MS = 1200;
  var toastCopy = 'There was a slight air leak during your last pumping session. We automatically compensated for it. Next time, please check the fit before pumping. See you next time.';
  var fitTimers = [];
  var triggers = [
    ['air-leak','Air leak',true,'air-leak'],
    ['fit-ok','Wearing OK',true,'air-leak'],
    ['minor-leak','Minor leak',false,'air-leak'],
    ['letdown-start','Let-down starts',true,'letdown'],
    ['letdown-end','Let-down ends',true,'letdown'],
    ['low-battery','Low battery',false,'battery'],
    ['critical-battery','Critical low battery',true,'battery']
  ];
  function st(){ return (typeof state !== 'undefined') ? state : (window.state || null); }
  function clearFit(){ for(var i=0;i<fitTimers.length;i++) clearTimeout(fitTimers[i]); fitTimers=[]; }
  function paint(){ if(typeof window.v4View==='function') window.v4View(); else if(typeof window.view==='function') window.view(); sync(); }
  function notify(s,k,t,persist){ s.controlNotice={kind:k,text:t,id:Date.now(),persistent:!!persist}; if(!persist){ setTimeout(function(){ if(s.controlNotice&&s.controlNotice.id&&s.controlNotice.kind===k){ s.controlNotice=null; paint(); } },5000); } }
  function isActive(s){ return !!(s && s.running && !s.modal); }
  function ignored(s,id){ s.lastIgnoredTrigger=id+' requires active pumping'; sync(); return false; }
  function beginSession(s){ s.page='control'; s.modal=null; s.running=true; s.paused=false; s.timer=0; s.milkL=0; s.milkR=0; s.mode='stimulation'; s.letdownPhase='baseline'; s.flowRate=BASE_FLOW; s.flowKind='low'; s.air2LastPhysicsAt=Date.now(); s.air2SessionEnded=false; s.controlNotice=null; if(window.air2DemoRun) window.air2DemoRun={prompted:false,autoMoved:false,finishing:false,lastMilkTick:0}; }
  function nextPhase(s){ var seq=s.rhythmSequence||['stimulation','expression','stimulation','expression']; var idx=isFinite(Number(s.rhythmIndex))?Number(s.rhythmIndex):1; s.rhythmSequence=seq; s.rhythmIndex=Math.min(seq.length-1,idx+1); s.mode=seq[s.rhythmIndex]||'stimulation'; }
  function resetBasePlan(s){ s.mode='stimulation'; s.selectedProgram=null; s.rhythmIndex=0; s.rhythmSequence=['stimulation','expression','stimulation','expression']; s.letdownPhase='baseline'; s.letdownEventAt=null; s.letdownStableSince=null; s.noMilkSince=null; s.letdownSuggestionShown=false; s.manualEndSuggestionShown=false; s.flowRate=BASE_FLOW; s.flowKind='low'; }
  function captureSession(s){ var total; s.hasLogged=true; s.lastSessionL=Number(s.milkL)||0; s.lastSessionR=Number(s.milkR)||0; total=Math.round((s.lastSessionL+s.lastSessionR)*100)/100; s.lastSessionTotal=total; if(!Array.isArray(s.air2SessionHistory)) s.air2SessionHistory=[]; s.air2SessionHistory.push({id:'session-'+Date.now(),left:s.lastSessionL,right:s.lastSessionR,total:total}); }
  function settle(s,msg){ captureSession(s); resetBasePlan(s); s.running=false; s.paused=false; s.modal='log'; s.air2SessionEnded=true; s.air2AutoSubmitPending=true; s.air2AutoSubmitCancelled=false; if(msg) notify(s,'ending',msg,false); }
  function flowNow(s){
    var age, step;
    if(!s) return BASE_FLOW;
    if(s.letdownPhase==='rising'){
      age=Math.max(0,Date.now()-(s.letdownEventAt||Date.now()));
      step=Math.floor(age/LETDOWN_STEP_MS);
      return Math.min(.005,.001+step*.001) * 28.3495;
    }
    if(s.letdownPhase==='active') return .006 * 28.3495;
    if(s.letdownPhase==='falling'){
      age=Math.max(0,Date.now()-(s.letdownEventAt||Date.now()));
      step=Math.floor(age/LETDOWN_STEP_MS);
      return Math.max(.0005,.006-step*.001) * 28.3495;
    }
    if(s.letdownPhase==='ended') return .0005 * 28.3495;
    return BASE_FLOW;
  }
  function physics(){ var s=st(), now=Date.now(), flow, elapsed, add; if(!s||!s.running||s.paused) return; flow=flowNow(s); s.flowRate=Math.round(flow*1000)/1000; s.flowKind=flow<=0?'none':(flow<.003*28.3495?'low':(flow<.005*28.3495?'medium':'high')); elapsed=Math.max(.25,Math.min(2,(now-(s.air2LastPhysicsAt||now))/1000)); s.air2LastPhysicsAt=now; add=(flow/28.3495)*elapsed*DEMO_MILK_ACCEL; s.milkL=Math.min(CAP,Math.round(((Number(s.milkL)||0)+add*.98)*1000)/1000); s.milkR=Math.min(CAP,Math.round(((Number(s.milkR)||0)+add*1.02)*1000)/1000);
    if(s.letdownPhase==='rising'&&flow>=.005*28.3495){ if(!s.letdownStableSince) s.letdownStableSince=now; if(now-s.letdownStableSince>=SWITCH_CONFIRM_MS){ s.letdownPhase='active'; if(s.selectedProgram){ s.mode='expression'; s.rhythmIndex=Math.max(1,Number(s.rhythmIndex)||1); notify(s,'auto','Let-down detected. Moving into the Expression phase.',false); } else if(s.auto){ s.mode='expression'; notify(s,'auto','Let-down detected. Switched to Expression mode.',false); } else if(!s.letdownSuggestionShown){ s.letdownSuggestionShown=true; notify(s,'suggestion','Let-down detected. You can switch to Expression when you are ready.',false); } } }
    if(s.letdownPhase==='falling'&&flow<=.001*28.3495){ if(!s.noMilkSince) s.noMilkSince=now; if(now-s.noMilkSince>=END_CONFIRM_MS){ s.letdownPhase='ended'; if(s.selectedProgram&&s.auto){ nextPhase(s); notify(s,'ending','Let-down has eased. Moving to the next program phase.',false); } else if(s.auto){ settle(s,'Let-down has ended. This pumping session is complete.'); } else if(!s.manualEndSuggestionShown){ s.manualEndSuggestionShown=true; notify(s,'suggestion','Milk flow has slowed. You can finish pumping when you are ready.',false); } } }
    if(s.milkL>=CAP||s.milkR>=CAP){ s.milkL=CAP; s.milkR=CAP; settle(s,'Milk level is high. Pumping stopped automatically to prevent overflow.'); }
  }
  function install(){
    window.v4RunFit = v4RunFit = function(){ var s=st(); if(!s) return; clearFit(); s.page='control'; s.modal='fit'; s.running=false; s.paused=false; s.fitStage=0; s.fitAdjust=true; paint(); fitTimers.push(setTimeout(function(){s.fitStage=1;paint();},360)); fitTimers.push(setTimeout(function(){s.fitStage=2;s.fitAdjust=true;paint();},980)); };
    window.air2FlowAt=function(){ return flowNow(st()); };
    window.air2PaintRun=physics;
  }
  function fitOk(){ var s=st(); if(!s) return false; if(s.modal==='fit'){ clearFit(); s.fitAdjust=false; s.fitStage=3; paint(); fitTimers.push(setTimeout(function(){s.fitStage=4;paint();},650)); fitTimers.push(setTimeout(function(){s.fitStage=5;paint();},1300)); fitTimers.push(setTimeout(function(){s.fitStage=6;paint();},1900)); fitTimers.push(setTimeout(function(){beginSession(s);paint();},2500)); return true; } if(s.paused&&(s.severeLeak||s.leakAdjusting)){ s.severeLeak=false; s.leakAdjusting=false; s.leakSide=null; s.paused=false; s.air2LastPhysicsAt=Date.now(); s.controlNotice={kind:'leak',phase:'recovered',text:'Suction pressure normal',id:Date.now()}; paint(); setTimeout(function(){ var c=st(); if(c&&c.controlNotice&&c.controlNotice.kind==='leak'&&c.controlNotice.phase==='recovered'){ c.controlNotice={kind:'leak',phase:'closing-recovered',text:'Suction pressure normal',id:c.controlNotice.id}; paint(); } },2800); setTimeout(function(){ var c=st(); if(c&&c.controlNotice&&c.controlNotice.kind==='leak'){ c.controlNotice=null; paint(); } },3200); return true; } return false; }
  function trigger(id){ var s=st(); if(!s) return false; s.lastIgnoredTrigger=''; if(id==='fit-ok') return fitOk(); if(!isActive(s)) return ignored(s,id); if(id==='letdown-start'){ s.letdownPhase='rising'; s.letdownEventAt=Date.now(); s.letdownStableSince=null; s.noMilkSince=null; paint(); return true; } if(id==='letdown-end'){ s.letdownPhase='falling'; s.letdownEventAt=Date.now(); s.noMilkSince=null; s.manualEndSuggestionShown=false; paint(); return true; } if(id==='air-leak'){ s.paused=true; s.severeLeak=true; s.leakSide='r'; s.leakAdjusting=true; s.flowRate=0; s.flowKind='paused'; s.controlNotice={kind:'leak',phase:'warning',text:'Air leak detected',id:Date.now()}; paint(); return true; } if(id==='low-battery'){ s.batteryL=12; s.batteryR=10; notify(s,'low-battery','Battery is running low. You can finish this session, then charge Air 2 soon.',false); paint(); return true; } if(id==='critical-battery'){ s.batteryL=3; s.batteryR=2; notify(s,'low-battery','Battery is critically low. Please charge Air 2 now.',false); paint(); return true; } if(id==='minor-leak'){ s.microLeakDuringSession=true; return true; } return false; }
  function showMicroLeakToastAfterHome(){ setTimeout(function(){ var c=st(); if(!c) return; if(c.page==='control'||c.modal){ showMicroLeakToastAfterHome(); return; } c.pendingMicroLeakToast=true; c.microLeakDuringSession=false; paint(); setTimeout(function(){ var a=st(); if(!a) return; a.pendingMicroLeakToast=false; paint(); },5000); },180); }
  document.addEventListener('click',function(e){ var save=e.target.closest&&e.target.closest('#demo [data-v4="save"]'), s=st(); if(!save||!s) return; captureSession(s); resetBasePlan(s); if(!s.microLeakDuringSession) return; showMicroLeakToastAfterHome(); },true);
  function wrapView(){ if(window.__air2TriggerViewWrapped||typeof window.v4View!=='function') return; var old=window.v4View; window.v4View=v4View=function(){ old.apply(this,arguments); var s=st(), root=document.getElementById('demo'); if(!s||!root) return; if(s.pendingMicroLeakToast&&s.page!=='control'&&!s.modal) root.insertAdjacentHTML('beforeend','<div class="air2-home-toast" role="status"><span>'+toastCopy+'</span></div>'); }; window.__air2TriggerViewWrapped=true; }
  function sync(){ var b=document.querySelector('[data-demo-trigger-state]'), s=st(); if(b) b.textContent=s?((s.running?(s.paused?'paused':'pumping'):'not pumping')+' · flow '+(((Number(s.flowRate)||0)/28.3495).toFixed(3))+(s.lastIgnoredTrigger?' · '+s.lastIgnoredTrigger:'')):'Waiting for Demo...'; }
  function mount(){
    if(document.querySelector('.demo-trigger-root')) return;
    var host=document.createElement('aside'), html, i;
    function group(title,key){
      var out='<section class="demo-trigger-group"><h3>'+title+'</h3><div class="demo-trigger-grid">';
      for(i=0;i<triggers.length;i++){
        if(triggers[i][3]!==key) continue;
        out+='<button class="demo-trigger-action '+(triggers[i][2]?'is-primary':'')+'" type="button" data-demo-trigger="'+triggers[i][0]+'"><b>'+triggers[i][1]+'</b></button>';
      }
      return out+'</div></section>';
    }
    host.className='demo-trigger-root is-open';
    html='<button class="demo-trigger-toggle" type="button" aria-expanded="true"><span>Triggers</span></button><section class="demo-trigger-panel" role="dialog"><header class="demo-trigger-head"><div><h2 class="demo-trigger-title">Event Triggers</h2></div><button class="demo-trigger-close" type="button">×</button></header><div class="demo-trigger-content">';
    html+=group('Air leak','air-leak');
    html+=group('Let-down','letdown');
    html+=group('Battery','battery');
    html+='</div></section>';
    host.innerHTML=html;
    document.body.appendChild(host);
    var t=host.querySelector('.demo-trigger-toggle'), x=host.querySelector('.demo-trigger-close');
    function open(v){host.classList.toggle('is-open',v);t.setAttribute('aria-expanded',v?'true':'false');sync();}
    t.addEventListener('click',function(e){e.preventDefault();open(!host.classList.contains('is-open'));});
    x.addEventListener('click',function(e){e.preventDefault();open(false);});
    host.addEventListener('click',function(e){var b=e.target.closest&&e.target.closest('[data-demo-trigger]'); if(!b) return; e.preventDefault(); trigger(b.getAttribute('data-demo-trigger'));});
    sync();
  }
  function boot(){ install(); wrapView(); mount(); window.Air2DemoTriggers={version:26,trigger:trigger,list:function(){return triggers;},sync:sync}; }
  if(document.readyState==='loading') document.addEventListener('DOMContentLoaded',boot); else boot(); setTimeout(boot,700); setTimeout(boot,1800);
}());
