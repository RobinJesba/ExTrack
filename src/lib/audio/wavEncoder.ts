/**
 * Lossless 16-bit PCM Stereo WAV Encoder and File Downloader
 * Encodes Web Audio AudioBuffer to universal standard RIFF WAV format in memory.
 */

export function audioBufferToWav(buffer: AudioBuffer): Blob {
  const numChannels = buffer.numberOfChannels;
  const sampleRate = buffer.sampleRate;
  const length = buffer.length;
  const bytesPerSample = 2; // 16-bit PCM
  const blockAlign = numChannels * bytesPerSample;
  const byteRate = sampleRate * blockAlign;
  const dataSize = length * blockAlign;
  const headerSize = 44;
  const totalSize = headerSize + dataSize;

  const arrayBuffer = new ArrayBuffer(totalSize);
  const view = new DataView(arrayBuffer);

  const writeString = (offset: number, str: string) => {
    for (let i = 0; i < str.length; i++) {
      view.setUint8(offset + i, str.charCodeAt(i));
    }
  };

  // RIFF identifier
  writeString(0, 'RIFF');
  // RIFF chunk length (total size - 8)
  view.setUint32(4, 36 + dataSize, true);
  // RIFF type
  writeString(8, 'WAVE');

  // "fmt " sub-chunk
  writeString(12, 'fmt ');
  view.setUint32(16, 16, true); // Subchunk1Size (16 for PCM)
  view.setUint16(20, 1, true); // AudioFormat (1 = PCM)
  view.setUint16(22, numChannels, true); // NumChannels
  view.setUint32(24, sampleRate, true); // SampleRate
  view.setUint32(28, byteRate, true); // ByteRate
  view.setUint16(32, blockAlign, true); // BlockAlign
  view.setUint16(34, 16, true); // BitsPerSample (16-bit)

  // "data" sub-chunk
  writeString(36, 'data');
  view.setUint32(40, dataSize, true); // Subchunk2Size

  // Interleave and quantize channel data to 16-bit PCM
  const channelData: Float32Array[] = [];
  for (let ch = 0; ch < numChannels; ch++) {
    channelData.push(buffer.getChannelData(ch));
  }

  let offset = 44;
  for (let i = 0; i < length; i++) {
    for (let ch = 0; ch < numChannels; ch++) {
      let sample = channelData[ch][i];
      // Hard clamp between -1.0 and 1.0 to avoid wrap-around clicks
      sample = Math.max(-1, Math.min(1, sample));
      // Scale to signed 16-bit integer (-32768 to 32767)
      const intSample = sample < 0 ? sample * 0x8000 : sample * 0x7fff;
      view.setInt16(offset, Math.floor(intSample), true);
      offset += 2;
    }
  }

  return new Blob([arrayBuffer], { type: 'audio/wav' });
}

export function triggerFileDownload(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.style.display = 'none';
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  setTimeout(() => {
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }, 1500);
}

export function generateExportFilename({
  artist,
  title,
  bpm,
  key,
  stemsConfig,
  isLoop,
}: {
  artist?: string | null;
  title?: string | null;
  bpm: number;
  key: string;
  stemsConfig?: Record<string, { volume: number; muted: boolean; soloed: boolean; pan?: number }>;
  isLoop?: boolean;
}): string {
  const cleanTitle = (title || 'Track').trim();
  const cleanArtist = (artist || '').trim();

  let stemsTag = '';
  if (stemsConfig) {
    const entries = Object.entries(stemsConfig);
    const soloed = entries.filter(([, c]) => c.soloed).map(([name]) => name);
    const muted = entries.filter(([, c]) => c.muted).map(([name]) => name);

    if (soloed.length > 0) {
      stemsTag = ` [Solo ${soloed.map(capitalize).join(', ')}]`;
    } else if (muted.length > 0 && muted.length < entries.length) {
      stemsTag = ` [No ${muted.map(capitalize).join(', ')}]`;
    }
  }

  const loopTag = isLoop ? ' [Loop]' : '';
  const prefix = cleanArtist ? `${cleanArtist} - ${cleanTitle}` : cleanTitle;
  const rawFilename = `${prefix} (${bpm}BPM, ${key})${stemsTag}${loopTag}.wav`;

  return rawFilename.replace(/[/\\?%*:|"<>]/g, '-');
}

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}
