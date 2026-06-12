import fixWebmDuration from 'fix-webm-duration';
import { RECORDING_MIME_TYPE, RECORDING_UPLOAD_CONTENT_TYPE, RuntimeMessageTypes } from '../shared/constants';
import type { OffscreenRecordingResult, RuntimeMessage } from '../shared/types';

let recorder: MediaRecorder | null = null;
let stream: MediaStream | null = null;
let startedAt = 0;
let chunks: BlobPart[] = [];
let recorderError: string | null = null;

chrome.runtime.onMessage.addListener((message: RuntimeMessage, _sender, sendResponse) => {
  if (message.type === RuntimeMessageTypes.OffscreenStartRecording) {
    void startRecording((message.payload as { streamId: string }).streamId)
      .then(() => sendResponse({ ok: true }))
      .catch((error) => sendResponse({ ok: false, error: getErrorMessage(error) }));
    return true;
  }

  if (message.type === RuntimeMessageTypes.OffscreenStopRecording) {
    void stopRecording()
      .then((result) => sendResponse(result))
      .catch((error) => sendResponse({ ok: false, error: getErrorMessage(error) }));
    return true;
  }

  return false;
});

async function startRecording(streamId: string) {
  if (recorder?.state === 'recording') {
    return;
  }

  chunks = [];
  recorderError = null;

  const tabConstraint = (id: string) =>
    ({
      mandatory: { chromeMediaSource: 'tab', chromeMediaSourceId: id },
    }) as MediaTrackConstraints;

  // Acquire video + audio together; if audio capture fails (silent tab, policy),
  // fall back to video-only so we never end up with an empty recording.
  try {
    stream = await navigator.mediaDevices.getUserMedia({
      audio: tabConstraint(streamId),
      video: tabConstraint(streamId),
    });
  } catch {
    stream = await navigator.mediaDevices.getUserMedia({
      video: tabConstraint(streamId),
    });
  }

  const videoTrack = stream.getVideoTracks()[0];
  if (!videoTrack || videoTrack.readyState === 'ended') {
    stream.getTracks().forEach((track) => track.stop());
    stream = null;
    throw new Error('Tab video track is unavailable — nothing to record.');
  }
  // If the track ends mid-capture (tab closed / navigated), remember why.
  videoTrack.addEventListener('ended', () => {
    recorderError = recorderError ?? 'Capture ended early: the tab video track stopped.';
  });

  const hasAudio = stream.getAudioTracks().length > 0;
  const preferredMime = hasAudio ? RECORDING_MIME_TYPE : 'video/webm;codecs=vp8';
  const mimeType = MediaRecorder.isTypeSupported(preferredMime)
    ? preferredMime
    : MediaRecorder.isTypeSupported(RECORDING_MIME_TYPE)
      ? RECORDING_MIME_TYPE
      : RECORDING_UPLOAD_CONTENT_TYPE;

  recorder = new MediaRecorder(stream, { mimeType });
  recorder.ondataavailable = (event) => {
    if (event.data.size > 0) {
      chunks.push(event.data);
    }
  };
  recorder.onerror = (event) => {
    const err = (event as unknown as { error?: DOMException }).error;
    recorderError = err?.message ?? 'MediaRecorder failed during capture.';
  };
  startedAt = Date.now();
  recorder.start(1_000);
}

async function stopRecording(): Promise<OffscreenRecordingResult | null> {
  if (!recorder || recorder.state === 'inactive') {
    return null;
  }

  const stopped = new Promise<void>((resolve) => {
    recorder!.onstop = () => resolve();
  });
  // Flush any buffered frames into a final dataavailable before stopping, so the
  // tail of the recording isn't dropped.
  if (recorder.state === 'recording') {
    recorder.requestData();
  }
  recorder.stop();
  await stopped;
  stream?.getTracks().forEach((track) => track.stop());

  const durationMs = Math.max(0, Date.now() - startedAt);
  const rawBlob = new Blob(chunks, { type: RECORDING_UPLOAD_CONTENT_TYPE });

  // Surface a real error instead of silently uploading a 0-byte file.
  if (rawBlob.size === 0) {
    const reason = recorderError ?? 'Recording produced no data (0 bytes). The tab may not have rendered any frames.';
    recorder = null;
    stream = null;
    chunks = [];
    startedAt = 0;
    recorderError = null;
    throw new Error(reason);
  }

  const blob = await fixRecordingDuration(rawBlob, durationMs);
  const result: OffscreenRecordingResult = {
    dataUrl: await blobToDataUrl(blob),
    contentType: RECORDING_UPLOAD_CONTENT_TYPE,
    byteSize: blob.size,
    durationMs,
  };

  recorder = null;
  stream = null;
  chunks = [];
  startedAt = 0;

  return result;
}

async function fixRecordingDuration(blob: Blob, durationMs: number) {
  if (blob.size === 0 || durationMs <= 0) {
    return blob;
  }

  try {
    return await fixWebmDuration(blob, durationMs, { logger: false });
  } catch {
    return blob;
  }
}

function blobToDataUrl(blob: Blob) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error ?? new Error('Failed to read recording blob.'));
    reader.readAsDataURL(blob);
  });
}

function getErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}
