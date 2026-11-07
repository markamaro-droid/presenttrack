/* Audio stays in memory until submitted; only the analyzed report is persisted. */
(() => {
  class Capture {
    constructor() { this.chunks = []; this.cancelled = false; }
    async start() {
      if (this.recorder) { if (this.recorder.state === 'paused') this.recorder.resume(); return; }
      if (!navigator.mediaDevices?.getUserMedia || !window.MediaRecorder) throw new Error('Audio recording is unavailable in this browser.');
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      if (this.cancelled) { stream.getTracks().forEach(t => t.stop()); throw new Error('Recording cancelled.'); }
      this.stream = stream;
      const mimeType = ['audio/webm;codecs=opus','audio/mp4','audio/ogg'].find(t => MediaRecorder.isTypeSupported(t));
      try { this.recorder = new MediaRecorder(stream, { ...(mimeType ? { mimeType } : {}), audioBitsPerSecond: 24000 }); }
      catch(e) { this.dispose(); throw e; }
      this.recorder.ondataavailable = e => { if (e.data.size) this.chunks.push(e.data); };
      this.recorder.start(1000);
    }
    pause() { if (this.recorder?.state === 'recording') this.recorder.pause(); }
    async finish() {
      if (this.blob) return this.blob;
      if (!this.recorder || this.recorder.state === 'inactive') throw new Error('Start recording first.');
      try { await new Promise((resolve, reject) => { this.recorder.onstop = resolve; this.recorder.onerror = () => reject(new Error('Recording failed.')); this.recorder.stop(); }); }
      finally { this.stream.getTracks().forEach(t => t.stop()); }
      this.blob = new Blob(this.chunks, { type: this.recorder.mimeType }); this.chunks = [];
      return this.blob;
    }
    dispose() { this.cancelled = true; if (this.recorder?.state !== 'inactive') { try { this.recorder?.stop(); } catch {} } this.stream?.getTracks().forEach(t => t.stop()); this.chunks = []; this.blob = null; }
  }
  async function analyze(blob, target, signal) {
    if (blob.size > 3000000) throw new Error('Use a recording under 3 MB and 10 minutes.');
    const session = await window.PTCloud?.client?.auth.getSession();
    if (!session?.data?.session) throw new Error('Sign in to analyze practice recordings.');
    const bytes = new Uint8Array(await blob.arrayBuffer()); let binary = '';
    for (let i=0;i<bytes.length;i+=8192) binary += String.fromCharCode(...bytes.subarray(i,i+8192));
    const raw = blob.type.split(';')[0];
    const mime = ({ 'audio/x-m4a':'audio/mp4','audio/x-wav':'audio/wav','audio/wave':'audio/wav' })[raw] || raw || ({ mp3:'audio/mpeg',m4a:'audio/mp4',wav:'audio/wav',ogg:'audio/ogg',webm:'audio/webm',mp4:'video/mp4' })[blob.name?.split('.').pop()?.toLowerCase()];
    const response = await fetch('/api/practice', { method:'POST', signal, headers: { 'Content-Type':'application/json', Authorization:'Bearer '+session.data.session.access_token }, body: JSON.stringify({ audio:btoa(binary), mime, target, consent:true }) });
    const result = await response.json(); if (!response.ok) throw new Error(result.message || 'Analysis failed.');
    const current = await window.PTCloud.client.auth.getSession();
    if (current?.data?.session?.user?.id !== session.data.session.user.id) throw new Error('The signed-in account changed. Please start again.');
    return result;
  }
  window.PTPracticeAudio = { Capture, analyze };
  addEventListener('pagehide', () => window.podium?.practiceCleanup?.());
})();
