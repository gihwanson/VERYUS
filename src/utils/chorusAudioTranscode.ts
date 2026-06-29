const UPLOAD_SAMPLE_RATE = 44_100;

function writeString(view: DataView, offset: number, text: string): void {
  for (let i = 0; i < text.length; i++) {
    view.setUint8(offset + i, text.charCodeAt(i));
  }
}

function mixDownToMono(buffer: AudioBuffer): Float32Array {
  const { length, numberOfChannels } = buffer;
  const mono = new Float32Array(length);
  for (let ch = 0; ch < numberOfChannels; ch++) {
    const data = buffer.getChannelData(ch);
    for (let i = 0; i < length; i++) {
      mono[i] += data[i] / numberOfChannels;
    }
  }
  return mono;
}

function encodeMonoPcmWav(samples: Float32Array, sampleRate: number): Blob {
  const bitDepth = 16;
  const dataLength = samples.length * (bitDepth / 8);
  const arrayBuffer = new ArrayBuffer(44 + dataLength);
  const view = new DataView(arrayBuffer);

  writeString(view, 0, 'RIFF');
  view.setUint32(4, 36 + dataLength, true);
  writeString(view, 8, 'WAVE');
  writeString(view, 12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, bitDepth, true);
  writeString(view, 36, 'data');
  view.setUint32(40, dataLength, true);

  let offset = 44;
  for (let i = 0; i < samples.length; i++) {
    const clamped = Math.max(-1, Math.min(1, samples[i]));
    view.setInt16(offset, clamped < 0 ? clamped * 0x8000 : clamped * 0x7fff, true);
    offset += 2;
  }

  return new Blob([arrayBuffer], { type: 'audio/wav' });
}

async function resampleMono(samples: Float32Array, fromRate: number, toRate: number): Promise<Float32Array> {
  if (fromRate === toRate) return samples;

  const Ctx = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!Ctx) return samples;

  const ctx = new Ctx();
  try {
    const buffer = ctx.createBuffer(1, samples.length, fromRate);
    buffer.copyToChannel(samples, 0);

    const offline = new OfflineAudioContext(1, Math.ceil((samples.length / fromRate) * toRate), toRate);
    const source = offline.createBufferSource();
    source.buffer = buffer;
    source.connect(offline.destination);
    source.start(0);
    const rendered = await offline.startRendering();
    return rendered.getChannelData(0).slice();
  } finally {
    await ctx.close();
  }
}

/** WebM/OGG 등 호환성 낮은 포맷 → 모든 기기에서 재생 가능한 WAV */
export async function transcodeChorusBlobToWav(blob: Blob): Promise<Blob> {
  const Ctx = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!Ctx) throw new Error('AUDIO_CONTEXT_UNAVAILABLE');

  const ctx = new Ctx();
  try {
    const arrayBuffer = await blob.arrayBuffer();
    const decoded = await ctx.decodeAudioData(arrayBuffer.slice(0));
    const mono = mixDownToMono(decoded);
    const resampled = await resampleMono(mono, decoded.sampleRate, UPLOAD_SAMPLE_RATE);
    return encodeMonoPcmWav(resampled, UPLOAD_SAMPLE_RATE);
  } finally {
    await ctx.close();
  }
}

function isBrowserNativeUploadFormat(blob: Blob): boolean {
  const type = (blob.type || '').toLowerCase();
  return (
    type.includes('wav') ||
    type.includes('mpeg') ||
    type.includes('mp3') ||
    type.includes('mp4') ||
    type.includes('m4a') ||
    type.includes('aac')
  );
}

function extensionForBlob(blob: Blob, fileName?: string): string {
  const type = (blob.type || '').toLowerCase();
  const lowerName = (fileName || '').toLowerCase();
  if (type.includes('wav') || lowerName.endsWith('.wav')) return 'wav';
  if (type.includes('mpeg') || type.includes('mp3') || lowerName.endsWith('.mp3')) return 'mp3';
  if (type.includes('mp4') || type.includes('m4a') || lowerName.endsWith('.m4a') || lowerName.endsWith('.mp4')) {
    return 'm4a';
  }
  if (type.includes('webm') || lowerName.endsWith('.webm')) return 'webm';
  if (type.includes('ogg') || lowerName.endsWith('.ogg')) return 'ogg';
  return 'webm';
}

/** 업로드 직전 — iOS·Android 모두 재생 가능한 형식으로 정규화 */
export async function prepareChorusAudioForUpload(
  blob: Blob,
  fileName?: string
): Promise<{ blob: Blob; extension: string }> {
  if (blob instanceof File && isBrowserNativeUploadFormat(blob)) {
    return { blob, extension: extensionForBlob(blob, fileName || blob.name) };
  }

  if (isBrowserNativeUploadFormat(blob)) {
    return { blob, extension: extensionForBlob(blob, fileName) };
  }

  try {
    const wavBlob = await transcodeChorusBlobToWav(blob);
    return { blob: wavBlob, extension: 'wav' };
  } catch {
    return { blob, extension: extensionForBlob(blob, fileName) };
  }
}
