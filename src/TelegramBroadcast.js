import React, { useState, useEffect } from 'react';
import axios from 'axios';

const TelegramBroadcast = () => {
  const [message, setMessage] = useState('');
  const [selectedUsers, setSelectedUsers] = useState([]);
  const [sending, setSending] = useState(false);
  const [sendResults, setSendResults] = useState([]);
  const [broadcastHistory, setBroadcastHistory] = useState([]);
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(null);

  const allUsers = [
    'Ajay', 'Jin', 'Kim', 'Nishat', 'Sailo', 'Minthang', 'Mangboi', 'Zansung',
    'Margaret', 'Kai', 'Risat', 'Thai', 'Jatin', 'Boikho', 'Jimmy', 'Kaiku',
    'Pau', 'Puia', 'Lamgouhao', 'Charna', 'Mang Khogin Haokip', 'Jonathan',
    'Henry Kom', 'Len Kipgen', 'William', 'Jona', 'Mimin', 'Guang',
    'Henry Khongsai', 'Prajesha', 'Sang', 'Obed', 'Thangboi', 'Jangnu',
    'Chong', 'Hoi', 'Sibtain', 'Biraj Bhai', 'Jangminlun', 'Ismael'
  ];

  // Hardcoded chat IDs (same as original)
  const chatIds = {
    'Nishat': '700113654',
    'Jatin': '1225343546',
  };

  // Fetch broadcast history on mount
  useEffect(() => {
    fetchBroadcastHistory();
  }, []);

  const fetchBroadcastHistory = async () => {
    try {
      const response = await axios.get('/api/broadcast-history');
      setBroadcastHistory(response.data.broadcasts || []);
      setError(null);
    } catch (err) {
      console.error('Error fetching broadcast history:', err);
      setError('Failed to load broadcast history');
    }
  };

  const handleUserSelect = (event) => {
    const value = event.target.value;
    if (value === 'all') {
      setSelectedUsers([...allUsers]);
    } else if (value && !selectedUsers.includes(value)) {
      setSelectedUsers([...selectedUsers, value]);
    }
  };

  const removeUser = (userToRemove) => {
    setSelectedUsers(selectedUsers.filter(user => user !== userToRemove));
  };

  const handleSend = async () => {
    if (!message.trim() || selectedUsers.length === 0) {
      setError('Please fill in all fields: message and select at least one user');
      return;
    }

    setSending(true);
    setSendResults([]);
    setError(null);
    setSuccess(null);

    const recipients = selectedUsers
      .filter(user => chatIds[user])
      .map(user => ({ user, chatId: chatIds[user] }));

    if (recipients.length === 0) {
      setError('No valid recipients with chat IDs selected');
      setSending(false);
      return;
    }

    try {
      const response = await axios.post('/api/send-broadcast', {
        message,
        recipients,
      });

      setSuccess(`Broadcast sent to ${response.data.recipients} recipient${response.data.recipients !== 1 ? 's' : ''}!`);
      setSendResults(recipients.map(r => ({
        user: r.user,
        success: true,
        chatId: r.chatId,
      })));
      setMessage('');
      setSelectedUsers([]);
      fetchBroadcastHistory(); // Refresh history
    } catch (err) {
      console.error('Error sending broadcast:', err);
      setError('Failed to send broadcast: ' + (err.response?.data?.error || err.message));
      setSendResults(recipients.map(r => ({
        user: r.user,
        success: false,
        error: err.response?.data?.error || err.message,
        chatId: r.chatId,
      })));
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="ticket-dashboard" style={{ background: 'transparent' }}>
      <div className="ticket-header">
        <h1>Telegram Broadcast</h1>
      </div>

      <div
        style={{
          background: 'var(--surface-dark)',
          border: '1px solid var(--border-light)',
          borderRadius: '20px',
          padding: '30px',
          marginBottom: '35px',
          backdropFilter: 'blur(15px)',
          boxShadow: 'var(--shadow-dark)',
          position: 'relative',
          overflow: 'hidden',
        }}
      >
        <div
          style={{
            position: 'absolute',
            top: '0',
            left: '0',
            right: '0',
            height: '2px',
            background: 'var(--primary-gradient)',
            opacity: '0.8',
          }}
        />

        {error && (
          <div
            style={{
              color: 'var(--color-open)',
              marginBottom: '20px',
              fontSize: '0.9rem',
              fontFamily: "'SF Mono', Monaco, 'Cascadia Code', 'Roboto Mono', monospace",
            }}
          >
            {error}
          </div>
        )}
        {success && (
          <div
            style={{
              color: 'var(--color-resolved)',
              marginBottom: '20px',
              fontSize: '0.9rem',
              fontFamily: "'SF Mono', Monaco, 'Cascadia Code', 'Roboto Mono', monospace",
            }}
          >
            {success}
          </div>
        )}

        <div className="filter-group">
          <label htmlFor="message">Broadcast Message</label>
          <textarea
            id="message"
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            placeholder="Type your broadcast message here..."
            rows={4}
            className="action-taken-textarea"
          />
        </div>

        <div className="filter-group" style={{ marginTop: '25px' }}>
          <label htmlFor="userSelect">Select Recipients</label>
          <select
            id="userSelect"
            onChange={handleUserSelect}
            value=""
            className="status-select"
          >
            <option value="">Choose users to add...</option>
            <option value="all">Select All</option>
            {allUsers.map((user) => (
              <option
                key={user}
                value={user}
                disabled={selectedUsers.includes(user)}
              >
                {user} {chatIds[user] ? `(${chatIds[user]})` : '(No Chat ID)'}
              </option>
            ))}
          </select>
        </div>

        {selectedUsers.length > 0 && (
          <div style={{ marginTop: '25px' }}>
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                marginBottom: '12px',
              }}
            >
              <span
                style={{
                  fontSize: '0.85rem',
                  fontWeight: '600',
                  color: 'var(--text-primary)',
                  textTransform: 'uppercase',
                  letterSpacing: '1.2px',
                }}
              >
                Selected Recipients:
              </span>
            </div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
              {selectedUsers.map((user) => (
                <span
                  key={user}
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '4px',
                    padding: '6px 12px',
                    background: 'var(--surface-light)',
                    border: '1px solid var(--border-light)',
                    borderRadius: '12px',
                    color: 'var(--text-primary)',
                    fontSize: '0.8rem',
                    fontFamily: "'SF Mono', Monaco, 'Cascadia Code', 'Roboto Mono', monospace",
                  }}
                >
                  {user}
                  {!chatIds[user] && (
                    <span
                      style={{ color: 'var(--color-open)', fontSize: '0.75rem' }}
                    >
                      (No ID)
                    </span>
                  )}
                  <button
                    onClick={() => removeUser(user)}
                    style={{
                      marginLeft: '4px',
                      color: 'var(--text-primary)',
                      cursor: 'pointer',
                      background: 'none',
                      border: 'none',
                      fontSize: '0.9rem',
                    }}
                    onMouseOver={(e) => (e.target.style.color = 'var(--text-secondary)')}
                    onMouseOut={(e) => (e.target.style.color = 'var(--text-primary)')}
                  >
                    ×
                  </button>
                </span>
              ))}
            </div>
          </div>
        )}

        <button
          onClick={handleSend}
          disabled={sending || !message.trim() || selectedUsers.length === 0}
          className="assign-btn-inline"
          style={{
            marginTop: '25px',
            width: '100%',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '8px',
          }}
        >
          {sending ? 'Sending...' : `Send to ${selectedUsers.length} recipient${selectedUsers.length !== 1 ? 's' : ''}`}
        </button>

        {sendResults.length > 0 && (
          <div style={{ marginTop: '35px' }}>
            <h3
              style={{
                fontSize: '1.3rem',
                fontWeight: '600',
                color: 'var(--text-primary)',
                marginBottom: '15px',
                fontFamily: "'SF Mono', Monaco, 'Cascadia Code', 'Roboto Mono', monospace",
              }}
            >
              Send Results:
            </h3>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              {sendResults.map((result, index) => (
                <div
                  key={index}
                  style={{
                    padding: '12px',
                    borderRadius: '12px',
                    border: `1px solid ${result.success ? 'var(--color-resolved)' : 'var(--color-open)'}`,
                    background: result.success ? 'rgba(16, 185, 129, 0.1)' : 'rgba(239, 68, 68, 0.1)',
                    boxShadow: 'var(--shadow-dark)',
                  }}
                >
                  <div
                    style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                    }}
                  >
                    <span
                      style={{
                        fontWeight: '600',
                        color: 'var(--text-primary)',
                        fontFamily: "'SF Mono', Monaco, 'Cascadia Code', 'Roboto Mono', monospace",
                      }}
                    >
                      {result.user}
                    </span>
                    <span
                      style={{
                        fontSize: '0.8rem',
                        color: result.success ? 'var(--color-resolved)' : 'var(--color-open)',
                        fontFamily: "'SF Mono', Monaco, 'Cascadia Code', 'Roboto Mono', monospace",
                      }}
                    >
                      {result.success ? '✓ Sent' : '✗ Failed'}
                    </span>
                  </div>
                  {!result.success && (
                    <p
                      style={{
                        fontSize: '0.8rem',
                        color: 'var(--color-open)',
                        marginTop: '8px',
                        fontFamily: "'SF Mono', Monaco, 'Cascadia Code', 'Roboto Mono', monospace",
                      }}
                    >
                      Error: {result.error}
                    </p>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {broadcastHistory.length > 0 && (
          <div style={{ marginTop: '35px' }}>
            <h3
              style={{
                fontSize: '1.3rem',
                fontWeight: '600',
                color: 'var(--text-primary)',
                marginBottom: '15px',
                fontFamily: "'SF Mono', Monaco, 'Cascadia Code', 'Roboto Mono', monospace",
              }}
            >
              Broadcast History:
            </h3>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              {broadcastHistory.map((broadcast) => (
                <div
                  key={broadcast.id}
                  style={{
                    padding: '20px',
                    borderRadius: '12px',
                    border: '1px solid var(--border-light)',
                    background: 'var(--surface-dark)',
                    boxShadow: 'var(--shadow-dark)',
                    backdropFilter: 'blur(15px)',
                  }}
                >
                  <div
                    style={{
                      marginBottom: '12px',
                      fontSize: '0.85rem',
                      color: 'var(--text-secondary)',
                      fontFamily: "'SF Mono', Monaco, 'Cascadia Code', 'Roboto Mono', monospace",
                    }}
                  >
                    <strong>Timestamp:</strong> {new Date(broadcast.timestamp).toLocaleString()}
                  </div>
                  <div
                    style={{
                      marginBottom: '12px',
                      fontSize: '0.85rem',
                      color: 'var(--text-primary)',
                      fontFamily: "'SF Mono', Monaco, 'Cascadia Code', 'Roboto Mono', monospace",
                    }}
                  >
                    <strong>Message:</strong> {broadcast.message}
                  </div>
                  <div
                    style={{
                      fontSize: '0.85rem',
                      color: 'var(--text-primary)',
                      fontFamily: "'SF Mono', Monaco, 'Cascadia Code', 'Roboto Mono', monospace",
                    }}
                  >
                    <strong>Recipients:</strong>
                    <div
                      style={{
                        display: 'flex',
                        flexDirection: 'column',
                        gap: '8px',
                        marginTop: '8px',
                      }}
                    >
                      {broadcast.recipients.map((recipient, index) => (
                        <div
                          key={index}
                          style={{
                            display: 'flex',
                            justifyContent: 'space-between',
                            alignItems: 'center',
                            padding: '8px 12px',
                            borderRadius: '8px',
                            border: `1px solid ${
                              recipient.status === 'Acknowledged' ? 'var(--color-resolved)' : 'var(--border-light)'
                            }`,
                            background:
                              recipient.status === 'Acknowledged' ? 'rgba(16, 185, 129, 0.1)' : 'var(--surface-light)',
                          }}
                        >
                          <span>{recipient.user} ({recipient.chatId})</span>
                          <span
                            style={{
                              color: recipient.status === 'Acknowledged' ? 'var(--color-resolved)' : 'var(--text-secondary)',
                              fontSize: '0.8rem',
                              fontFamily: "'SF Mono', Monaco, 'Cascadia Code', 'Roboto Mono', monospace",
                            }}
                          >
                            {recipient.status}
                            {recipient.acknowledgedAt && ` (at ${new Date(recipient.acknowledgedAt).toLocaleString()})`}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        <div
          style={{
            marginTop: '35px',
            padding: '20px',
            background: 'var(--surface-dark)',
            border: '1px solid var(--border-light)',
            borderRadius: '12px',
            boxShadow: 'var(--shadow-dark)',
            backdropFilter: 'blur(15px)',
          }}
        >
          <h4
            style={{
              fontWeight: '600',
              color: 'var(--text-primary)',
              marginBottom: '12px',
              fontSize: '1rem',
              fontFamily: "'SF Mono', Monaco, 'Cascadia Code', 'Roboto Mono', monospace",
            }}
          >
            Configuration Notes:
          </h4>
          <ul
            style={{
              fontSize: '0.85rem',
              color: 'var(--text-secondary)',
              listStyleType: 'disc',
              paddingLeft: '20px',
              fontFamily: "'SF Mono', Monaco, 'Cascadia Code', 'Roboto Mono', monospace",
            }}
          >
            <li>Currently configured: Nishat (700113654), Jatin (1225343546)</li>
            <li>To add more chat IDs, update the chatIds object in the code</li>
            <li>Users without chat IDs will be excluded from broadcasts</li>
            <li>Broadcast history and acknowledgments are stored in Google Sheets</li>
            <li>Users acknowledge messages by clicking 'Understood' in Telegram</li>
          </ul>
        </div>
      </div>
    </div>
  );
};

export default TelegramBroadcast;