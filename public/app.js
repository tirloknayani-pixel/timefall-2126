const socket = io();
const $ = (id) => document.getElementById(id);
const canvas = $("world");
const ctx = canvas.getContext("2d");
let state = null;
let me = null;
let keys = new Set();
let pad = {dx:0,dy:0};
let lastSent = 0;

$("create").onclick = () => socket.emit("createRoom", {name:$("name").value}, joinDone);
$("join").onclick = () => socket.emit("joinRoom", {code:$("roomCode").value, name:$("name").value}, joinDone);
$("start").onclick = () => socket.emit("startGame");

function joinDone(res){
  if(!res?.ok) return alert(res?.error || "Could not join room.");
  $("lobby").classList.add("hidden");
  $("game").classList.remove("hidden");
  $("code").textContent = res.code;
  me = res.id;
}

socket.on("connect",()=> $("status").textContent=" ONLINE");
socket.on("disconnect",()=> $("status").textContent=" OFFLINE");
socket.on("state",(s)=>{ state=s; if(!me && s.players[0]) me=s.players[0].id; renderUI(); });

document.querySelectorAll("[data-action]").forEach(b=>{
  b.onclick=()=>socket.emit("action",{action:b.dataset.action});
});
$("send").onclick=sendChat;
$("chatInput").addEventListener("keydown",e=>{if(e.key==="Enter")sendChat()});
function sendChat(){
  const input=$("chatInput"), message=input.value.trim();
  if(message){socket.emit("chat",{message});input.value=""}
}
socket.on("chat",m=>{
  const line=document.createElement("div");
  line.textContent=`${m.name}: ${m.message}`;
  $("chatLog").appendChild(line);
  $("chatLog").scrollTop=$("chatLog").scrollHeight;
});

addEventListener("keydown",e=>{
  keys.add(e.key.toLowerCase());
  if(["arrowup","arrowdown","arrowleft","arrowright"," "].includes(e.key.toLowerCase()))e.preventDefault();
});
addEventListener("keyup",e=>keys.delete(e.key.toLowerCase()));

document.querySelectorAll("#joystick button").forEach(btn=>{
  const start=()=>{pad.dx=+btn.dataset.dx;pad.dy=+btn.dataset.dy};
  const end=()=>{pad.dx=0;pad.dy=0};
  btn.addEventListener("pointerdown",e=>{e.preventDefault();btn.setPointerCapture?.(e.pointerId);start()});
  btn.addEventListener("pointerup",end);btn.addEventListener("pointercancel",end);btn.addEventListener("pointerleave",end);
});

setInterval(()=>{
  if(!state?.started) return;
  let dx=(keys.has("d")||keys.has("arrowright")?1:0)-(keys.has("a")||keys.has("arrowleft")?1:0);
  let dy=(keys.has("s")||keys.has("arrowdown")?1:0)-(keys.has("w")||keys.has("arrowup")?1:0);
  if(pad.dx||pad.dy){dx=pad.dx;dy=pad.dy}
  const len=Math.hypot(dx,dy); if(len){dx/=len;dy/=len}
  if(Date.now()-lastSent>45){socket.emit("input",{dx,dy});lastSent=Date.now()}
},50);

function renderUI(){
  if(!state)return;
  ["energy","food","stability","alert","round","timer"].forEach(k=>{
    const el=$(k); if(el) el.textContent=k==="timer"?state.roundTime:state[k];
  });
  $("crew").innerHTML=state.players.map(p=>`<div class="crew-row"><i class="dot" style="background:${p.color}"></i><span>${esc(p.name)}</span><span class="hp">${p.hp} HP</span></div>`).join("");
  const labels=[["core","Temporal Core"],["stabilizer","Quantum Stabilizer"],["key","Chrono-Key"],["cell","Power Cell"]];
  $("parts").innerHTML=labels.map(([k,n])=>`<div class="part ${state.portal[k]?"done":""}"><b>${state.portal[k]?"✓ ":""}${n}</b><span>${state.portal[k]?"COLLECTED":"RUN TO LOCATION"}</span></div>`).join("");
  $("log").innerHTML=state.log.map(x=>`<div class="logline">${esc(x)}</div>`).join("");
  $("start").textContent=state.started?"MISSION RUNNING":"START MISSION";
  $("start").disabled=state.started;
}

function esc(s){return String(s).replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]))}

function resize(){
  const r=canvas.getBoundingClientRect(), d=devicePixelRatio||1;
  canvas.width=r.width*d; canvas.height=r.height*d; ctx.setTransform(d,0,0,d,0,0);
}
addEventListener("resize",resize); resize();

