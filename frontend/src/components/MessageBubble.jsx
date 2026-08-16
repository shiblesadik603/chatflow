const formatTime = (isoString) =>
  new Date(isoString).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

export const MessageBubble = ({ message, isOwnMessage }) => {
  if (message.messageType === 'system') {
    return (
      <div className="system-message">
        {message.sender?.name} {message.content}
      </div>
    );
  }

  return (
    <div className={`message-row ${isOwnMessage ? 'own' : ''}`}>
      <div className="message-bubble">
        {!isOwnMessage && <div className="message-sender">{message.sender?.name}</div>}
        <div className="message-content">
          {message.isDeleted ? <em>This message was deleted</em> : message.content}
        </div>
        <div className="message-meta">
          {message.isEdited && !message.isDeleted && <span className="edited-tag">edited</span>}
          <span className="message-time">{formatTime(message.createdAt)}</span>
        </div>
      </div>
    </div>
  );
};
