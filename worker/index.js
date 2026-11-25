const MAX_AUDIO = 25 * 1024 * 1024;
const MAX_TRANSLATION_CALLS = 40;
const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type,x-admin-password'
};
const json = (data, status = 200) => new Response(JSON.stringify(data), {
  status,
  headers: { ...cors, 'Content-Type': 'application/json; charset=utf-8' }
});

function b64(bytes) {
  let binary = '';
  const step = 0x8000;
  for (let i = 0; i < bytes.length; i += step) binary += String.fromCharCode(...bytes.subarray(i, i + step));
  return btoa(binary);
}
function fromB64(s) {
  const bin = atob(String(s || '').replace(/\s/g, ''));
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return new TextDecoder().decode(bytes);
}
function safeId(s) {
  return String(s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 70);
}
function safeName(s) {
  const ext = (String(s || 'audio.mp3').match(/\.([a-z0-9]{2,6})$/i) || [])[1] || 'mp3';
  return `audio.${ext.toLowerCase()}`;
}

function parseVtt(vtt) {
  if (!vtt) return [];
  const blocks = String(vtt).replace(/^WEBVTT[^\n]*\n/i, '').split(/\n\s*\n/);
  const out = [];
  for (const block of blocks) {
    const lines = block.split(/\r?\n/).map(x => x.trim()).filter(Boolean);
    const timing = lines.find(x => x.includes('-->'));
    if (!timing) continue;
    const stamp = timing.split('-->')[0].trim();
    const parts = stamp.split(':').map(Number);
    let seconds = 0;
    if (parts.length === 3) seconds = parts[0] * 3600 + parts[1] * 60 + parts[2];
    else if (parts.length === 2) seconds = parts[0] * 60 + parts[1];
    const text = lines.slice(lines.indexOf(timing) + 1).join(' ').replace(/<[^>]+>/g, '').trim();
    if (text) out.push({ time: seconds, en: text });
  }
  return out;
}

async function translateBatch(batch, env) {
  // A single model invocation translates a small group, instead of one invocation per sentence.
  // Markers preserve the mapping back to each original timestamped segment.
  const input = batch.map((item, i) => `[[${i + 1}]] ${item.en}`).join('\n');
  const result = await env.AI.run('@cf/meta/m2m100-1.2b', {
    text: input,
    source_lang: 'english',
    target_lang: 'vietnamese'
  });
  const translated = String(result?.translated_text || result?.translation || '').trim();
  if (!translated) throw new Error('Workers AI không trả về bản dịch tiếng Việt.');

  const markerRegex = /\[\[(\d+)\]\]\s*([\s\S]*?)(?=\[\[\d+\]\]|$)/g;
  const found = new Map();
  let match;
  while ((match = markerRegex.exec(translated)) !== null) {
    const idx = Number(match[1]) - 1;
    if (idx >= 0 && idx < batch.length) found.set(idx, match[2].trim());
  }
  // Fallback for model outputs that remove marker tokens but preserve line order.
  if (found.size !== batch.length) {
    const lines = translated.split(/\r?\n/).map(x => x.replace(/^\s*(?:\d+[.)]|[-*])\s*/, '').trim()).filter(Boolean);
    if (lines.length === batch.length) return lines;
  }
  return batch.map((_, i) => found.get(i) || '');
}

async function translateSegments(segments, env) {
  // Keep batches below the model context limit and cap calls below Workers' per-invocation subrequest ceiling.
  const batches = [];
  let current = [], chars = 0;
  for (const segment of segments) {
    const size = segment.en.length + 16;
    if (current.length && (current.length >= 20 || chars + size > 2600)) {
      batches.push(current); current = []; chars = 0;
    }
    current.push(segment); chars += size;
  }
  if (current.length) batches.push(current);
  if (batches.length > MAX_TRANSLATION_CALLS) {
    throw new Error(`Transcript có ${segments.length} câu, cần ${batches.length} lượt dịch. Hãy chia audio thành các phần ngắn hơn (tối đa khoảng ${MAX_TRANSLATION_CALLS * 20} câu mỗi lần).`);
  }
  // Sequential calls reduce concurrent pressure and keep request usage predictable.
  for (const batch of batches) {
    const translations = await translateBatch(batch, env);
    batch.forEach((segment, i) => { segment.vi = translations[i] || ''; });
  }
}

