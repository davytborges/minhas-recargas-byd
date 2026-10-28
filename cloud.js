import {initializeApp, getApps, getApp} from 'https://www.gstatic.com/firebasejs/13.1.0/firebase-app.js';
import {getAuth, GoogleAuthProvider, signInWithPopup, signInWithRedirect, getRedirectResult, onAuthStateChanged, signOut, setPersistence, browserLocalPersistence} from 'https://www.gstatic.com/firebasejs/13.1.0/firebase-auth.js';
import {getFirestore, doc, getDoc, setDoc, onSnapshot} from 'https://www.gstatic.com/firebasejs/13.1.0/firebase-firestore.js';
const firebaseConfig={apiKey:'AIzaSyDoZly1sMrvNtS91isAiWnR5YNdw5_1FiQ',authDomain:'minhas-recargas-byd.firebaseapp.com',projectId:'minhas-recargas-byd',storageBucket:'minhas-recargas-byd.firebasestorage.app',messagingSenderId:'141721087925',appId:'1:141721087925:web:975c09f90de7c9012773fc'};
const app=getApps().length?getApp():initializeApp(firebaseConfig),auth=getAuth(app),db=getFirestore(app);
const $=id=>document.getElementById(id),local=window.BYDLocal,provider=new GoogleAuthProvider();const initialLocal=local.get();
let activeUid=null,remoteRef=null,stopListen=null,loaded=false,remoteExists=false,applying=false,saveQueue=Promise.resolve(),session=0,lastRemoteJson=null;
const status=(label,msg)=>{$('re_cloudIndicator').textContent=label;$('re_cloudMessage').textContent=msg};
const normalized=s=>({tariff:Number(s.tariff)||1.185,records:Array.isArray(s.records)?s.records:[],closeDay:Number(s.closeDay)||14,closings:s.closings||{},locations:Array.isArray(s.locations)?s.locations:['Casa','Trabalho']});
const encode=s=>JSON.stringify(normalized(s));
const safeMessage=e=>{const code=e?.code||'';if(code.includes('unauthorized-domain'))return 'Domínio não autorizado. Adicione davytborges.github.io em Firebase > Authentication > Configurações > Domínios autorizados.';if(code.includes('permission-denied'))return 'Permissão negada no Firestore. Verifique as regras publicadas.';if(code.includes('popup-blocked'))return 'O navegador bloqueou a janela de login. Permita pop-ups neste site.';return e?.message||String(e)};
async function write(s){
 if(!loaded||!remoteRef||!activeUid)throw Error('Aguardando autenticação e leitura dos dados da nuvem.');
 const thisSession=session,refAtStart=remoteRef,payload=normalized(s);
 if(lastRemoteJson){const previous=JSON.parse(lastRemoteJson);if(previous.records.length>0&&payload.records.length===0)throw Error('Proteção ativada: uma lista vazia não pode apagar seu histórico.');}
 if(!auth.currentUser||auth.currentUser.uid!==activeUid)throw Error('A conta Google foi desconectada.');
 status('Salvando…','Confirmando a gravação no Firebase.');
 await setDoc(refAtStart,{...payload,updatedAt:new Date().toISOString()});
 if(thisSession!==session||auth.currentUser?.uid!==activeUid)throw Error('A conta mudou durante a gravação. Confira os dados após entrar.');
 lastRemoteJson=JSON.stringify(payload);
 status('Sincronizado','Recargas confirmadas na nuvem.');
 return true;
}
const queueWrite=s=>{const result=saveQueue.catch(()=>{}).then(()=>write(s));saveQueue=result.catch(()=>{});return result};
window.BYDCloud={commit:s=>queueWrite(s),onLocalSave:s=>{
 if(!loaded||applying||!activeUid)return;
 queueWrite(s).catch(e=>status('Falha ao salvar',safeMessage(e)));
}};
const login=async()=>{try{await setPersistence(auth,browserLocalPersistence);await signInWithPopup(auth,provider)}catch(e){if(e.code==='auth/popup-blocked'){try{await signInWithRedirect(auth,provider);return}catch(e2){status('Falha no login',safeMessage(e2));return}}if(e.code!=='auth/popup-closed-by-user')status('Falha no login',safeMessage(e))}};
$('re_loginGoogle').onclick=login;
$('re_logoutGoogle').onclick=async()=>{if(!confirm('Sair da conta Google neste aparelho? Suas recargas continuam na nuvem.'))return;await signOut(auth)};
try{await getRedirectResult(auth)}catch(e){status('Falha no retorno do Google',safeMessage(e))}
onAuthStateChanged(auth,user=>{session++;loaded=false;activeUid=user?.uid||null;if(stopListen){stopListen();stopListen=null}if(!user){local.clear();remoteRef=null;$('re_loginGoogle').hidden=false;$('re_logoutGoogle').hidden=true;status('Desconectado','Entre com sua conta Google para sincronizar suas recargas.');return;}$('re_loginGoogle').hidden=true;$('re_logoutGoogle').hidden=false;status('Conectando…','Abrindo seus dados no Firebase.');remoteRef=doc(db,'usuarios',user.uid,'dados','estado');const thisSession=session;stopListen=onSnapshot(remoteRef,snapshot=>{if(thisSession!==session)return;if(snapshot.metadata.hasPendingWrites)return;loaded=true;remoteExists=snapshot.exists();if(remoteExists){const s=normalized(snapshot.data());lastRemoteJson=JSON.stringify(s);applying=true;local.apply(s);applying=false;status('Sincronizado',`Conectado com ${user.email||'Google'}. Suas recargas estão disponíveis na nuvem.`)}else{local.clear();lastRemoteJson=JSON.stringify(normalized({records:[]}));status('Nuvem vazia',`Conectado com ${user.email||'Google'}. Ainda não há recargas na nuvem. Cadastre sua primeira recarga.`)}},e=>{loaded=false;status('Erro ao acessar nuvem',safeMessage(e))});});
