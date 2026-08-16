import { useState } from 'react';
import { editMessage, deleteMessage } from '../api/messages.js';

const formatTime = (isoString) =>
  new Date(isoString).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

const MessageTicks = ({ status }) => {
  if (status === 'read') return <span className="message-ticks read" title="Read">✓✓</span>;
  if (status === 'delivered') return <span className="message-ticks" title="Delivered">✓✓</span>;
  return <span className="message-ticks" title="Sent">✓</span>;
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
        ) : (
          <div className="message-content">
            {message.isDeleted ? <em>This message was deleted</em> : message.content}
          </div>
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
