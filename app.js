const SUPABASE_URL='https://upkbxieqpsrubyvcjniv.supabase.co';
const SUPABASE_ANON_KEY='sb_publishable_uC1zGZTe5ulZ-CuA25QS2w_W-IgKd0k';

const ready=SUPABASE_URL.startsWith('https://')&&!SUPABASE_URL.includes('PASTE_')&&!SUPABASE_ANON_KEY.includes('PASTE_');
const db=ready?supabase.createClient(SUPABASE_URL,SUPABASE_ANON_KEY):null;

let user=null,role='staff';

const $=s=>document.querySelector(s);
const date=()=>new Date().toISOString().slice(0,10);
const money=n=>'₹'+Number(n||0).toFixed(2);
const safe=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));

document.querySelectorAll('input[type=date]').forEach(x=>x.value=date());

$('#loginForm').onsubmit=async e=>{
 e.preventDefault();
 if(!db){$('#loginMsg').textContent='Database connection setup is still required.';return}
 const {data,error}=await db.auth.signInWithPassword({
  email:$('#email').value,
  password:$('#password').value
 });
 if(error){$('#loginMsg').textContent=error.message;return}
 user=data.user;
 const p=await db.from('profiles').select('role').eq('id',user.id).single();
 if(p.error){
  $('#loginMsg').textContent='User role not configured.';
  await db.auth.signOut();
  return;
 }
 role=p.data.role;
 $('#login').hidden=true;
 $('#app').hidden=false;
 loadAll();
};

$('#logout').onclick=async()=>{
 await db?.auth.signOut();
 location.reload();
};

document.querySelector('nav').onclick=e=>{
 if(!e.target.dataset.tab)return;
 document.querySelectorAll('.tab').forEach(x=>x.hidden=x.id!==e.target.dataset.tab);
};

const obj=f=>Object.fromEntries(new FormData(f).entries());

async function save(table,row){
 const {error}=await db.from(table).insert({...row,created_by:user.id});
 if(error)alert(error.message);
 else{
  alert('Saved');
  loadAll();
 }
}

$('#salesForm').onsubmit=async e=>{
 e.preventDefault();
 const x=obj(e.target);
 await save('sales',{
  entry_date:x.entry_date,
  small_qty:+x.small_qty,
  big_qty:+x.big_qty,
  other_amount:+x.other_amount,
  total_amount:+x.small_qty*7 + +x.big_qty*12 + +x.other_amount,
  payment_mode:x.payment_mode,
  note:x.note
 });
};

$('#expenseForm').onsubmit=async e=>{
 e.preventDefault();
 const x=obj(e.target);
 await save('expenses',{...x,amount:+x.amount});
};

$('#udharForm').onsubmit=async e=>{
 e.preventDefault();
 const x=obj(e.target);
 await save('udhar_entries',{...x,amount:+x.amount});
};

$('#stampForm').onsubmit=async e=>{
 e.preventDefault();
 const x=obj(e.target);
 let {data:c,error}=await db.from('loyalty_customers').select('*').eq('mobile',x.mobile).maybeSingle();
 if(error)return alert(error.message);

 if(!c){
  const r=await db.from('loyalty_customers').insert({
   customer_name:x.customer_name,
   mobile:x.mobile
  }).select().single();
  if(r.error)return alert(r.error.message);
  c=r.data;
 }

 let stamps=c.stamps + +x.stamps;
 let free=c.free_chai;

 while(stamps>=6){
  stamps-=6;
  free++;
 }

 const u=await db.from('loyalty_customers').update({
  stamps,
  free_chai:free,
  customer_name:x.customer_name
 }).eq('id',c.id);

 if(u.error)return alert(u.error.message);

 const ev=await db.from('loyalty_events').insert({
  customer_id:c.id,
  event_type:'stamp',
  quantity:+x.stamps,
  created_by:user.id
 });

 if(ev.error)return alert('Stamp saved, but history entry failed: '+ev.error.message);

 e.target.reset();
 showCard({...c,stamps,free_chai:free});
 loadAll();
};

function showCard(c){
 $('#loyaltyCard').innerHTML=`
  <h3>${safe(c.customer_name)}</h3>
  <p>${safe(c.mobile)}</p>
  <b>${c.stamps}/6 stamps · ${c.free_chai} free chai</b>
  <div>${Array.from({length:6},(_,i)=>`<span class="stamp ${i<c.stamps?'filled':''}">${i<c.stamps?'✓':i+1}</span>`).join('')}</div>
  <button id="redeem" ${c.free_chai?'':'disabled'}>Redeem free chai</button>
 `;

 $('#redeem').onclick=async()=>{
  if(!c.free_chai)return;
  const u=await db.from('loyalty_customers').update({
   free_chai:c.free_chai-1
  }).eq('id',c.id);
  if(u.error)return alert(u.error.message);

  const ev=await db.from('loyalty_events').insert({
   customer_id:c.id,
   event_type:'redeem',
   quantity:1,
   created_by:user.id
  });
  if(ev.error)return alert('Redeemed, but history entry failed: '+ev.error.message);

  showCard({...c,free_chai:c.free_chai-1});
  loadAll();
 };
}

