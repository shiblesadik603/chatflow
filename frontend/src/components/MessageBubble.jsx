import { useState } from 'react';
import { editMessage, deleteMessage } from '../api/messages.js';

const formatTime = (isoString) =>
  new Date(isoString).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

const formatBytes = (bytes) => {
  if (!bytes) return '';
  const units = ['B', 'KB', 'MB'];
  let value = bytes;
  let unitIndex = 0;
  while (value >= 1024 && unitIndex < units.length - 1) {
    value /= 1024;
    unitIndex += 1;
  }
  return `${value.toFixed(unitIndex > 0 && value < 10 ? 1 : 0)} ${units[unitIndex]}`;
};

const MessageTicks = ({ status }) => {
  if (status === 'read') return <span className="message-ticks read" title="Read">✓✓</span>;
  if (status === 'delivered') return <span className="message-ticks" title="Delivered">✓✓</span>;
  return <span className="message-ticks" title="Sent">✓</span>;
};

const MessageAttachment = ({ message }) => {
  const attachment = message.attachments?.[0];
  if (!attachment) return null;

  if (message.messageType === 'image') {
    return (
      <div className="message-attachment">
        <a href={attachment.url} target="_blank" rel="noopener noreferrer">
          <img src={attachment.url} alt={attachment.fileName || 'Image attachment'} className="message-image" />
        </a>
      </div>
    );
  }

  if (message.messageType === 'file') {
    return (
      <div className="message-attachment">
        <a href={attachment.url} target="_blank" rel="noopener noreferrer" className="message-file-link">
          📄 {attachment.fileName}
          {attachment.size ? <span className="file-size">{formatBytes(attachment.size)}</span> : null}
        </a>
      </div>
    );
  }

  if (message.messageType === 'voice') {
    return (
      <div className="message-attachment">
        <audio controls src={attachment.url} className="message-audio" />
      </div>
    );
  }

  return null;
};

export const MessageBubble = ({ message, isOwnMessage }) => {
  const [isEditing, setIsEditing] = useState(false);
  const [editText, setEditText] = useState(message.content);
  const [isSaving, setIsSaving] = useState(false);
  const [actionError, setActionError] = useState('');

  if (message.messageType === 'system') {
    return (
      <div className="system-message">
        {message.sender?.name} {message.content}
      </div>
    );
  }

  const canModify = isOwnMessage && message.messageType === 'text' && !message.isDeleted;

  const startEdit = () => {
    setEditText(message.content);
    setActionError('');
    setIsEditing(true);
  };

  const cancelEdit = () => {
    setIsEditing(false);
    setActionError('');
  };

  const saveEdit = async (e) => {
    e.preventDefault();
    const trimmed = editText.trim();
    if (!trimmed || trimmed === message.content) {
      setIsEditing(false);
      return;
    }
    setIsSaving(true);
    setActionError('');
    try {
      await editMessage(message._id, trimmed);
      // No local state update here - the message_edited broadcast (sent to
      // every room member, including the editor) is what actually updates
      // this message's content, same as a plain send_message echo.
      setIsEditing(false);
    } catch (err) {
      setActionError(err.response?.data?.message || 'Failed to save edit.');
    } finally {
      setIsSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!window.confirm('Delete this message?')) return;
    setActionError('');
    try {
      await deleteMessage(message._id);
    } catch (err) {
      setActionError(err.response?.data?.message || 'Failed to delete message.');
    }
  };

  return (
    <div className={`message-row ${isOwnMessage ? 'own' : ''}`}>
      <div className="message-bubble">
        {!isOwnMessage && <div className="message-sender">{message.sender?.name}</div>}

        {isEditing ? (
          <form className="message-edit-form" onSubmit={saveEdit}>
            <input
              type="text"
              value={editText}
              onChange={(e) => setEditText(e.target.value)}
              disabled={isSaving}
              autoFocus
            />
            <div className="message-edit-actions">
              <button type="submit" disabled={isSaving || !editText.trim()}>
                Save
              </button>
              <button type="button" onClick={cancelEdit} disabled={isSaving}>
                Cancel
              </button>
            </div>
          </form>
        ) : message.isDeleted ? (
          <div className="message-content">
            <em>This message was deleted</em>
          </div>
        ) : (
          <>
            <MessageAttachment message={message} />
            {message.content && <div className="message-content">{message.content}</div>}
          </>
        )}

        {actionError && <div className="message-action-error">{actionError}</div>}

        <div className="message-meta">
          {message.isEdited && !message.isDeleted && <span className="edited-tag">edited</span>}
          <span className="message-time">{formatTime(message.createdAt)}</span>
          {isOwnMessage && !message.isDeleted && <MessageTicks status={message.status} />}
        </div>

        {canModify && !isEditing && (
          <div className="message-actions">
            <button type="button" onClick={startEdit}>Edit</button>
            <button type="button" onClick={handleDelete}>Delete</button>
          </div>
        )}
      </div>
    </div>
  );
};
