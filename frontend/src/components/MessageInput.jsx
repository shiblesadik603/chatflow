import { useState, useRef } from 'react';
import { uploadChatFile } from '../api/uploads.js';

const formatDuration = (seconds) => {
  const s = Math.round(seconds);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
};

export const MessageInput = ({ onSend, onTyping, disabled }) => {
  const [text, setText] = useState('');
  // A staged attachment sits here between "picked/recorded" and "sent" -
  // uploading happens immediately on pick (not deferred to submit), so the
  // user sees upload progress/errors before committing to send, and can
  // still type an optional caption while it uploads.
  const [attachment, setAttachment] = useState(null);
  const [isRecording, setIsRecording] = useState(false);
  const [recordingSeconds, setRecordingSeconds] = useState(0);
  const fileInputRef = useRef(null);
  const mediaRecorderRef = useRef(null);
  const chunksRef = useRef([]);
  const recordStartRef = useRef(0);
  const recordTimerRef = useRef(null);

  const startUpload = async (file, uploadType, messageType, duration) => {
    const previewUrl = messageType === 'image' ? URL.createObjectURL(file) : null;
    setAttachment({ messageType, previewUrl, fileName: file.name || 'Voice message', status: 'uploading', error: '' });
    try {
      const uploaded = await uploadChatFile(file, uploadType, duration);
      setAttachment((prev) => (prev ? { ...prev, status: 'ready', uploaded } : prev));
    } catch (err) {
      setAttachment((prev) =>
        prev ? { ...prev, status: 'error', error: err.response?.data?.message || 'Upload failed.' } : prev
      );
    }
  };

  const clearAttachment = () => {
    setAttachment((prev) => {
      if (prev?.previewUrl) URL.revokeObjectURL(prev.previewUrl);
      return null;
    });
  };

  const handleFileChange = (e) => {
    const file = e.target.files?.[0];
    e.target.value = ''; // lets picking the exact same file again re-fire onChange
    if (!file) return;
    // A best-effort category guess for the server's `type` field - the
    // server independently sniffs the real bytes and rejects anything
    // that doesn't match (INVALID_FILE_TYPE), so a wrong guess here just
    // surfaces as that error rather than a security concern.
    const uploadType = file.type.startsWith('image/') ? 'image' : 'document';
    const messageType = uploadType === 'image' ? 'image' : 'file';
    startUpload(file, uploadType, messageType);
  };

  const startRecording = async () => {
    let stream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch {
      setAttachment({ messageType: 'voice', status: 'error', error: 'Microphone access denied.' });
      return;
    }

    const recorder = new MediaRecorder(stream);
    chunksRef.current = [];
    recorder.ondataavailable = (e) => {
      if (e.data.size > 0) chunksRef.current.push(e.data);
    };
    recorder.onstop = () => {
      stream.getTracks().forEach((track) => track.stop());
      clearInterval(recordTimerRef.current);
      const blob = new Blob(chunksRef.current, { type: recorder.mimeType || 'audio/webm' });
      const duration = (Date.now() - recordStartRef.current) / 1000;
      startUpload(blob, 'voice', 'voice', duration);
    };

    recordStartRef.current = Date.now();
    setRecordingSeconds(0);
    recordTimerRef.current = setInterval(() => {
      setRecordingSeconds((Date.now() - recordStartRef.current) / 1000);
    }, 200);
    recorder.start();
    mediaRecorderRef.current = recorder;
    setIsRecording(true);
  };

  const stopRecording = () => {
    mediaRecorderRef.current?.stop();
    setIsRecording(false);
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    const trimmed = text.trim();

    if (attachment) {
      if (attachment.status !== 'ready') return;
      onSend({ messageType: attachment.messageType, content: trimmed, attachments: [attachment.uploaded] });
      clearAttachment();
      setText('');
      return;
    }

    if (!trimmed) return;
    onSend({ messageType: 'text', content: trimmed });
    setText('');
  };

  const canSend = attachment ? attachment.status === 'ready' : text.trim().length > 0;

  return (
    <form className="message-input-form" onSubmit={handleSubmit}>
      {attachment && (
        <div className="attachment-staging">
          {attachment.messageType === 'image' && attachment.previewUrl && (
            <img src={attachment.previewUrl} alt="Attachment preview" className="attachment-preview-image" />
          )}
          {attachment.messageType === 'file' && <span className="attachment-preview-file">📄 {attachment.fileName}</span>}
          {attachment.messageType === 'voice' && attachment.status === 'ready' && (
            <audio controls src={attachment.uploaded.url} className="attachment-preview-audio" />
          )}
          {attachment.status === 'uploading' && <span className="attachment-status">Uploading...</span>}
          {attachment.status === 'error' && <span className="attachment-status error">{attachment.error}</span>}
          <button type="button" className="attachment-remove" onClick={clearAttachment} aria-label="Remove attachment">
            ×
          </button>
        </div>
      )}

      <div className="message-input-row">
        {isRecording ? (
          <div className="recording-indicator">
            <span className="recording-dot" />
            {formatDuration(recordingSeconds)}
            <button type="button" onClick={stopRecording}>Stop</button>
          </div>
        ) : (
          <>
            <input
              type="file"
              ref={fileInputRef}
              onChange={handleFileChange}
              accept="image/*,.pdf,.doc,.docx,.txt"
              hidden
            />
            <button
              type="button"
              className="icon-button"
              onClick={() => fileInputRef.current?.click()}
              disabled={disabled || !!attachment}
              title="Attach a file"
            >
              📎
            </button>
            <button
              type="button"
              className="icon-button"
              onClick={startRecording}
              disabled={disabled || !!attachment}
              title="Record a voice message"
            >
              🎤
            </button>
            <input
              type="text"
              placeholder={attachment ? 'Add a caption (optional)...' : 'Type a message...'}
              value={text}
              onChange={(e) => {
                setText(e.target.value);
                onTyping?.();
              }}
              disabled={disabled}
            />
            <button type="submit" disabled={disabled || !canSend}>
              Send
            </button>
          </>
        )}
      </div>
    </form>
  );
};