$('#findForm').onsubmit=async e=>{
 e.preventDefault();
 const mobile=new FormData(e.target).get('mobile');
 const {data,error}=await db.from('loyalty_customers').select('*').eq('mobile',mobile).maybeSingle();
 if(error)alert(error.message);
 else if(data)showCard(data);
 else $('#loyaltyCard').textContent='Customer not found';
};

async function list(t){
 const {data,error}=await db.from(t).select('*').order('created_at',{ascending:false}).limit(60);
 if(error){
  console.error(error);
  return [];
 }
 return data||[];
}

function loyaltyBalance(events){
 let stamps=0,redeemed=0;

 events.forEach(e=>{
  if(e.event_type==='stamp')stamps+=Number(e.quantity||0);
  if(e.event_type==='redeem')redeemed+=Number(e.quantity||0);
 });

 const earned=Math.floor(stamps/6);

 if(redeemed>earned){
  throw new Error('This change would make redeemed free chai greater than earned free chai. The change was not made.');
 }

 return {
  stamps:stamps%6,
  free_chai:earned-redeemed
 };
}

async function syncLoyaltyCustomer(customerId){
 const {data:events,error}=await db.from('loyalty_events')
  .select('event_type,quantity')
  .eq('customer_id',customerId);

 if(error)throw error;

 const balance=loyaltyBalance(events||[]);

 const {error:updateError}=await db.from('loyalty_customers')
  .update(balance)
  .eq('id',customerId);

 if(updateError)throw updateError;
}

async function editRecord(table,id){
 if(role!=='owner')return alert('Only owner can edit history.');

 const {data:r,error}=await db.from(table).select('*').eq('id',id).single();
 if(error)return alert(error.message);

 const ask=(label,value)=>prompt(label,value??'');
 const number=(label,value)=>{
  const v=ask(label,String(value??0));
  if(v===null)return null;
  const n=Number(v);
  if(!Number.isFinite(n)||n<0)return NaN;
  return n;
 };

 let changes={};

 if(table==='sales'){
  const d=ask('Sale date (YYYY-MM-DD)',r.entry_date);
  if(d===null)return;
  const small=number('Small chai quantity',r.small_qty);
  if(small===null)return;
  const big=number('Big chai quantity',r.big_qty);
  if(big===null)return;
  const other=number('Other amount',r.other_amount);
  if(other===null)return;
  if([small,big,other].some(Number.isNaN))return alert('Please enter valid non-negative numbers.');

  const mode=ask('Payment mode',r.payment_mode);
  if(mode===null)return;
  const note=ask('Note',r.note||'');
  if(note===null)return;

  changes={
   entry_date:d,
   small_qty:small,
   big_qty:big,
   other_amount:other,
   total_amount:small*7+big*12+other,
   payment_mode:mode,
   note
  };
 }

 if(table==='expenses'){
  const d=ask('Expense date (YYYY-MM-DD)',r.entry_date);
  if(d===null)return;
  const title=ask('Expense title',r.title);
  if(title===null)return;
  const amount=number('Amount',r.amount);
  if(amount===null)return;
  if(Number.isNaN(amount))return alert('Please enter a valid amount.');
  const mode=ask('Payment mode',r.payment_mode);
  if(mode===null)return;
  const note=ask('Note',r.note||'');
  if(note===null)return;
  changes={entry_date:d,title,amount,payment_mode:mode,note};
 }

 if(table==='udhar_entries'){
  const d=ask('Date (YYYY-MM-DD)',r.entry_date);
  if(d===null)return;
  const name=ask('Customer name',r.customer_name);
  if(name===null)return;
  const mobile=ask('Mobile number',r.mobile);
  if(mobile===null)return;
  const amount=number('Amount',r.amount);
  if(amount===null)return;
  if(Number.isNaN(amount))return alert('Please enter a valid amount.');
  const kind=ask('Type: given or paid',r.kind);
  if(kind===null)return;
  if(!['given','paid'].includes(kind))return alert('Type must be given or paid.');
  const note=ask('Note',r.note||'');
  if(note===null)return;
  changes={entry_date:d,customer_name:name,mobile,amount,kind,note};
 }

 if(table==='loyalty_events'){
  const type=ask('Event type: stamp or redeem',r.event_type);
  if(type===null)return;
  if(!['stamp','redeem'].includes(type))return alert('Type must be stamp or redeem.');
  const quantity=number('Quantity',r.quantity);
  if(quantity===null)return;
  if(!Number.isInteger(quantity)||quantity<1)return alert('Quantity must be a positive whole number.');

  const {data:events,error:eventsError}=await db.from('loyalty_events')
   .select('*').eq('customer_id',r.customer_id);
  if(eventsError)return alert(eventsError.message);

  const proposed=(events||[]).map(ev=>ev.id===id?{...ev,event_type:type,quantity}:ev);

  try{loyaltyBalance(proposed);}
  catch(err){return alert(err.message);}

  changes={event_type:type,quantity};
 }

 const {error:updateError}=await db.from(table).update(changes).eq('id',id);
 if(updateError)return alert(updateError.message);

 if(table==='loyalty_events'){
  try{
   await syncLoyaltyCustomer(r.customer_id);
  }catch(err){
   return alert('History updated, but loyalty balance needs checking: '+err.message);
  }
 }

 alert('History updated successfully.');
 loadAll();
}