function draw(){
  requestAnimationFrame(draw);
  const w=canvas.clientWidth,h=canvas.clientHeight;
  ctx.clearRect(0,0,w,h);
  ctx.fillStyle="#07111d";ctx.fillRect(0,0,w,h);
  if(!state){return}
  const sx=w/1490, sy=h/1100, scale=Math.min(sx,sy);
  ctx.save();ctx.scale(scale,scale);
  const vw=w/scale,vh=h/scale;
  drawWorld(vw,vh);
  ctx.restore();
}
function drawWorld(w,h){
  // grid
  ctx.strokeStyle="#12273a";ctx.lineWidth=1;
  for(let x=0;x<1490;x+=50){ctx.beginPath();ctx.moveTo(x,0);ctx.lineTo(x,1100);ctx.stroke()}
  for(let y=0;y<1100;y+=50){ctx.beginPath();ctx.moveTo(0,y);ctx.lineTo(1490,y);ctx.stroke()}
  // roads
  ctx.strokeStyle="#1a3448";ctx.lineWidth=24;
  [[0,520,1490,520],[760,0,760,1100],[120,930,1350,180]].forEach(a=>{ctx.beginPath();ctx.moveTo(a[0],a[1]);ctx.lineTo(a[2],a[3]);ctx.stroke()});
  // buildings
  const buildings=[[80,90,240,150],[830,70,240,150],[1160,90,220,110],[80,600,220,120],[480,610,180,120],[850,610,190,130],[1160,790,210,150],[430,920,250,100]];
  buildings.forEach(([x,y,bw,bh],i)=>{ctx.fillStyle=i%2?"#0c1d2c":"#0d2233";ctx.fillRect(x,y,bw,bh);ctx.strokeStyle="#1e4357";ctx.strokeRect(x,y,bw,bh);});
  // locations
  state.locations.forEach(l=>{
    const pulse=1+Math.sin(Date.now()/350+l.x)*.08;
    ctx.beginPath();ctx.arc(l.x,l.y,42*pulse,0,Math.PI*2);ctx.fillStyle=l.color+"18";ctx.fill();
    ctx.beginPath();ctx.arc(l.x,l.y,26,0,Math.PI*2);ctx.fillStyle="#08131f";ctx.fill();ctx.strokeStyle=l.color;ctx.lineWidth=3;ctx.stroke();
    ctx.fillStyle=l.color;ctx.font="bold 12px system-ui";ctx.textAlign="center";ctx.fillText(l.name,l.x,l.y+47);
    ctx.font="18px system-ui";ctx.fillText("⌖",l.x,l.y+6);
  });
  // portal at facility
  const f=state.locations.find(x=>x.id==="facility");
  if(f){
    ctx.beginPath();ctx.arc(f.x,f.y,52+Math.sin(Date.now()/180)*6,0,Math.PI*2);ctx.strokeStyle="#7ea7ff";ctx.lineWidth=3;ctx.stroke();
  }
  // players
  state.players.forEach(p=>drawPlayer(p));
}
function drawPlayer(p){
  const moving=state.started;
  ctx.save();ctx.translate(p.x,p.y);
  // shadow
  ctx.fillStyle="#0008";ctx.beginPath();ctx.ellipse(0,20,17,7,0,0,Math.PI*2);ctx.fill();
  // legs
  ctx.strokeStyle="#d9f3ff";ctx.lineWidth=5;ctx.lineCap="round";
  const swing=moving?Math.sin(Date.now()/80+p.x)*7:0;
  ctx.beginPath();ctx.moveTo(-5,11);ctx.lineTo(-8+swing/3,25);ctx.moveTo(5,11);ctx.lineTo(8-swing/3,25);ctx.stroke();
  // body
  ctx.fillStyle=p.color;ctx.beginPath();ctx.roundRect(-12,-12,24,28,7);ctx.fill();
  // head
  ctx.fillStyle="#eaf7ff";ctx.beginPath();ctx.arc(0,-22,10,0,Math.PI*2);ctx.fill();
  // visor
  ctx.fillStyle="#10263b";ctx.fillRect(-8,-25,16,6);
  // name
  ctx.fillStyle="#dff7ff";ctx.font="bold 11px system-ui";ctx.textAlign="center";ctx.fillText(p.name,0,-39);
  // hp
  ctx.fillStyle="#182536";ctx.fillRect(-18,-34,36,4);ctx.fillStyle="#6cf59a";ctx.fillRect(-18,-34,36*(p.hp/100),4);
  ctx.restore();
}
draw();
