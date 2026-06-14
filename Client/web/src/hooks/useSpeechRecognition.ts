import { useState, useRef, useCallback, useEffect } from 'react';
import { api } from '@/lib/api/client';

declare global {
  interface Window {
    SpeechRecognition?: { new(): SpeechRecognitionInstance };
    webkitSpeechRecognition?: { new(): SpeechRecognitionInstance };
  }
}
interface SpeechRecognitionInstance {
  lang: string; interimResults: boolean; continuous: boolean;
  onresult: ((event: SpeechRecognitionEvent) => void) | null;
  onerror: ((event: SpeechRecognitionError) => void) | null;
  onend: (() => void) | null;
  start(): void; stop(): void;
}
interface SpeechRecognitionEvent { resultIndex: number; results: SpeechRecognitionResultList; }
interface SpeechRecognitionResultList { length: number; [index: number]: SpeechRecognitionResult; }
interface SpeechRecognitionResult { isFinal: boolean; length: number; [index: number]: SpeechRecognitionAlternative; }
interface SpeechRecognitionAlternative { transcript: string; confidence: number; }
interface SpeechRecognitionError { error: string; }

const USE_FUNASR = true;

export function useSpeechRecognition() {
  const [isListening, setIsListening] = useState(false);
  const [interimText, setInterimText] = useState('');
  const [volume, setVolume] = useState(0);
  const [supported, setSupported] = useState(false);
  const recognitionRef = useRef<SpeechRecognitionInstance | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const streamRef = useRef<MediaStream | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const rafRef = useRef<number>(0);
  const onSilenceRef = useRef<((text: string) => void) | null>(null);
  const interimRef = useRef('');

  useEffect(() => {
    if (USE_FUNASR) {
      setSupported(typeof MediaRecorder !== 'undefined');
    } else {
      setSupported(!!(window.SpeechRecognition || window.webkitSpeechRecognition));
    }
  }, []);

  const stopVolumeLoop = useCallback(() => {
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    rafRef.current = 0;
  }, []);

  /** Must be called first, from a direct user gesture, to avoid NotAllowedError. */
  const requestMic = useCallback(async (): Promise<MediaStream | null> => {
    try {
      console.log('[Speech] Requesting microphone...');
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      console.log('[Speech] Microphone granted');
      return stream;
    } catch (e) {
      console.error('[Speech] Microphone error:', e);
      return null;
    }
  }, []);

  /** Start recording with an existing MediaStream. */
  const startWithStream = useCallback((stream: MediaStream, onSilence: (text: string) => void) => {
    onSilenceRef.current = onSilence;
    interimRef.current = '';
    streamRef.current = stream;

    // Volume analysis
    const ctx = new AudioContext();
    const analyser = ctx.createAnalyser();
    analyser.fftSize = 256;
    analyser.smoothingTimeConstant = 0.7;
    analyserRef.current = analyser;
    const source = ctx.createMediaStreamSource(stream);
    source.connect(analyser);
    const data = new Uint8Array(analyser.frequencyBinCount);
    const loop = () => {
      if (!analyserRef.current) return;
      analyserRef.current.getByteFrequencyData(data);
      const avg = data.reduce((a, b) => a + b, 0) / data.length;
      setVolume(Math.min(avg / 128, 1));
      rafRef.current = requestAnimationFrame(loop);
    };
    loop();

    // MediaRecorder
    const mimeType = MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
      ? 'audio/webm;codecs=opus' : 'audio/webm';
    const recorder = new MediaRecorder(stream, { mimeType });
    mediaRecorderRef.current = recorder;
    audioChunksRef.current = [];

    recorder.ondataavailable = (e) => {
      if (e.data.size > 0) audioChunksRef.current.push(e.data);
    };

    recorder.onstop = async () => {
      stopVolumeLoop();
      stream.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
      analyserRef.current = null;
      ctx.close();
      setIsListening(false);

      const blob = new Blob(audioChunksRef.current, { type: mimeType });
      try {
        const formData = new FormData();
        formData.append('file', blob, 'recording.webm');
        const resp = await api.post<{ text: string }>('/speech/transcribe', formData);
        const text = resp.text || '';
        setInterimText(text);
        interimRef.current = text;
        if (onSilenceRef.current) {
          const fn = onSilenceRef.current;
          onSilenceRef.current = null;
          fn(text);
        }
      } catch {
        setInterimText('');
      }
    };

    recorder.start();
    setIsListening(true);
  }, [stopVolumeLoop]);

  const start = useCallback(async (onSilence: (text: string) => void, _lang = 'zh-CN') => {
    onSilenceRef.current = onSilence;
    interimRef.current = '';

    if (USE_FUNASR) {
      const stream = await requestMic();
      if (stream) {
        startWithStream(stream, onSilence);
      } else {
        setIsListening(false);
      }
      return;
    }

    // Browser Web Speech path
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SR) return;
    const recognition = new SR();
    recognition.lang = _lang;
    recognition.interimResults = true;
    recognition.continuous = false;
    recognition.onresult = (event) => {
      let interim = '', final = '';
      for (let i = event.resultIndex; i < event.results.length; i++) {
        if (event.results[i].isFinal) final += event.results[i][0].transcript;
        else interim += event.results[i][0].transcript;
      }
      setInterimText(final || interim);
      interimRef.current = final || interim;
    };
    recognition.onerror = (event) => {
      if (event.error === 'no-speech' || event.error === 'aborted') return;
      setIsListening(false);
    };
    recognition.onend = () => {
      setIsListening(false);
      if (onSilenceRef.current) {
        const fn = onSilenceRef.current;
        onSilenceRef.current = null;
        fn(interimRef.current);
      }
    };
    recognitionRef.current = recognition;
    recognition.start();
    setIsListening(true);
  }, [stopVolumeLoop]);

  const stop = useCallback(() => {
    stopVolumeLoop();
    if (USE_FUNASR) {
      mediaRecorderRef.current?.stop();
      streamRef.current?.getTracks().forEach((t) => t.stop());
    } else {
      recognitionRef.current?.stop();
    }
    setIsListening(false);
    setInterimText('');
    setVolume(0);
  }, [stopVolumeLoop]);

  return { isListening, interimText, volume, start, stop, supported, requestMic, startWithStream };
}