async function transcribe(request, env) {
  if (!env.AI) throw new Error('Worker chưa có AI binding. Trong Settings > Bindings, thêm Workers AI với tên biến AI.');
  const form = await request.formData();
  const file = form.get('audio');
  if (!(file instanceof File)) throw new Error('Không nhận được file audio.');
  if (!file.size) throw new Error('File audio rỗng.');
  if (file.size > MAX_AUDIO) throw new Error('Audio vượt giới hạn 25 MB.');

  const bytes = new Uint8Array(await file.arrayBuffer());
  const audioBase64 = b64(bytes);
  const result = await env.AI.run('@cf/openai/whisper-large-v3-turbo', {
    audio: audioBase64,
    task: 'transcribe',
    language: 'english',
    vad_filter: true
  });

  let raw = Array.isArray(result?.segments)
    ? result.segments.filter(x => String(x.text || '').trim()).map(x => ({ time: Number(x.start) || 0, en: String(x.text).trim(), vi: '' }))
    : [];
  if (!raw.length && result?.vtt) raw = parseVtt(result.vtt).map(x => ({ ...x, vi: '' }));
  if (!raw.length && result?.text) raw = [{ time: 0, en: String(result.text).trim(), vi: '' }];
  if (!raw.length) throw new Error('Whisper không trả về nội dung nhận dạng.');

  await translateSegments(raw, env);
  const segments = raw.map((x, i) => ({ id: String(i + 1), time: Number(x.time) || 0, en: x.en, vi: x.vi || '' }));
  return json({ segments, duration: result?.transcription_info?.duration || result?.duration || null, language: result?.transcription_info?.language || 'en' });
}

async function translateOnly(request, env) {
  if (!env.AI) throw new Error('Worker chưa có AI binding.');
  const body = await request.json().catch(() => ({}));
  if (!Array.isArray(body.segments) || !body.segments.length) throw new Error('Không có câu nào để dịch.');
  const segments = body.segments.map((x, i) => ({ id: String(x.id ?? i + 1), time: Number(x.time) || 0, en: String(x.en || '').trim(), vi: String(x.vi || '') }));
  if (segments.some(x => !x.en)) throw new Error('Có câu chưa có nội dung tiếng Anh.');
  await translateSegments(segments, env);
  return json({ segments });
}

