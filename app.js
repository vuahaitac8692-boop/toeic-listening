'use strict';
const $ = id => document.getElementById(id);
const audio = $('audio'), scriptBox = $('scriptBox');
const WORKER_BASE_URL='https://english-listening-worker.vuahaitac8692.workers.dev';
let isAdmin=false;
let mergeFiles=[];
let lessons=[], currentLesson=null, segments=[], showVi=true, activeId=null, followAudio=true, userScrollUntil=0, previewUrl=null, selectedAudio=null;
const fmt=n=>{n=Math.max(0,Math.floor(Number(n)||0));return `${String(Math.floor(n/60)).padStart(2,'0')}:${String(n%60).padStart(2,'0')}`;};
const safeId=s=>String(s||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'');
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
function status(s){$('adminStatus').textContent=s;}
function download(name,data,type='application/json'){const blob=new Blob([data],{type});const u=URL.createObjectURL(blob);const a=document.createElement('a');a.href=u;a.download=name;document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(u),3000);}
function getWorker(){return WORKER_BASE_URL;}
function getPassword(){return sessionStorage.getItem('listeningAdminPassword')||'';}
function setProgress(p,show=true){$('progressWrap').classList.toggle('hidden',!show);$('progressBar').style.width=`${Math.max(0,Math.min(100,p))}%`;}
function normalize(data){return (Array.isArray(data)?data:[]).map((x,i)=>({id:String(x.id??i+1),time:Number(x.time??x.start??0)||0,en:String(x.en??x.english??''),vi:String(x.vi??x.vietnamese??'')})).sort((a,b)=>a.time-b.time);}
function renderLessons(){const host=$('lessonList');host.innerHTML='';lessons.forEach(l=>{const line=document.createElement('div');line.className='lesson-line';const b=document.createElement('button');b.className='lesson-item'+(currentLesson?.id===l.id?' selected':'');b.innerHTML=`${esc(l.title)}<small>${esc(l.id)}</small>`;b.onclick=()=>loadLesson(l.id);line.append(b);if(isAdmin){const edit=document.createElement('button');edit.className='lesson-rename';edit.textContent='Sửa tên';edit.title='Đổi tên bài học';edit.onclick=()=>renameLesson(l);line.append(edit);}host.append(line);});if(!lessons.length)host.textContent='Chưa có bài học nào.';}
async function renameLesson(lesson){const title=prompt('Nhập tên mới cho bài học:',lesson.title);if(title===null)return;const clean=title.trim();if(!clean||clean===lesson.title)return;if(!confirm(`Đổi tên bài học thành “${clean}”?`))return;try{const r=await fetch(`${getWorker()}/rename`,{method:'POST',headers:{'Content-Type':'application/json','x-admin-password':getPassword()},body:JSON.stringify({id:lesson.id,title:clean})});const d=await r.json().catch(()=>({}));if(!r.ok)throw Error(d.error||`HTTP ${r.status}`);lesson.title=clean;if(currentLesson?.id===lesson.id){$('lessonTitle').textContent=clean;currentLesson.title=clean;}renderLessons();}catch(e){alert(`Không đổi được tên bài học: ${e.message}`);}}
async function loadLesson(id){const l=lessons.find(x=>x.id===id);if(!l)return;currentLesson=l;renderLessons();$('lessonTitle').textContent=l.title;$('lessonId').textContent=l.id;audio.pause();audio.src=l.audio||'';audio.load();segments=[];activeId=null;try{if(l.transcript){const r=await fetch(l.transcript,{cache:'no-store'});if(r.ok)segments=normalize(await r.json());}}catch(e){console.warn(e);}renderTranscript();updateActive(true);}
function renderTranscript(){scriptBox.innerHTML='';if(!segments.length){const p=document.createElement('p');p.className='muted';p.textContent='Bài học này chưa có transcript.';scriptBox.append(p);return;}segments.forEach(s=>{const d=document.createElement('article');d.className='segment';d.dataset.id=s.id;const b=document.createElement('button');b.textContent=`▶ ${fmt(s.time)}`;b.onclick=()=>{audio.currentTime=s.time;audio.play().catch(()=>{});};const en=document.createElement('div');en.className='en';en.textContent=s.en||'(Chưa có script tiếng Anh)';d.append(b,en);if(showVi){const vi=document.createElement('div');vi.className='vi';vi.textContent=s.vi||'(Chưa có bản dịch tiếng Việt)';d.append(vi);}d.addEventListener('click',e=>{if(e.target===d||e.target===en||e.target.classList.contains('vi')){audio.currentTime=s.time;audio.play().catch(()=>{});}});scriptBox.append(d);});}
function updateActive(force=false){let active=null;for(const s of segments){if(s.time<=audio.currentTime)active=s;else break;}const id=active?.id??null;if(id!==activeId||force){scriptBox.querySelectorAll('.segment').forEach(el=>el.classList.toggle('active',!!id&&el.dataset.id===id));if(id&&followAudio&&Date.now()>userScrollUntil){const el=[...scriptBox.querySelectorAll('.segment')].find(x=>x.dataset.id===id);if(el){const target=el.offsetTop-scriptBox.offsetTop-scriptBox.clientHeight*.38+el.offsetHeight/2;scriptBox.scrollTo({top:Math.max(0,target),behavior:'smooth'});}}activeId=id;}}
function renderEditor(){const host=$('editorList');host.innerHTML='';$('segmentCount').textContent=`${segments.length} câu`;segments.forEach((s,i)=>{const row=document.createElement('div');row.className='edit-row';row.innerHTML=`<div class="edit-head"><strong>Câu ${i+1}</strong><button class="danger" type="button" data-remove="${i}">Xóa</button></div><div class="edit-grid"><label class="small">Thời điểm (giây)<input type="number" min="0" step="0.01" value="${Number(s.time)||0}" data-time="${i}"></label><div><label class="small">English</label><textarea data-en="${i}" autocapitalize="sentences">${esc(s.en)}</textarea><label class="small">Tiếng Việt</label><textarea data-vi="${i}">${esc(s.vi)}</textarea></div></div>`;host.append(row);});host.querySelectorAll('[data-time]').forEach(el=>el.onchange=()=>{segments[+el.dataset.time].time=Math.max(0,Number(el.value)||0);});host.querySelectorAll('[data-en]').forEach(el=>el.onchange=()=>segments[+el.dataset.en].en=el.value.trim());host.querySelectorAll('[data-vi]').forEach(el=>el.onchange=()=>segments[+el.dataset.vi].vi=el.value.trim());host.querySelectorAll('[data-remove]').forEach(el=>el.onclick=()=>{segments.splice(+el.dataset.remove,1);segments=segments.sort((a,b)=>a.time-b.time);renderEditor();});}
function getSrt(lang){return segments.map((s,i)=>`${i+1}\n${srtTime(s.time)} --> ${srtTime(segments[i+1]?.time??(s.time+3))}\n${lang==='en'?s.en:s.vi}\n`).join('\n');}
function srtTime(sec){const ms=Math.round((Number(sec)||0)*1000),h=Math.floor(ms/3600000),m=Math.floor(ms%3600000/60000),s=Math.floor(ms%60000/1000),z=ms%1000;return `${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')},${String(z).padStart(3,'0')}`;}
function collectEditor(){// flush any focused editor value before saving
$('editorList').querySelectorAll('[data-time]').forEach(el=>segments[+el.dataset.time].time=Math.max(0,Number(el.value)||0));$('editorList').querySelectorAll('[data-en]').forEach(el=>segments[+el.dataset.en].en=el.value.trim());$('editorList').querySelectorAll('[data-vi]').forEach(el=>segments[+el.dataset.vi].vi=el.value.trim());segments.sort((a,b)=>a.time-b.time);}
$('back10').onclick=()=>audio.currentTime=Math.max(0,audio.currentTime-10);$('forward10').onclick=()=>audio.currentTime=Math.min(audio.duration||Infinity,audio.currentTime+10);$('speed').onchange=e=>audio.playbackRate=Number(e.target.value);audio.addEventListener('timeupdate',()=>{$('time').textContent=`${fmt(audio.currentTime)} / ${fmt(audio.duration)}`;updateActive();});audio.addEventListener('loadedmetadata',()=>{$('time').textContent=`${fmt(audio.currentTime)} / ${fmt(audio.duration)}`;});
$('toggleVi').onclick=()=>{showVi=!showVi;$('toggleVi').textContent=showVi?'Ẩn bản dịch tiếng Việt':'Hiện bản dịch tiếng Việt';renderTranscript();updateActive(true);};$('followBtn').onclick=()=>{followAudio=true;userScrollUntil=0;$('toggleAuto').textContent='Tạm dừng tự cuộn';updateActive(true);};$('toggleAuto').onclick=()=>{followAudio=!followAudio;$('toggleAuto').textContent=followAudio?'Tạm dừng tự cuộn':'Bật tự cuộn';if(followAudio)updateActive(true);};scriptBox.addEventListener('wheel',()=>{userScrollUntil=Date.now()+5000;},{passive:true});scriptBox.addEventListener('touchstart',()=>{userScrollUntil=Date.now()+5000;},{passive:true});
// Admin login: compact button in the top-right opens a small password dialog.
function setAdminVisible(visible){isAdmin=visible;['createCard','storageCard','showCreate'].forEach(id=>$(id).classList.toggle('hidden',!visible));$('adminLogout').classList.toggle('hidden',!visible);$('openLogin').classList.toggle('hidden',visible);renderLessons();}
$('openLogin').onclick=()=>{$('loginModal').classList.remove('hidden');$('loginPassword').focus();};
$('closeLogin').onclick=()=>{$('loginModal').classList.add('hidden');$('loginStatus').textContent='';};
$('loginModal').addEventListener('click',e=>{if(e.target===$('loginModal'))$('loginModal').classList.add('hidden');});
$('adminLogin').onclick=async()=>{const p=$('loginPassword').value;if(!p){$('loginStatus').textContent='Vui lòng nhập mật khẩu quản trị.';return;}$('adminLogin').disabled=true;$('loginStatus').textContent='Đang kiểm tra…';try{const r=await fetch(`${getWorker()}/health`,{headers:{'x-admin-password':p}});const d=await r.json().catch(()=>({}));if(!r.ok||!d.ok)throw Error(d.error||`Không xác thực được (HTTP ${r.status})`);sessionStorage.setItem('listeningAdminPassword',p);$('loginPassword').value='';$('loginModal').classList.add('hidden');$('loginStatus').textContent='';setAdminVisible(true);}catch(e){$('loginStatus').textContent=`Đăng nhập thất bại: ${e.message}`;setAdminVisible(false);}finally{$('adminLogin').disabled=false;}};
$('adminLogout').onclick=()=>{sessionStorage.removeItem('listeningAdminPassword');$('loginPassword').value='';setAdminVisible(false);};
$('loginPassword').addEventListener('keydown',e=>{if(e.key==='Enter')$('adminLogin').click();});
$('showCreate').onclick=()=>{$('createCard').scrollIntoView({behavior:'smooth',block:'start'});};
$('newTitle').addEventListener('input',()=>{if(!$('newId').dataset.edited)$('newId').value=safeId($('newTitle').value);});$('newId').addEventListener('input',()=>{$('newId').dataset.edited='1';});
$('newAudio').onchange=()=>setSelectedAudio($('newAudio').files?.[0]||null);

