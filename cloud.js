import {initializeApp, getApps, getApp} from 'https://www.gstatic.com/firebasejs/13.1.0/firebase-app.js';
import {getAuth, GoogleAuthProvider, signInWithPopup, signInWithRedirect, getRedirectResult, signOut, setPersistence, browserLocalPersistence} from 'https://www.gstatic.com/firebasejs/13.1.0/firebase-auth.js';
import {getFirestore, doc, getDocFromServer, onSnapshot, runTransaction} from 'https://www.gstatic.com/firebasejs/13.1.0/firebase-firestore.js';
const firebaseConfig={apiKey:'AIzaSyDoZly1sMrvNtS91isAiWnR5YNdw5_1FiQ',authDomain:'minhas-recargas-byd.firebaseapp.com',projectId:'minhas-recargas-byd',storageBucket:'minhas-recargas-byd.firebasestorage.app',messagingSenderId:'141721087925',appId:'1:141721087925:web:975c09f90de7c9012773fc'};
const app=getApps().length?getApp():initializeApp(firebaseConfig);
const auth=getAuth(app), db=getFirestore(app), provider=new GoogleAuthProvider();
const $=id=>document.getElementById(id),local=window.BYDLocal;
let uid=null,ref=null,stop=null,loaded=false,revision=0,writeQueue=Promise.resolve(),lastServer=null;
const status=(label,msg)=>{if($('re_cloudIndicator'))$('re_cloudIndicator').textContent=label;if($('re_cloudMessage'))$('re_cloudMessage').textContent=msg};
const normalize=s=>({tariff:Number(s?.tariff)||1.185,records:Array.isArray(s?.records)?s.records:[],closeDay:Number(s?.closeDay)||14,closings:s?.closings&&typeof s.closings==='object'?s.closings:{},locations:Array.isArray(s?.locations)?s.locations:['Casa','Trabalho']});
const errorText=e=>e?.message||String(e);
const validRecords=s=>Array.isArray(s?.records)&&s.records.every(r=>r&&typeof r.id==='string'&&typeof r.date==='string'&&Number.isFinite(Number(r.kwh)));
function applyServer(s,rev){if(rev!==revision)return;lastServer=normalize(s);loaded=true;local.apply(lastServer);status('Sincronizado',`${lastServer.records.length} recarga(s) confirmada(s) no Firebase.`)}
function reset(user){revision++;const rev=revision;uid=user?.uid||null;loaded=false;lastServer=null;if(stop){stop();stop=null}ref=null;local.clear();
 if(!user){$('re_loginGoogle').hidden=false;$('re_logoutGoogle').hidden=true;status('Desconectado','Entre com Google para acessar suas recargas.');return}
 $('re_loginGoogle').hidden=true;$('re_logoutGoogle').hidden=false;ref=doc(db,'usuarios',uid,'dados','estado');status('Carregando…','Consultando o Firebase.');
 // A leitura do servidor evita tratar um cache antigo/vazio como fonte definitiva.
 getDocFromServer(ref).then(snap=>{if(rev!==revision)return;if(!snap.exists()){applyServer({records:[]},rev);status('Nuvem vazia','Nenhuma recarga cadastrada nesta conta.')}else if(!validRecords(snap.data())){loaded=false;status('Formato inesperado','O documento existe mas não tem a estrutura esperada. Não grave novas recargas.')}else applyServer(snap.data(),rev)}).catch(e=>{if(rev===revision){loaded=false;status('Sem acesso à nuvem',errorText(e)+' — recargas não foram apagadas.')}});
 stop=onSnapshot(ref,{includeMetadataChanges:true},snap=>{if(rev!==revision||!loaded||snap.metadata.fromCache||snap.metadata.hasPendingWrites)return;if(!snap.exists())return;if(validRecords(snap.data()))applyServer(snap.data(),rev);},e=>{if(rev===revision){loaded=false;status('Erro ao sincronizar',errorText(e))}});
}
async function commit(input){const myRev=revision,myUid=uid,myRef=ref;
 if(!loaded||!myUid||!myRef||auth.currentUser?.uid!==myUid)throw new Error('Aguarde o carregamento da sua conta Google e do Firebase.');
 if(!validRecords(input))throw new Error('Os registros não estão em um formato válido.');
 const proposed=normalize(input);
 status('Salvando…','Verificando o histórico no Firebase antes de gravar.');
 // Transação: lê o documento atual e acrescenta apenas novos IDs. Nunca faz um replace de toda a lista.
 const merged=await runTransaction(db,async tx=>{const snap=await tx.get(myRef);const present=snap.exists()?snap.data():{};
 if(snap.exists()&&!validRecords(present))throw new Error('O documento remoto não pode ser lido com segurança. Gravação cancelada.');
 const existing=normalize(present);const byId=new Map(existing.records.map(r=>[r.id,r]));
 for(const r of proposed.records){if(!byId.has(r.id))byId.set(r.id,r)}
 const result={...existing,records:[...byId.values()],tariff:proposed.tariff,closeDay:proposed.closeDay,closings:{...existing.closings,...proposed.closings},locations:[...new Set([...existing.locations,...proposed.locations])],updatedAt:new Date().toISOString()};
 tx.set(myRef,result);return result;
 });
 if(revision!==myRev||auth.currentUser?.uid!==myUid)throw new Error('A conta mudou durante a operação. Confirme o histórico antes de continuar.');
 applyServer(merged,myRev);status('Sincronizado',`${merged.records.length} recarga(s) confirmada(s) no Firebase.`);return true;
}
function enqueue(input){const job=writeQueue.catch(()=>{}).then(()=>commit(input));writeQueue=job.catch(()=>{});return job}
window.BYDCloud={commit:input=>enqueue(input),onLocalSave:input=>{
 if(!loaded||!uid)return;
 // Alterações de configuração passam pela mesma transação. Exclusões não são aplicadas
 // automaticamente para impedir perda de registros por uma lista local desatualizada.
 const requested=new Set((input.records||[]).map(x=>x.id));
 const deletion=lastServer?.records.some(r=>!requested.has(r.id));
 if(deletion){status('Exclusão protegida','A exclusão está temporariamente bloqueada para proteger seu histórico.');if(lastServer)local.apply(lastServer);return}
 enqueue(input).catch(e=>{status('Falha ao salvar',errorText(e));if(lastServer)local.apply(lastServer)});
}};
const login=async()=>{try{await setPersistence(auth,browserLocalPersistence);await signInWithPopup(auth,provider)}catch(e){if(e.code==='auth/popup-blocked'){try{await signInWithRedirect(auth,provider)}catch(err){status('Falha no login',errorText(err))}}else if(e.code!=='auth/popup-closed-by-user')status('Falha no login',errorText(e))}};
$('re_loginGoogle').onclick=login;
$('re_logoutGoogle').onclick=async()=>{if(confirm('Sair da conta Google neste aparelho?'))await signOut(auth)};
try{await getRedirectResult(auth)}catch(e){status('Falha no login Google',errorText(e))}
window.addEventListener('byd-auth-change',event=>reset(event.detail.user));
if(window.BYDAuthSession?.resolved)reset(window.BYDAuthSession.user);
