/** Averages every channel of a decoded audio buffer down to a single mono track. */
export function downmixToMono(buffer: AudioBuffer): Float32Array {
  const mono = new Float32Array(buffer.length)
  for (let channel = 0; channel < buffer.numberOfChannels; channel++) {
    const channelData = buffer.getChannelData(channel)
    for (let i = 0; i < buffer.length; i++) {
      mono[i]! += channelData[i]! / buffer.numberOfChannels
    }
  }
  return mono
}