// ===============================
// MERGE MULTIPLE AUDIO FILES TO MP3 IN THE BROWSER
// ===============================
function setSelectedAudio(file){
  selectedAudio=file;
  if(previewUrl)URL.revokeObjectURL(previewUrl);
  if(file){
    previewUrl=URL.createObjectURL(file);
    $('newAudioPreview').src=previewUrl;
    $('newAudioPreview').classList.remove('hidden');
    $('audioInfo').textContent=`${file.name} · ${(file.size/1024/1024).toFixed(2)} MB${file.size>25*1024*1024?' · Vượt giới hạn 25 MB của bước tạo script.':''}`;
  }else{
    $('newAudioPreview').removeAttribute('src');
    $('newAudioPreview').classList.add('hidden');
    $('audioInfo').textContent='Chưa chọn audio.';
  }
}
function renderMergeList(){
  const host=$('mergeList');host.innerHTML='';
  if(!mergeFiles.length){host.textContent='Chưa chọn file để ghép.';return;}
  mergeFiles.forEach((file,i)=>{
    const row=document.createElement('div');row.className='merge-item';
    const name=document.createElement('span');name.className='merge-name';name.textContent=`${i+1}. ${file.name} · ${(file.size/1024/1024).toFixed(2)} MB`;
    const up=document.createElement('button');up.type='button';up.textContent='↑';up.title='Chuyển lên';up.disabled=i===0;up.onclick=()=>{[mergeFiles[i-1],mergeFiles[i]]=[mergeFiles[i],mergeFiles[i-1]];renderMergeList();};
    const down=document.createElement('button');down.type='button';down.textContent='↓';down.title='Chuyển xuống';down.disabled=i===mergeFiles.length-1;down.onclick=()=>{[mergeFiles[i+1],mergeFiles[i]]=[mergeFiles[i],mergeFiles[i+1]];renderMergeList();};
    const remove=document.createElement('button');remove.type='button';remove.className='danger';remove.textContent='Xóa';remove.onclick=()=>{mergeFiles.splice(i,1);renderMergeList();};
    row.append(name,up,down,remove);host.append(row);
  });
}
$('mergeFiles').onchange=()=>{
  const incoming=Array.from($('mergeFiles').files||[]);
  mergeFiles.push(...incoming);
  $('mergeFiles').value='';
  renderMergeList();
};
$('clearMerge').onclick=()=>{mergeFiles=[];$('mergeFiles').value='';renderMergeList();};
$('mergeBtn').onclick=async()=>{
  const btn=$('mergeBtn');
  try{
    if(mergeFiles.length<2)throw Error('Hãy chọn ít nhất 2 file audio để ghép.');
    if(typeof lamejs==='undefined'||!lamejs.Mp3Encoder)throw Error('Không tải được bộ mã hóa MP3. Hãy kiểm tra kết nối Internet rồi tải lại trang.');
    btn.disabled=true;
    status('Đang đọc và ghép các file audio. Không đóng trang trong lúc xử lý…');
    setProgress(2);
    const AudioCtx=window.AudioContext||window.webkitAudioContext;
    if(!AudioCtx)throw Error('Trình duyệt không hỗ trợ xử lý audio. Hãy dùng Chrome hoặc Edge mới.');
    const ctx=new AudioCtx();
    const decoded=[];
    let totalFrames=0;
    for(let i=0;i<mergeFiles.length;i++){
      status(`Đang đọc file ${i+1}/${mergeFiles.length}: ${mergeFiles[i].name}`);
      const buffer=await mergeFiles[i].arrayBuffer();
      const audioBuffer=await ctx.decodeAudioData(buffer.slice(0));
      decoded.push(audioBuffer);
      totalFrames+=Math.ceil(audioBuffer.duration*44100);
      setProgress(5+35*(i+1)/mergeFiles.length);
    }
    await ctx.close();
    const left=new Float32Array(totalFrames);
    const right=new Float32Array(totalFrames);
    let offset=0;
    for(let i=0;i<decoded.length;i++){
      const b=decoded[i],len=Math.ceil(b.duration*44100);
      const channels=Math.min(2,b.numberOfChannels);
      const sourceL=b.getChannelData(0),sourceR=channels>1?b.getChannelData(1):sourceL;
      // Linear resampling to the MP3 encoder's fixed 44.1 kHz rate.
      for(let j=0;j<len;j++){
        const pos=j*b.sampleRate/44100,idx=Math.floor(pos),frac=pos-idx;
        const next=Math.min(idx+1,sourceL.length-1);
        left[offset+j]=sourceL[idx]+(sourceL[next]-sourceL[idx])*frac;
        const rnext=Math.min(idx+1,sourceR.length-1);
        right[offset+j]=sourceR[idx]+(sourceR[rnext]-sourceR[idx])*frac;
      }
      offset+=len;
      setProgress(40+25*(i+1)/decoded.length);
    }
    const encoder=new lamejs.Mp3Encoder(2,44100,128);
    const chunks=[];const frameSize=1152;
    const left16=new Int16Array(frameSize),right16=new Int16Array(frameSize);
    const toInt16=(v)=>Math.max(-1,Math.min(1,v))*32767;
    for(let start=0;start<totalFrames;start+=frameSize){
      const count=Math.min(frameSize,totalFrames-start);
      for(let j=0;j<count;j++){left16[j]=toInt16(left[start+j]);right16[j]=toInt16(right[start+j]);}
      const mp3buf=encoder.encodeBuffer(left16.subarray(0,count),right16.subarray(0,count));
      if(mp3buf.length)chunks.push(new Uint8Array(mp3buf));
      if(start%(frameSize*100)===0)setProgress(65+30*start/Math.max(1,totalFrames));
    }
    const end=encoder.flush();if(end.length)chunks.push(new Uint8Array(end));
    const mp3Blob=new Blob(chunks,{type:'audio/mpeg'});
    const titleBase=safeId($('newTitle').value||'audio-ghep')||'audio-ghep';
    const mergedFile=new File([mp3Blob],`${titleBase}-merged.mp3`,{type:'audio/mpeg',lastModified:Date.now()});
    setSelectedAudio(mergedFile);
    $('newAudio').value='';
    mergeFiles=[];renderMergeList();
    status(`Đã ghép thành công ${decoded.length} file thành một MP3. Thời lượng khoảng ${fmt(totalFrames/44100)}; dung lượng ${(mergedFile.size/1024/1024).toFixed(2)} MB. File đã được chọn để tạo transcript.`);
    setProgress(100);
  }catch(e){status(`Không ghép được audio: ${e.message}`);setProgress(0,false);}
  finally{btn.disabled=false;}
};
async function translateInBatches(items, batchSize=5){
  const output=[];
  for(let i=0;i<items.length;i+=batchSize){
    const batch=items.slice(i,i+batchSize);
    status(`Đang dịch tiếng Việt: ${Math.min(i+batch.length,items.length)}/${items.length} câu…`);
    setProgress(75 + 25*Math.min(i+batch.length,items.length)/items.length);
    const r=await fetch(`${getWorker()}/translate`,{
      method:'POST',
      headers:{'Content-Type':'application/json','x-admin-password':getPassword()},
      body:JSON.stringify({segments:batch})
    });
    const d=await r.json().catch(()=>({}));
    if(!r.ok)throw Error(d.error||`Lỗi dịch (${r.status})`);
    const translated=normalize(d.segments||[]);
    if(translated.length!==batch.length)throw Error('Số câu dịch trả về không khớp. Hãy nhấn Dịch lại tiếng Việt.');
    output.push(...translated);
  }
  return output;
}
$('transcribeBtn').onclick=async()=>{
  try{
    const title=$('newTitle').value.trim(),id=safeId($('newId').value||title);
    if(!title||!id)throw Error('Nhập tên bài học và mã bài.');
    if(!selectedAudio)throw Error('Chọn file audio từ iPhone trước.');
    if(selectedAudio.size>25*1024*1024)throw Error('Audio vượt giới hạn 25 MB của dịch vụ nhận dạng. Hãy nén hoặc chia audio thành các phần nhỏ hơn.');
    if(!getPassword())throw Error('Vui lòng đăng nhập quản trị trước.');
    status('Đang nhận dạng tiếng Anh bằng Whisper. Vui lòng giữ trang mở…');
    setProgress(10);$('transcribeBtn').disabled=true;
    const fd=new FormData();fd.append('audio',selectedAudio,selectedAudio.name);
    const res=await fetch(`${getWorker()}/transcribe`,{method:'POST',headers:{'x-admin-password':getPassword()},body:fd});
    const data=await res.json().catch(()=>({}));
    if(!res.ok)throw Error(data.error||`Lỗi nhận dạng (${res.status})`);
    segments=normalize(data.segments||[]);
    if(!segments.length)throw Error('Whisper không trả về transcript tiếng Anh.');
    // Preserve the English transcript first, then translate in separate Worker invocations.
    renderEditor();$('editorSection').classList.remove('hidden');renderTranscript();
    status(`Đã nhận dạng ${segments.length} câu tiếng Anh. Bắt đầu dịch từng câu riêng biệt…`);
    setProgress(75);
    const translated=[];
    for(let i=0;i<segments.length;i+=1){
      const batch=segments.slice(i,i+1);
      status(`Đang dịch tiếng Việt: ${Math.min(i+batch.length,segments.length)}/${segments.length} câu…`);
      setProgress(75+25*Math.min(i+batch.length,segments.length)/segments.length);
      const r=await fetch(`${getWorker()}/translate`,{
        method:'POST',
        headers:{'Content-Type':'application/json','x-admin-password':getPassword()},
        body:JSON.stringify({segments:batch})
      });
      const d=await r.json().catch(()=>({}));
      if(!r.ok)throw Error(d.error||`Lỗi dịch (${r.status})`);
      const got=normalize(d.segments||[]);
      if(got.length!==batch.length)throw Error('Số câu dịch trả về không khớp.');
      translated.push(...got);
      segments=segments.map((s,index)=>index<i+batch.length?{...s,vi:translated[index].vi}:s);
      renderEditor();renderTranscript();
    }
    status(`Hoàn tất: ${segments.length} câu tiếng Anh và bản dịch tiếng Việt. Kiểm tra rồi nhấn Lưu bài học lên GitHub.`);
    setProgress(100);
    $('editorSection').scrollIntoView({behavior:'smooth',block:'start'});
  }catch(e){
    status(`Không tạo được transcript hoặc dịch: ${e.message}`);
    setProgress(0,false);
  }finally{$('transcribeBtn').disabled=false;}
};
$('addSegment').onclick=()=>{const last=segments.at(-1);segments.push({id:String(Date.now()),time:last?last.time+3:0,en:'',vi:''});renderEditor();};
$('translateBtn').onclick=async()=>{
  try{
    collectEditor();
    if(!segments.length)throw Error('Chưa có transcript để dịch.');
    if(segments.some(s=>!s.en.trim()))throw Error('Có câu chưa có nội dung tiếng Anh.');
    $('translateBtn').disabled=true;
    const translated=[];
    for(let i=0;i<segments.length;i+=1){
      const batch=segments.slice(i,i+1);
      status(`Đang dịch lại tiếng Việt: ${Math.min(i+batch.length,segments.length)}/${segments.length} câu…`);
      const r=await fetch(`${getWorker()}/translate`,{
        method:'POST',
        headers:{'Content-Type':'application/json','x-admin-password':getPassword()},
        body:JSON.stringify({segments:batch})
      });
      const d=await r.json().catch(()=>({}));
      if(!r.ok)throw Error(d.error||`Lỗi dịch (${r.status})`);
      const got=normalize(d.segments||[]);
      if(got.length!==batch.length)throw Error('Số câu dịch trả về không khớp.');
      translated.push(...got);
      segments=segments.map((s,index)=>index<i+batch.length?{...s,vi:translated[index].vi}:s);
    }
    renderEditor();renderTranscript();
    status(`Đã dịch lại ${segments.length} câu tiếng Việt. Kiểm tra rồi nhấn Lưu bài học lên GitHub.`);
  }catch(e){status(`Không dịch được: ${e.message}`);}
  finally{$('translateBtn').disabled=false;}
};
$('downloadJson').onclick=()=>{collectEditor();download('transcript.json',JSON.stringify(segments,null,2));};$('downloadSrt').onclick=()=>{collectEditor();download('english.srt',getSrt('en'),'text/plain');download('vietnamese.srt',getSrt('vi'),'text/plain');};$('clearDraft').onclick=()=>{if(!confirm('Xóa nội dung bài học đang tạo?'))return;segments=[];$('editorSection').classList.add('hidden');$('newTitle').value='';$('newId').value='';$('newId').dataset.edited='';$('newAudio').value='';selectedAudio=null;mergeFiles=[];if($('mergeFiles'))$('mergeFiles').value='';if($('mergeList'))renderMergeList();if(previewUrl)URL.revokeObjectURL(previewUrl);previewUrl=null;$('newAudioPreview').classList.add('hidden');status('Đã xóa bản nháp.');};
$('publishBtn').onclick=async()=>{try{collectEditor();const title=$('newTitle').value.trim(),id=safeId($('newId').value||title);if(!title||!id||!selectedAudio)throw Error('Thiếu tên bài, mã bài hoặc file audio.');if(!segments.length)throw Error('Chưa có transcript.');if(segments.some(s=>!s.en.trim()))throw Error('Có câu chưa có nội dung tiếng Anh.');if(!getPassword())throw Error('Vui lòng đăng nhập quản trị trước.');$('publishBtn').disabled=true;status('Đang upload audio, transcript và cập nhật danh sách bài học lên GitHub…');const fd=new FormData();fd.append('title',title);fd.append('id',id);fd.append('audio',selectedAudio,selectedAudio.name);fd.append('transcript',JSON.stringify(segments));const r=await fetch(`${getWorker()}/publish`,{method:'POST',headers:{'x-admin-password':getPassword()},body:fd});const d=await r.json().catch(()=>({}));if(!r.ok)throw Error(d.error||`GitHub upload lỗi (${r.status})`);status(`Đã lưu bài học lên GitHub thành công. Commit: ${d.commit||'đã tạo'}. Trang có thể cần 1–2 phút để cập nhật.`);const entry={id,title,audio:d.audio,transcript:d.transcript};const i=lessons.findIndex(x=>x.id===id);if(i>=0)lessons[i]=entry;else lessons.push(entry);currentLesson=entry;renderLessons();}catch(e){status(`Không lưu được: ${e.message}`);}finally{$('publishBtn').disabled=false;}};
function loadConfig(){setAdminVisible(false);}
async function init(){loadConfig();try{const r=await fetch('data/lessons.json',{cache:'no-store'});if(!r.ok)throw Error('Không tải được data/lessons.json');lessons=await r.json();if(!Array.isArray(lessons))throw Error('Định dạng lessons.json không hợp lệ');if(lessons.length)await loadLesson(lessons[0].id);else{$('lessonTitle').textContent='Chưa có bài học';scriptBox.textContent='Tạo bài học mới ở bên dưới.';}renderLessons();}catch(e){$('lessonTitle').textContent='Chưa tải được danh sách bài học';scriptBox.textContent='Kiểm tra data/lessons.json và GitHub Pages.';console.error(e);}}
init();
