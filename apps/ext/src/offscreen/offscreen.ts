import fixWebmDuration from 'fix-webm-duration';
import { RECORDING_MIME_TYPE, RECORDING_UPLOAD_CONTENT_TYPE, RuntimeMessageTypes } from '../shared/constants';
import type { OffscreenRecordingResult, RuntimeMessage } from '../shared/types';

let recorder: MediaRecorder | null = null;
let stream: MediaStream | null = null;
let startedAt = 0;
let chunks: BlobPart[] = [];

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
  stream = await navigator.mediaDevices.getUserMedia({
    audio: {
      mandatory: {
        chromeMediaSource: 'tab',
        chromeMediaSourceId: streamId,
      },
    } as MediaTrackConstraints,
    video: {
      mandatory: {
        chromeMediaSource: 'tab',
        chromeMediaSourceId: streamId,
      },
    } as MediaTrackConstraints,
  });
  recorder = new MediaRecorder(stream, {
    mimeType: MediaRecorder.isTypeSupported(RECORDING_MIME_TYPE)
      ? RECORDING_MIME_TYPE
      : RECORDING_UPLOAD_CONTENT_TYPE,
  });
  recorder.ondataavailable = (event) => {
    if (event.data.size > 0) {
      chunks.push(event.data);
    }
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
  recorder.stop();
  await stopped;
  stream?.getTracks().forEach((track) => track.stop());

  const durationMs = Math.max(0, Date.now() - startedAt);
  const rawBlob = new Blob(chunks, { type: RECORDING_UPLOAD_CONTENT_TYPE });
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
