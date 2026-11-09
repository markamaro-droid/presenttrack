/* Large uploads use private temporary storage; reports are saved separately. */
(() => {
  const captures = new Set();
  class Capture {
    constructor() { this.chunks = []; this.cancelled = false; }
    async start() {
      if (this.recorder) { if (this.recorder.state === 'paused') this.recorder.resume(); return; }
      if (!navigator.mediaDevices?.getUserMedia || !window.MediaRecorder) throw new Error('Audio recording is unavailable in this browser.');
      captures.add(this);
      window.PTVoice?.stop('Microphone off while practice recording is in use.');
      let stream;
      try { stream = await navigator.mediaDevices.getUserMedia({ audio: true }); }
      catch (error) { captures.delete(this); throw error; }
      if (this.cancelled) { stream.getTracks().forEach(t => t.stop()); throw new Error('Recording cancelled.'); }
      this.stream = stream;
      const mimeType = ['audio/webm;codecs=opus','audio/mp4','audio/ogg'].find(t => MediaRecorder.isTypeSupported(t));
      try { this.recorder = new MediaRecorder(stream, { ...(mimeType ? { mimeType } : {}), audioBitsPerSecond: 24000 }); }
      catch(e) { this.dispose(); throw e; }
      this.recorder.ondataavailable = e => { if (e.data.size) this.chunks.push(e.data); };
      try { this.recorder.start(1000); } catch (error) { this.dispose(); throw error; }
    }
    pause() { if (this.recorder?.state === 'recording') this.recorder.pause(); }
    async finish() {
      if (this.blob) return this.blob;
      if (!this.recorder || this.recorder.state === 'inactive') throw new Error('Start recording first.');
      try { await new Promise((resolve, reject) => { this.recorder.onstop = resolve; this.recorder.onerror = () => reject(new Error('Recording failed.')); this.recorder.stop(); }); }
      finally { this.stream.getTracks().forEach(t => t.stop()); captures.delete(this); }
      this.blob = new Blob(this.chunks, { type: this.recorder.mimeType }); this.chunks = [];
      return this.blob;
    }
    dispose() { this.cancelled = true; captures.delete(this); if (this.recorder?.state !== 'inactive') { try { this.recorder?.stop(); } catch {} } this.stream?.getTracks().forEach(t => t.stop()); this.chunks = []; this.blob = null; }
  }
  async function analyze(blob, target, signal, onStatus = () => {}, presentation) {
    if (!blob.size || blob.size > 25000000) throw new Error('Choose a nonempty recording up to 25 MB and 10 minutes.');
    const session = await window.PTCloud?.client?.auth.getSession();
    if (!session?.data?.session) throw new Error('Sign in to analyze practice recordings.');
    const raw = blob.type.split(';')[0];
    const mime = ({ 'audio/x-m4a':'audio/mp4','audio/x-wav':'audio/wav','audio/wave':'audio/wav' })[raw] || raw || ({ mp3:'audio/mpeg',m4a:'audio/mp4',wav:'audio/wav',ogg:'audio/ogg',webm:'audio/webm',mp4:'video/mp4' })[blob.name?.split('.').pop()?.toLowerCase()];
    if (!['audio/webm','audio/mp4','audio/mpeg','audio/wav','audio/ogg','video/mp4','video/webm'].includes(mime)) throw new Error('Choose MP3, M4A, WAV, OGG, WebM or MP4 audio.');
    let storagePath;
    const bucket = window.PTCloud.client.storage?.from('practice-audio-temp');
    try {
    signal?.throwIfAborted();
    const payload = { mime, target, consent:true };
    if (presentation?.text) payload.presentation = {title:String(presentation.title||'').slice(0,160),text:String(presentation.text).slice(0,20000)};
    if (blob.size > 3000000) {
      if (!bucket) throw new Error('Large uploads are not configured yet.');
      storagePath = session.data.session.user.id + '/' + crypto.randomUUID();
      onStatus('Uploading recording to private temporary storage...');
      const upload = await bucket.upload(storagePath, blob, { contentType: mime, upsert: false });
      if (upload.error) throw new Error('Large recording upload failed. Check your connection or contact the site owner if this keeps happening.');
      payload.storagePath = storagePath;
    } else {
      const bytes = new Uint8Array(await blob.arrayBuffer()); let binary = '';
      for (let i=0;i<bytes.length;i+=8192) binary += String.fromCharCode(...bytes.subarray(i,i+8192));
      payload.audio = btoa(binary);
    }
    signal?.throwIfAborted();
    const beforeSend = await window.PTCloud.client.auth.getSession();
    if (beforeSend?.data?.session?.user?.id !== session.data.session.user.id) throw new Error('The signed-in account changed. Please start again.');
    onStatus('Transcribing and analyzing your recording...');
    const response = await fetch('/api/practice', { method:'POST', signal, headers: { 'Content-Type':'application/json', Authorization:'Bearer '+beforeSend.data.session.access_token }, body: JSON.stringify(payload) });
    const result = await response.json(); if (!response.ok) throw new Error(result.message || 'Analysis failed.');
    const current = await window.PTCloud.client.auth.getSession();
    if (current?.data?.session?.user?.id !== session.data.session.user.id) throw new Error('The signed-in account changed. Please start again.');
    return result;
    } finally {
      if (storagePath) {
        try { await bucket.remove([storagePath]); } catch { /* Server also attempts cleanup. */ }
      }
    }
  }
  window.PTPracticeAudio = { Capture, analyze, get capturing() { return captures.size > 0; } };
  addEventListener('pagehide', () => window.podium?.practiceCleanup?.());
})();
