/* Cart Recovery Manager. Uses the admin page's own helpers (sb, hdr, ask, toast, inr, esc, fdt).
   All data comes from owner-only database functions. */
(function(){
 "use strict";
 const F={q:"",from:"",to:"",stage:"",recovery:"",email:"",whatsapp:"",min:"",max:"",page:0};
 let tab="list",seq=0,timer;
 const call=async(fn,a)=>{const r=await sb.rpc(fn,a);if(r.error)throw r.error;return r.data};
 const CLS={sent:"ok",delivered:"ok",read:"ok",clicked:"ok",recovered:"ok",completed:"ok",failed:"bad",bounced:"bad",complained:"bad",opted_out:"bad",pending:"wr",processing:"wr",abandoned:"wr",delayed:"wr",received:"lo"};
 const bd=s=>`<span class="bd ${CLS[s]||""}">${esc(String(s||"none").replace(/_/g," "))}</span>`;
 const prods=l=>(l||[]).map(i=>esc(i.name)+(i.variant&&i.variant!="Each"?" ("+esc(i.variant)+")":"")+" × "+i.qty).join(", ")||"–";
 const STAGES={checkout:"Checkout started",contact:"Contact entered",address:"Address completed",payment:"Payment"};
 const opts=(id,label,list,v)=>`<select id="${id}" style="width:auto" aria-label="${label}"><option value="">${label}: all</option>${list.map(x=>`<option value="${x[0]}" ${v==x[0]?"selected":""}>${x[1]}</option>`).join("")}</select>`;
 const MS=["none","pending","sent","delivered","read","failed","bounced","skipped","cancelled"].map(x=>[x,x]);

 window.recov=function(m){
  m.innerHTML=`${hdr("Cart Recovery Manager",'<button class="sm" id="rc-re">Refresh</button>')}<div class="tabs"><button class="tab ${tab=="list"?"on":""}" data-t="list">Abandoned checkouts</button><button class="tab ${tab=="set"?"on":""}" data-t="set">Automation settings</button></div><div id="rc-body"></div>`;
  m.onclick=e=>{const t=e.target.closest("[data-t]");if(t){tab=t.dataset.t;window.recov(m);return}if(e.target.id=="rc-re"){window.recov(m);return}
   const row=e.target.closest("tr[data-ck]");if(row)return detail(row.dataset.ck);
   const pg=e.target.closest("[data-pg]");if(pg){F.page+=+pg.dataset.pg;load()}};
  tab=="list"?list():settings()};

 function list(){
  $("rc-body").innerHTML=`<div class="cards4" id="rc-kpi"></div>
  <div class="row" style="margin:14px 0"><input id="f-q" type="search" placeholder="Search name, email, phone, product, order" value="${esc(F.q)}" style="max-width:300px">
  <label class="row mut">From <input id="f-from" type="date" value="${F.from}" style="width:auto"></label><label class="row mut">To <input id="f-to" type="date" value="${F.to}" style="width:auto"></label>
  ${opts("f-stage","Stage",Object.entries(STAGES),F.stage)}${opts("f-recovery","Recovery",["pending","recovered","completed","expired","opted_out","cancelled"].map(x=>[x,x.replace("_"," ")]),F.recovery)}
  ${opts("f-email","Email",MS,F.email)}${opts("f-whatsapp","WhatsApp",MS,F.whatsapp)}
  <input id="f-min" type="number" min="0" placeholder="Min ₹" value="${F.min}" style="width:100px"><input id="f-max" type="number" min="0" placeholder="Max ₹" value="${F.max}" style="width:100px"></div>
  <div id="rc-tbl"></div>`;
  const on=e=>{const k=(e.target.id||"").slice(2);if(!(k in F))return;F[k]=e.target.value;F.page=0;clearTimeout(timer);timer=setTimeout(load,300)};
  $("rc-body").oninput=on;
  load()}

 async function load(){
  const my=++seq,t=$("rc-tbl");if(!t)return;t.innerHTML='<div class="pan"><p class="mut">Loading…</p></div>';
  let d;try{d=await call("rec_admin_list",{f:F})}catch(e){if(my==seq&&$("rc-tbl"))$("rc-tbl").innerHTML=`<div class="warn">Could not load: ${esc(e.message)}. If this is the first time, run the cart recovery SQL migration in Supabase, then press Refresh.</div>`;return}
  if(my!=seq||!$("rc-tbl"))return;
  const k=d.kpi,rate=k.abandoned?(k.recovered/k.abandoned*100).toFixed(1)+"%":"–";
  $("rc-kpi").innerHTML=[["Abandoned checkouts",k.abandoned],["Pending messages",k.pending],["Emails sent",k.emails],["WhatsApp sent",k.whatsapps],["Recovered orders",k.recovered],["Recovery rate",rate],["Recovered revenue",inr(k.revenue)]].map(x=>`<div class="stat"><span>${x[0]}</span><b>${x[1]}</b></div>`).join("");
  const pages=Math.max(1,Math.ceil(d.count/25));
  $("rc-tbl").innerHTML=d.rows.length?`<div class="pan tbl w"><table><tr>${["Customer","Email","Phone","Products","Cart value","Stage","Last activity","Abandoned","Email status","WhatsApp status","Recovery"].map(h=>`<th>${h}</th>`).join("")}</tr>${d.rows.map(r=>`<tr class="cl" data-ck="${r.id}" tabindex="0"><td>${esc(r.name||"–")}</td><td>${esc(r.email||"–")}</td><td>${esc(r.phone||"–")}</td><td style="white-space:normal;min-width:200px">${prods(r.items)}</td><td>${inr(r.total)}</td><td>${STAGES[r.stage]||esc(r.stage)}${r.payment_status=="failed"?' <span class="bd bad">payment failed</span>':""}</td><td>${fdt(r.last_activity_at)}</td><td>${r.abandoned?fdt(r.abandoned):"–"}</td><td>${bd(r.email_status)}</td><td>${bd(r.whatsapp_status)}</td><td>${bd(r.recovery)}</td></tr>`).join("")}</table></div>
   <div class="row" style="margin-top:12px"><button class="sm" data-pg="-1" ${F.page?"":"disabled"}>Previous</button><span class="mut">Page ${F.page+1} of ${pages} · ${d.count} checkouts</span><button class="sm" data-pg="1" ${F.page+1<pages?"":"disabled"}>Next</button></div>`
   :'<div class="pan"><p class="mut">No abandoned checkouts match. New ones appear after a customer leaves checkout for the waiting period.</p></div>';
  $("rc-tbl").onkeydown=e=>{const r=e.target.closest("tr[data-ck]");if(r&&e.key=="Enter")detail(r.dataset.ck)}}

 async function detail(id){
  const dg=$("dg");let d;
  try{d=await call("rec_admin_detail",{ck:id})}catch(e){return toast(e.message)}
  if(!d)return toast("Checkout not found");
  const c=d.checkout,open=["active","abandoned"].includes(c.status)&&c.payment_status!="paid",out=ch=>d.optouts.some(o=>o.channel==ch);
  const can=ch=>open&&(ch=="email"?c.email&&c.email_opt_in:c.phone&&c.whatsapp_opt_in)&&!out(ch);
  const consent=(on,at,ch)=>out(ch)?"opted out":on?"yes, "+fdt(at):"no";
  const attempts=d.events.filter(e=>e.type.startsWith("payment_"));
  const history=ch=>{const l=d.messages.filter(x=>x.channel==ch),j=d.jobs.filter(x=>x.channel==ch);
   return`<h3>${ch=="email"?"Email":"WhatsApp"} history</h3>${j.map(x=>`<p>${bd(x.status)} ${x.manual?"Manual":"Scheduled"} for ${fdt(x.due_at)}${x.attempts?" · "+x.attempts+" attempt(s)":""}${x.note?` <span class="mut">${esc(x.note)}</span>`:""}</p>`).join("")}${l.map(x=>`<p>${bd(x.status)} ${x.direction=="in"?"Reply received":"Message"} ${fdt(x.at)}${x.clicked_at?" · link opened":""}${x.detail?` <span class="mut">${esc(x.detail)}</span>`:""}${x.provider_id?`<br><span class="mut" style="word-break:break-all">ID ${esc(x.provider_id)}</span>`:""}</p>`).join("")||(j.length?"":'<p class="mut">Nothing yet.</p>')}`};
  dg.innerHTML=`<div class="row" style="justify-content:space-between"><h3 style="margin:0">${esc(c.name||"Unnamed customer")} ${bd(c.status=="abandoned"||c.status=="active"?"pending":c.status)}</h3><button class="sm" id="x">Close</button></div>
  <div class="kv" style="margin-top:12px"><div><span>Email</span><b>${esc(c.email||"–")}</b></div><div><span>Phone</span><b>${esc(c.phone||"–")}</b></div><div><span>Email reminders agreed</span><b>${consent(c.email_opt_in,c.email_opt_in_at,"email")}</b></div><div><span>WhatsApp opt-in</span><b>${consent(c.whatsapp_opt_in,c.whatsapp_opt_in_at,"whatsapp")}</b></div>
  <div><span>Stage</span><b>${STAGES[c.stage]||esc(c.stage)}</b></div><div><span>Address completed</span><b>${c.address_completed?"Yes":"No"}</b></div><div><span>Payment</span><b>${esc(c.payment_status)}${c.order_number?" · "+esc(c.order_number):""}</b></div><div><span>Abandoned</span><b>${c.abandoned_at?fdt(c.abandoned_at):"–"}</b></div></div>
  <h3>Cart</h3>${(c.items||[]).map(i=>`<p>${esc(i.name)} (${esc(i.variant)}) × ${i.qty} · ${inr(i.price*i.qty)}</p>`).join("")||'<p class="mut">Empty</p>'}<p><b>Total ${inr(c.total)}</b></p>
  <h3>Payment attempts</h3>${attempts.map(e=>`<p>${esc(e.type.replace(/_/g," "))} · ${fdt(e.at)}</p>`).join("")||'<p class="mut">None.</p>'}${c.razorpay_order_id?`<p class="mut">Razorpay order ${esc(c.razorpay_order_id)}</p>`:""}
  ${history("email")}${history("whatsapp")}
  <h3>Activity</h3>${d.events.map(e=>`<p><span class="mut">${fdt(e.at)}</span> ${esc(e.type.replace(/_/g," "))}</p>`).join("")}
  <div class="row" style="margin-top:16px"><button class="pri" data-a="send_email" ${can("email")?"":"disabled"}>Send email now</button><button class="pri" data-a="send_whatsapp" ${can("whatsapp")?"":"disabled"}>Send WhatsApp now</button><button data-a="link" ${c.payment_status=="paid"||["expired","cancelled"].includes(c.status)?"disabled":""}>Copy recovery link</button><button data-a="cancel" ${d.jobs.some(j=>j.status=="pending")?"":"disabled"}>Cancel pending reminders</button><button class="dng" data-a="dnc" ${c.status=="opted_out"?"disabled":""}>Do not contact</button></div>`;
  $("x").onclick=()=>dg.close();
  const ASK={send_email:"Send the email reminder to this customer now?",send_whatsapp:"Send the WhatsApp reminder to this customer now?",cancel:"Cancel all pending reminders for this checkout?",dnc:"Never contact this customer again for cart reminders, by email or WhatsApp?"};
  dg.querySelectorAll("[data-a]").forEach(b=>b.onclick=async()=>{const a=b.dataset.a;
   if(ASK[a]&&!await ask(ASK[a],{ok:"Yes",danger:a=="dnc"||a=="cancel"?1:0}))return;
   b.disabled=true;
   try{const r=await call("rec_admin_action",{ck:id,act:a});
    if(a=="link"){try{await navigator.clipboard.writeText(r);toast("Link copied")}catch(e){await ask("Copy this link:",{input:r,ok:"Done",danger:0})}b.disabled=false;return}
    toast(a.startsWith("send_")?"Queued. It sends within a minute.":"Done");detail(id)}catch(e){toast(e.message);b.disabled=false}});
  if(!dg.open)dg.showModal()}

 async function settings(){
  const b=$("rc-body");b.oninput=null;b.innerHTML='<p class="mut">Loading…</p>';
  let s;try{s=await call("rec_admin_settings",{})}catch(e){b.innerHTML=`<div class="warn">Could not load settings: ${esc(e.message)}</div>`;return}
  const chk=(k,l)=>`<label class="row"><input type="checkbox" id="s-${k}" style="width:auto" ${s[k]?"checked":""}> ${l}</label>`;
  const num=(k,l,min,max)=>`<label class="mut" for="s-${k}">${l}</label><input id="s-${k}" type="number" min="${min}" max="${max}" value="${s[k]}" required>`;
  const txt=(k,l)=>`<label class="mut" for="s-${k}">${l}</label><input id="s-${k}" value="${esc(s[k])}" required>`;
  b.innerHTML=`<form class="f" id="rc-sf">${chk("campaign_active","<b>Recovery campaign is active</b>")}${chk("email_enabled","Email reminders")}${chk("whatsapp_enabled","WhatsApp reminders")}
  ${num("abandon_minutes","Count as abandoned after this many idle minutes",5,1440)}${num("email_delay_minutes","Email reminder: minutes after abandonment",5,10080)}${num("whatsapp_delay_minutes","WhatsApp reminder: minutes after abandonment (360 = 6 hours)",5,10080)}
  <p class="mut">Abandonment time is the customer's last activity. New delays apply to checkouts abandoned from now on; reminders already scheduled keep their time.</p>
  ${num("min_cart_value","Minimum cart value (₹)",0,1000000)}${num("expiry_hours","Stop reminding and expire the link after (hours)",1,720)}${num("max_per_contact_7d","Most reminders per customer, per channel, in 7 days",1,20)}${num("daily_cap","Most messages per channel in 24 hours",1,10000)}${num("retention_days","Delete tracking data after (days)",30,730)}
  ${txt("email_subject","Email subject")}<label class="mut" for="s-email_body">Email body. Placeholders: {{customer_name}} {{product_summary}} {{quantity}} {{cart_total}} {{secure_checkout_link}}</label><textarea id="s-email_body" rows="16" maxlength="5000">${esc(s.email_body)}</textarea>
  ${txt("whatsapp_template","WhatsApp template name (as approved in Meta)")}${txt("whatsapp_language","Template language code")}
  <p class="mut">The WhatsApp wording is edited and approved in Meta, not here. The template needs two body variables: {{1}} name, {{2}} checkout link.</p>
  <button class="pri" style="padding:10px">Save settings</button></form>`;
  $("rc-sf").onsubmit=async e=>{e.preventDefault();const p={};
   for(const k in s){const el=$("s-"+k);if(el)p[k]=el.type=="checkbox"?el.checked:el.type=="number"?Number(el.value):el.value.trim()}
   if(p.campaign_active&&!s.campaign_active&&!await ask("Start sending reminders to customers who agreed to them?",{ok:"Start",danger:0}))return;
   try{await call("rec_admin_settings",{p});toast("Settings saved");settings()}catch(err){toast(err.message)}}}
})();