async function githubRequest(path, env, options = {}) {
  const url = `https://api.github.com/repos/${env.GITHUB_OWNER}/${env.GITHUB_REPO}/contents/${path.split('/').map(encodeURIComponent).join('/')}`;
  const r = await fetch(url, {
    ...options,
    headers: {
      Accept: 'application/vnd.github+json',
      Authorization: `Bearer ${env.GITHUB_TOKEN}`,
      'X-GitHub-Api-Version': '2022-11-28',
      'User-Agent': 'english-listening-worker',
      ...(options.headers || {})
    }
  });
  const data = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(data.message || `GitHub API error ${r.status} at ${path}`);
  return data;
}
async function putFile(path, bytes, message, env) {
  let sha;
  try { const old = await githubRequest(path, env); sha = old.sha; }
  catch (e) { if (!String(e.message).includes('Not Found')) throw e; }
  const body = { message, content: b64(bytes), branch: env.GITHUB_BRANCH || 'main' };
  if (sha) body.sha = sha;
  return githubRequest(path, env, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
}

async function publish(request, env) {
  for (const k of ['GITHUB_TOKEN', 'GITHUB_OWNER', 'GITHUB_REPO']) if (!env[k]) throw new Error(`Worker thiếu cấu hình ${k}.`);
  const form = await request.formData();
  const title = String(form.get('title') || '').trim();
  const id = safeId(form.get('id') || title);
  const file = form.get('audio');
  const transcriptText = String(form.get('transcript') || '');
  if (!title || !id) throw new Error('Tên bài hoặc mã bài không hợp lệ.');
  if (!(file instanceof File) || !file.size) throw new Error('Không nhận được file audio.');
  if (file.size > MAX_AUDIO) throw new Error('Audio vượt giới hạn 25 MB cho thao tác này.');
  let transcript;
  try { transcript = JSON.parse(transcriptText); } catch { throw new Error('Transcript JSON không hợp lệ.'); }
  if (!Array.isArray(transcript) || !transcript.length) throw new Error('Transcript đang trống.');
  const base = `lessons/${id}`;
  const audioPath = `${base}/${safeName(file.name)}`;
  const transcriptPath = `${base}/transcript.json`;
  const audioBytes = new Uint8Array(await file.arrayBuffer());
  const transBytes = new TextEncoder().encode(JSON.stringify(transcript, null, 2));
  await putFile(audioPath, audioBytes, `Add/update listening audio: ${title}`, env);
  await putFile(transcriptPath, transBytes, `Add/update transcript: ${title}`, env);

  let list = [], sha;
  try {
    const old = await githubRequest('data/lessons.json', env);
    sha = old.sha; list = JSON.parse(fromB64(old.content));
    if (!Array.isArray(list)) list = [];
  } catch (e) { if (!String(e.message).includes('Not Found')) throw e; }
  const entry = { id, title, audio: audioPath, transcript: transcriptPath };
  const at = list.findIndex(x => x.id === id);
  if (at >= 0) list[at] = entry; else list.push(entry);
  const body = {
    message: `Add/update listening lesson: ${title}`,
    content: b64(new TextEncoder().encode(JSON.stringify(list, null, 2))),
    branch: env.GITHUB_BRANCH || 'main'
  };
  if (sha) body.sha = sha;
  const saved = await githubRequest('data/lessons.json', env, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  return json({ ok: true, id, audio: audioPath, transcript: transcriptPath, commit: saved.commit?.sha || null });
}

async function renameLesson(request, env) {
  for (const k of ['GITHUB_TOKEN', 'GITHUB_OWNER', 'GITHUB_REPO']) if (!env[k]) throw new Error(`Worker thiếu cấu hình ${k}.`);
  const bodyIn = await request.json().catch(() => ({}));
  const id = safeId(bodyIn.id), title = String(bodyIn.title || '').trim();
  if (!id || !title) throw new Error('Thiếu mã bài học hoặc tên mới.');
  const old = await githubRequest('data/lessons.json', env);
  const list = JSON.parse(fromB64(old.content));
  if (!Array.isArray(list)) throw new Error('Danh sách bài học không hợp lệ.');
  const at = list.findIndex(x => x.id === id);
  if (at < 0) throw new Error('Không tìm thấy bài học cần đổi tên.');
  list[at] = { ...list[at], title };
  const saved = await githubRequest('data/lessons.json', env, {
    method: 'PUT', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ message: `Rename listening lesson: ${title}`, content: b64(new TextEncoder().encode(JSON.stringify(list, null, 2))), sha: old.sha, branch: env.GITHUB_BRANCH || 'main' })
  });
  return json({ ok: true, id, title, commit: saved.commit?.sha || null });
}

export default {
  async fetch(request, env) {
    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });
    const url = new URL(request.url);
    if (url.pathname === '/health' && request.method === 'GET') {
      if (request.headers.get('x-admin-password') !== env.ADMIN_PASSWORD) return json({ error: 'Mật khẩu quản trị không đúng.' }, 401);
      return json({ ok: true, service: 'english-listening-worker', ai: !!env.AI });
    }
    if (!env.ADMIN_PASSWORD || request.headers.get('x-admin-password') !== env.ADMIN_PASSWORD) return json({ error: 'Mật khẩu quản trị không đúng hoặc Worker chưa cấu hình ADMIN_PASSWORD.' }, 401);
    try {
      if (url.pathname === '/transcribe' && request.method === 'POST') return await transcribe(request, env);
      if (url.pathname === '/translate' && request.method === 'POST') return await translateOnly(request, env);
      if (url.pathname === '/publish' && request.method === 'POST') return await publish(request, env);
      if (url.pathname === '/rename' && request.method === 'POST') return await renameLesson(request, env);
      return json({ error: 'Endpoint không tồn tại.' }, 404);
    } catch (e) {
      return json({ error: e?.message || 'Lỗi không xác định.' }, 400);
    }
  }
};