async function deleteRecord(table,id){
 if(role!=='owner')return alert('Only owner can delete history.');
 if(!confirm('Are you sure you want to delete this history record?'))return;

 let record=null;

 if(table==='loyalty_events'){
  const {data,error}=await db.from(table).select('*').eq('id',id).single();
  if(error)return alert(error.message);
  record=data;

  const {data:events,error:eventsError}=await db.from(table)
   .select('*').eq('customer_id',record.customer_id);
  if(eventsError)return alert(eventsError.message);

  const proposed=(events||[]).filter(ev=>ev.id!==id);
  try{loyaltyBalance(proposed);}
  catch(err){return alert(err.message);}
 }

 const {error}=await db.from(table).delete().eq('id',id);
 if(error)return alert(error.message);

 if(table==='loyalty_events'){
  try{
   await syncLoyaltyCustomer(record.customer_id);
  }catch(err){
   return alert('Record deleted, but loyalty balance needs checking: '+err.message);
  }
 }

 alert('Record deleted successfully.');
 loadAll();
}

$('#historyRows').addEventListener('click',e=>{
 const button=e.target.closest('button[data-action]');
 if(!button)return;
 const {action,table,id}=button.dataset;
 if(action==='edit')editRecord(table,id);
 if(action==='delete')deleteRecord(table,id);
});

async function loadAll(){
 const [s,x,u,le,customers]=await Promise.all([
  list('sales'),
  list('expenses'),
  list('udhar_entries'),
  list('loyalty_events'),
  list('loyalty_customers')
 ]);

 const td=date();
 const sv=s.filter(r=>r.entry_date===td).reduce((a,r)=>a+Number(r.total_amount||0),0);
 const ex=x.filter(r=>r.entry_date===td).reduce((a,r)=>a+Number(r.amount||0),0);
 const due=u.reduce((a,r)=>a+(r.kind==='given'?Number(r.amount):-Number(r.amount)),0);

 $('#salesTotal').textContent=money(sv);
 $('#expenseTotal').textContent=money(ex);
 $('#netTotal').textContent=money(sv-ex);
 $('#dueTotal').textContent=money(due);

 $('#salesRows').innerHTML=s.map(r=>`
  <div class="row">${safe(r.entry_date)} · ${r.small_qty} small / ${r.big_qty} big
   <b>${money(r.total_amount)}</b>
  </div>
 `).join('');

 $('#expenseRows').innerHTML=x.map(r=>`
  <div class="row">${safe(r.title)} · ${safe(r.entry_date)}
   <b>${money(r.amount)}</b>
  </div>
 `).join('');

 $('#udharRows').innerHTML=u.map(r=>`
  <div class="row">${safe(r.customer_name)} · ${safe(r.kind)}
   <b>${money(r.amount)}</b>
  </div>
 `).join('');

 const customerMap={};
 customers.forEach(c=>customerMap[c.id]=c);

 const history=[
  ...s.map(r=>({...r,_table:'sales',_t:'Sale',_a:r.total_amount,_detail:`${r.small_qty} small / ${r.big_qty} big`})),
  ...x.map(r=>({...r,_table:'expenses',_t:'Expense',_a:r.amount,_detail:r.title})),
  ...u.map(r=>({...r,_table:'udhar_entries',_t:'Udhar',_a:r.amount,_detail:`${r.customer_name} · ${r.kind}`})),
  ...le.map(r=>({
   ...r,
   _table:'loyalty_events',
   _t:'Loyalty '+r.event_type,
   _a:r.quantity,
   _detail:customerMap[r.customer_id]?.customer_name||'Customer'
  }))
 ];

 history.sort((a,b)=>new Date(b.created_at||0)-new Date(a.created_at||0));

 $('#historyNote').textContent=role==='owner'
  ?'Owner access: You can edit and delete History records.'
  :'Staff access: History is view-only.';

 $('#historyRows').innerHTML=history.map(r=>`
  <div class="row">
   <div>
    <b>${safe(r._t)}</b>
    <div>${safe(r.entry_date||String(r.created_at||'').slice(0,10))}</div>
    <div>${safe(r._detail||'')}</div>
    <b>${money(r._a)}</b>
   </div>
   ${role==='owner'?`
    <div>
     <button type="button" data-action="edit" data-table="${r._table}" data-id="${r.id}">Edit</button>
     <button type="button" data-action="delete" data-table="${r._table}" data-id="${r.id}">Delete</button>
    </div>
   `:''}
  </div>
 `).join('');
}

if('serviceWorker'in navigator){
 navigator.serviceWorker.register('sw.js').catch(()=>{});
}
