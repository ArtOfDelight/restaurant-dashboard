import React, { useState, useEffect } from 'react';

const TelegramBroadcast = () => {
  // API Base URL - Update this if your backend URL changes
  const API_BASE_URL = 'https://restaurant-dashboard-nqbi.onrender.com/';
  
  const [message, setMessage] = useState('');
  const [selectedUsers, setSelectedUsers] = useState([]);
  const [sending, setSending] = useState(false);
  const [sendResults, setSendResults] = useState([]);
  const [broadcastHistory, setBroadcastHistory] = useState([]);
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(null);
  const [loading, setLoading] = useState(true);
  const [botStatus, setBotStatus] = useState('unknown'); // 'connected', 'disconnected', 'unknown'

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

  // Check bot status and fetch broadcast history on mount
  useEffect(() => {
    checkBotStatus();
    fetchBroadcastHistory();
  }, []);

  const checkBotStatus = async () => {
    try {
      const response = await fetch(`${API_BASE_URL}/health`);
      const data = await response.json();
      
      if (data.services?.telegramBot === 'Connected') {
        setBotStatus('connected');
      } else {
        setBotStatus('disconnected');
        setError('Telegram bot is not connected. Some features may be unavailable.');
      }
    } catch (err) {
      console.error('Error checking bot status:', err);
      setBotStatus('unknown');
    }
  };

  const fetchBroadcastHistory = async () => {
    setLoading(true);
    try {
      const response = await fetch(`${API_BASE_URL}/api/broadcast-history`);
      const data = await response.json();
      
      console.log('API Response:', data);
      
      const broadcasts = data.broadcasts || data || [];
      const broadcastArray = Array.isArray(broadcasts) ? broadcasts : [];
      
      setBroadcastHistory(broadcastArray);
      setError(null);
      console.log('Processed broadcasts:', broadcastArray);
    } catch (err) {
      console.error('Error fetching broadcast history:', err);
      setError('Failed to load broadcast history: ' + (err.message || 'Unknown error'));
    } finally {
      setLoading(false);
    }
  };

  const formatTimestamp = (timestamp) => {
    if (!timestamp) return 'Unknown time';
    
    try {
      const date = new Date(timestamp);
      if (!isNaN(date.getTime())) {
        return date.toLocaleString();
      }
      return timestamp;
    } catch (error) {
      return timestamp;
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

    if (botStatus === 'disconnected') {
      setError('Telegram bot is not connected. Cannot send broadcasts.');
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
      const response = await fetch(`${API_BASE_URL}/api/send-broadcast`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          message,
          recipients,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        // Handle specific bot unavailable error
        if (response.status === 503) {
          setError('Telegram bot is currently unavailable. Please try again later or check the bot configuration.');
          setBotStatus('disconnected');
        } else {
          throw new Error(data.error || 'Failed to send broadcast');
        }
        return;
      }

      setSuccess(`Broadcast sent to ${data.recipients} recipient${data.recipients !== 1 ? 's' : ''}!`);
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
      setError('Failed to send broadcast: ' + err.message);
      setSendResults(recipients.map(r => ({
        user: r.user,
        success: false,
        error: err.message,
        chatId: r.chatId,
      })));
    } finally {
      setSending(false);
    }
  };

  const getBotStatusColor = () => {
    switch (botStatus) {
      case 'connected': return '#10b981'; // green
      case 'disconnected': return '#ef4444'; // red
      default: return '#f59e0b'; // yellow
    }
  };

  const getBotStatusText = () => {
    switch (botStatus) {
      case 'connected': return 'Bot Connected';
      case 'disconnected': return 'Bot Disconnected';
      default: return 'Bot Status Unknown';
    }
  };

  const getBotStatusIcon = () => {
    switch (botStatus) {
      case 'connected': return '✅';
      case 'disconnected': return '❌';
      default: return '⚠️';
    }
  };

  return (
    <div className="ticket-dashboard" style={{ background: 'transparent' }}>
      <div className="ticket-header">
        <h1>Telegram Broadcast</h1>
      </div>

      <div
        style={{
          background: '#1a1a1a',
          border: '1px solid #333',
          borderRadius: '20px',
          padding: '30px',
          marginBottom: '35px',
          backdropFilter: 'blur(15px)',
          boxShadow: '0 4px 6px rgba(0,0,0,0.1)',
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
            background: 'linear-gradient(90deg, #3b82f6, #8b5cf6)',
            opacity: '0.8',
          }}
        />

        {/* Bot Status Indicator */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            marginBottom: '20px',
            padding: '8px 12px',
            backgroundColor: 'rgba(255, 255, 255, 0.05)',
            borderRadius: '8px',
            border: `1px solid ${getBotStatusColor()}33`,
          }}
        >
          <span style={{ fontSize: '1rem' }}>{getBotStatusIcon()}</span>
          <span
            style={{
              color: getBotStatusColor(),
              fontSize: '0.85rem',
              fontFamily: "'SF Mono', Monaco, 'Cascadia Code', 'Roboto Mono', monospace",
              fontWeight: '600'
            }}
          >
            {getBotStatusText()}
          </span>
          <button
            onClick={checkBotStatus}
            style={{
              marginLeft: 'auto',
              padding: '4px 8px',
              fontSize: '0.75rem',
              backgroundColor: 'transparent',
              border: '1px solid #555',
              borderRadius: '4px',
              color: '#ccc',
              cursor: 'pointer',
            }}
            onMouseOver={(e) => (e.target.style.borderColor = '#777')}
            onMouseOut={(e) => (e.target.style.borderColor = '#555')}
          >
            Refresh
          </button>
        </div>

        {error && (
          <div
            style={{
              color: '#ef4444',
              marginBottom: '20px',
              fontSize: '0.9rem',
              fontFamily: "'SF Mono', Monaco, 'Cascadia Code', 'Roboto Mono', monospace",
              padding: '10px',
              background: 'rgba(239, 68, 68, 0.1)',
              borderRadius: '8px',
              border: '1px solid rgba(239, 68, 68, 0.3)',
            }}
          >
            ⚠️ {error}
          </div>
        )}
        {success && (
          <div
            style={{
              color: '#10b981',
              marginBottom: '20px',
              fontSize: '0.9rem',
              fontFamily: "'SF Mono', Monaco, 'Cascadia Code', 'Roboto Mono', monospace",
              padding: '10px',
              background: 'rgba(16, 185, 129, 0.1)',
              borderRadius: '8px',
              border: '1px solid rgba(16, 185, 129, 0.3)',
            }}
          >
            ✅ {success}
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
            disabled={botStatus === 'disconnected'}
            style={{
              width: '100%',
              padding: '10px',
              borderRadius: '8px',
              border: '1px solid #333',
              background: botStatus === 'disconnected' ? '#1a1a1a' : '#2a2a2a',
              color: botStatus === 'disconnected' ? '#666' : '#fff',
              fontFamily: "'SF Mono', Monaco, 'Cascadia Code', 'Roboto Mono', monospace",
              resize: 'vertical',
            }}
          />
        </div>

        <div className="filter-group" style={{ marginTop: '25px' }}>
          <label htmlFor="userSelect">Select Recipients</label>
          <select
            id="userSelect"
            onChange={handleUserSelect}
            value=""
            disabled={botStatus === 'disconnected'}
            style={{
              width: '100%',
              padding: '10px',
              borderRadius: '8px',
              border: '1px solid #333',
              background: botStatus === 'disconnected' ? '#1a1a1a' : '#2a2a2a',
              color: botStatus === 'disconnected' ? '#666' : '#fff',
            }}
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
                  color: '#fff',
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
                    background: '#2a2a2a',
                    border: '1px solid #333',
                    borderRadius: '12px',
                    color: '#fff',
                    fontSize: '0.8rem',
                    fontFamily: "'SF Mono', Monaco, 'Cascadia Code', 'Roboto Mono', monospace",
                  }}
                >
                  {user}
                  {!chatIds[user] && (
                    <span
                      style={{ color: '#ef4444', fontSize: '0.75rem' }}
                    >
                      (No ID)
                    </span>
                  )}
                  <button
                    onClick={() => removeUser(user)}
                    style={{
                      marginLeft: '4px',
                      color: '#fff',
                      cursor: 'pointer',
                      background: 'none',
                      border: 'none',
                      fontSize: '0.9rem',
                    }}
                    onMouseOver={(e) => (e.target.style.color = '#999')}
                    onMouseOut={(e) => (e.target.style.color = '#fff')}
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
          disabled={sending || !message.trim() || selectedUsers.length === 0 || botStatus === 'disconnected'}
          style={{
            marginTop: '25px',
            width: '100%',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '8px',
            padding: '12px',
            borderRadius: '8px',
            background: (sending || !message.trim() || selectedUsers.length === 0 || botStatus === 'disconnected')
              ? '#555' 
              : 'linear-gradient(90deg, #3b82f6, #8b5cf6)',
            color: '#fff',
            border: 'none',
            cursor: (sending || !message.trim() || selectedUsers.length === 0 || botStatus === 'disconnected') ? 'not-allowed' : 'pointer',
            fontWeight: '600',
          }}
        >
          {sending ? 'Sending...' : botStatus === 'disconnected' ? 'Bot Disconnected' : `Send to ${selectedUsers.length} recipient${selectedUsers.length !== 1 ? 's' : ''}`}
        </button>

        {sendResults.length > 0 && (
          <div style={{ marginTop: '35px' }}>
            <h3
              style={{
                fontSize: '1.3rem',
                fontWeight: '600',
                color: '#fff',
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
                    border: `1px solid ${result.success ? '#10b981' : '#ef4444'}`,
                    background: result.success ? 'rgba(16, 185, 129, 0.1)' : 'rgba(239, 68, 68, 0.1)',
                    boxShadow: '0 4px 6px rgba(0,0,0,0.1)',
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
                        color: '#fff',
                        fontFamily: "'SF Mono', Monaco, 'Cascadia Code', 'Roboto Mono', monospace",
                      }}
                    >
                      {result.user}
                    </span>
                    <span
                      style={{
                        fontSize: '0.8rem',
                        color: result.success ? '#10b981' : '#ef4444',
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
                        color: '#ef4444',
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

        {loading && (
          <div style={{ marginTop: '35px', color: '#999' }}>
            Loading broadcast history...
          </div>
        )}

        {!loading && broadcastHistory.length === 0 && (
          <div style={{ marginTop: '35px', color: '#999' }}>
            No broadcast history available. Send your first broadcast to get started!
          </div>
        )}

        {!loading && broadcastHistory.length > 0 && (
          <div style={{ marginTop: '35px' }}>
            <h3
              style={{
                fontSize: '1.3rem',
                fontWeight: '600',
                color: '#fff',
                marginBottom: '15px',
                fontFamily: "'SF Mono', Monaco, 'Cascadia Code', 'Roboto Mono', monospace",
              }}
            >
              Broadcast History ({broadcastHistory.length} broadcasts):
            </h3>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              {broadcastHistory.map((broadcast, index) => {
                const acknowledgedCount = broadcast.recipients?.filter(r => r.status === 'Acknowledged').length || 0;
                const totalCount = broadcast.recipients?.length || 0;
                const pendingCount = totalCount - acknowledgedCount;
                
                return (
                  <div
                    key={broadcast.id || index}
                    style={{
                      padding: '20px',
                      borderRadius: '12px',
                      border: '1px solid #333',
                      background: '#1a1a1a',
                      boxShadow: '0 4px 6px rgba(0,0,0,0.1)',
                      backdropFilter: 'blur(15px)',
                    }}
                  >
                    <div
                      style={{
                        marginBottom: '12px',
                        fontSize: '0.85rem',
                        color: '#999',
                        fontFamily: "'SF Mono', Monaco, 'Cascadia Code', 'Roboto Mono', monospace",
                      }}
                    >
                      <strong>ID:</strong> {broadcast.id || 'N/A'} | <strong>Timestamp:</strong> {formatTimestamp(broadcast.timestamp)}
                    </div>
                    <div
                      style={{
                        marginBottom: '12px',
                        fontSize: '0.85rem',
                        color: '#fff',
                        fontFamily: "'SF Mono', Monaco, 'Cascadia Code', 'Roboto Mono', monospace",
                      }}
                    >
                      <strong>Message:</strong> {broadcast.message || 'No message'}
                    </div>
                    
                    {/* Acknowledgment Summary */}
                    {totalCount > 0 && (
                      <div
                        style={{
                          marginBottom: '15px',
                          padding: '8px 12px',
                          borderRadius: '8px',
                          background: '#2a2a2a',
                          border: '1px solid #444',
                          fontSize: '0.8rem',
                          fontFamily: "'SF Mono', Monaco, 'Cascadia Code', 'Roboto Mono', monospace",
                        }}
                      >
                        <span style={{ color: '#10b981' }}>✓ {acknowledgedCount} Acknowledged</span>
                        {pendingCount > 0 && (
                          <>
                            <span style={{ color: '#666', margin: '0 8px' }}>•</span>
                            <span style={{ color: '#f59e0b' }}>⏳ {pendingCount} Pending</span>
                          </>
                        )}
                        <span style={{ color: '#666', margin: '0 8px' }}>•</span>
                        <span style={{ color: '#999' }}>Total: {totalCount}</span>
                      </div>
                    )}
                    
                    <div
                      style={{
                        fontSize: '0.85rem',
                        color: '#fff',
                        fontFamily: "'SF Mono', Monaco, 'Cascadia Code', 'Roboto Mono', monospace",
                      }}
                    >
                      <strong>Recipients ({totalCount}):</strong>
                      {broadcast.recipients && broadcast.recipients.length > 0 ? (
                        <div
                          style={{
                            display: 'flex',
                            flexDirection: 'column',
                            gap: '8px',
                            marginTop: '8px',
                          }}
                        >
                          {broadcast.recipients.map((recipient, recipientIndex) => {
                            const status = recipient.status === 'Acknowledged' ? 'Acknowledged' : 'Pending';
                            const isAcknowledged = status === 'Acknowledged';
                            
                            return (
                              <div
                                key={recipientIndex}
                                style={{
                                  display: 'flex',
                                  justifyContent: 'space-between',
                                  alignItems: 'center',
                                  padding: '8px 12px',
                                  borderRadius: '8px',
                                  border: `1px solid ${isAcknowledged ? '#10b981' : '#f59e0b'}`,
                                  background: isAcknowledged ? 'rgba(16, 185, 129, 0.1)' : 'rgba(245, 158, 11, 0.1)',
                                }}
                              >
                                <span>{recipient.user || 'Unknown'} ({recipient.chatId || 'No ID'})</span>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                  <span
                                    style={{
                                      display: 'inline-flex',
                                      alignItems: 'center',
                                      gap: '4px',
                                      padding: '2px 6px',
                                      borderRadius: '4px',
                                      background: isAcknowledged ? '#10b981' : '#f59e0b',
                                      color: '#000',
                                      fontSize: '0.7rem',
                                      fontWeight: '600',
                                      textTransform: 'uppercase',
                                      letterSpacing: '0.5px',
                                    }}
                                  >
                                    {isAcknowledged ? '✓' : '⏳'} {status}
                                  </span>
                                  {recipient.acknowledgedAt && (
                                    <span
                                      style={{
                                        color: '#999',
                                        fontSize: '0.7rem',
                                        fontFamily: "'SF Mono', Monaco, 'Cascadia Code', 'Roboto Mono', monospace",
                                      }}
                                    >
                                      {formatTimestamp(recipient.acknowledgedAt)}
                                    </span>
                                  )}
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      ) : (
                        <div style={{ marginTop: '8px', color: '#999' }}>
                          No recipients data
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        <div
          style={{
            marginTop: '35px',
            padding: '20px',
            background: '#1a1a1a',
            border: '1px solid #333',
            borderRadius: '12px',
            boxShadow: '0 4px 6px rgba(0,0,0,0.1)',
            backdropFilter: 'blur(15px)',
          }}
        >
          <h4
            style={{
              fontWeight: '600',
              color: '#fff',
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
              color: '#999',
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
            <li>Bot status is checked automatically and can be refreshed manually</li>
            <li>Broadcasts are disabled when bot is disconnected</li>
            <li>Image uploads: Max 20MB, supports JPG, PNG, GIF, WebP formats</li>
            <li>Can send text-only, image-only, or image with caption</li>
            <li>Images are converted to base64 and sent via Telegram's sendPhoto API</li>
            <li>API Base URL: {API_BASE_URL}</li>
          </ul>
        </div>
      </div>
    </div>
  );
};

export default TelegramBroadcast;