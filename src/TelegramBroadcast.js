import React, { useState } from 'react';

const TelegramBroadcast = () => {
  const [message, setMessage] = useState('');
  const [selectedUsers, setSelectedUsers] = useState([]);
  const [botToken, setBotToken] = useState('8045705611:AAEB8j3V_uyJbb_2uTmNE438xO1Y7G01yZM');
  const [sending, setSending] = useState(false);
  const [sendResults, setSendResults] = useState([]);

  const chatIds = {
    'Nishat': '700113654',
    'Jatin': '1225343546',
  };

  const allUsers = [
    'Ajay', 'Jin', 'Kim', 'Nishat', 'Sailo', 'Minthang', 'Mangboi', 'Zansung',
    'Margaret', 'Kai', 'Risat', 'Thai', 'Jatin', 'Boikho', 'Jimmy', 'Kaiku',
    'Pau', 'Puia', 'Lamgouhao', 'Charna', 'Mang Khogin Haokip', 'Jonathan',
    'Henry Kom', 'Len Kipgen', 'William', 'Jona', 'Mimin', 'Guang',
    'Henry Khongsai', 'Prajesha', 'Sang', 'Obed', 'Thangboi', 'Jangnu',
    'Chong', 'Hoi', 'Sibtain', 'Biraj Bhai', 'Jangminlun', 'Ismael'
  ];

  const handleUserSelect = (event) => {
    const value = event.target.value;
    if (value && !selectedUsers.includes(value)) {
      setSelectedUsers([...selectedUsers, value]);
    }
  };

  const removeUser = (userToRemove) => {
    setSelectedUsers(selectedUsers.filter(user => user !== userToRemove));
  };

  const sendToTelegram = async (chatId, text) => {
    const url = `https://api.telegram.org/bot${botToken}/sendMessage`;
    
    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          chat_id: chatId,
          text: text,
        }),
      });

      const result = await response.json();
      return { success: response.ok, data: result, chatId };
    } catch (error) {
      return { success: false, error: error.message, chatId };
    }
  };

  const handleSend = async () => {
    if (!message.trim() || selectedUsers.length === 0 || !botToken.trim()) {
      alert('Please fill in all fields: bot token, message, and select at least one user');
      return;
    }

    setSending(true);
    setSendResults([]);

    const results = [];
    
    for (const user of selectedUsers) {
      const chatId = chatIds[user];
      if (chatId) {
        const result = await sendToTelegram(chatId, message);
        results.push({ user, ...result });
      } else {
        results.push({ 
          user, 
          success: false, 
          error: 'Chat ID not configured',
          chatId: 'N/A'
        });
      }
    }

    setSendResults(results);
    setSending(false);
  };

  return (
    <div style={{
      maxWidth: '672px',
      margin: '0 auto',
      padding: '24px',
      backgroundColor: '#ffffff',
      borderRadius: '8px',
      boxShadow: '0 4px 6px rgba(0, 0, 0, 0.1)'
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '24px' }}>
        <svg width="24" height="24" viewBox="0 0 24 24" fill="#3b82f6">
          <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
        </svg>
        <h2 style={{ fontSize: '24px', fontWeight: '700', color: '#1f2937' }}>
          Telegram Broadcast
        </h2>
      </div>

      <div style={{ marginBottom: '16px' }}>
        <label htmlFor="botToken" style={{
          display: 'block',
          fontSize: '14px',
          fontWeight: '500',
          color: '#374151',
          marginBottom: '8px'
        }}>
          Telegram Bot Token
        </label>
        <input
          type="password"
          id="botToken"
          value={botToken}
          onChange={(e) => setBotToken(e.target.value)}
          placeholder="Enter your Telegram bot token"
          style={{
            width: '100%',
            padding: '8px 12px',
            border: '1px solid #d1d5db',
            borderRadius: '4px',
            outline: 'none',
            transition: 'border-color 0.2s'
          }}
          onFocus={(e) => e.target.style.borderColor = '#3b82f6'}
          onBlur={(e) => e.target.style.borderColor = '#d1d5db'}
        />
      </div>

      <div style={{ marginBottom: '16px' }}>
        <label htmlFor="message" style={{
          display: 'block',
          fontSize: '14px',
          fontWeight: '500',
          color: '#374151',
          marginBottom: '8px'
        }}>
          Broadcast Message
        </label>
        <textarea
          id="message"
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          placeholder="Type your broadcast message here..."
          rows={4}
          style={{
            width: '100%',
            padding: '8px 12px',
            border: '1px solid #d1d5db',
            borderRadius: '4px',
            outline: 'none',
            resize: 'none',
            transition: 'border-color 0.2s'
          }}
          onFocus={(e) => e.target.style.borderColor = '#3b82f6'}
          onBlur={(e) => e.target.style.borderColor = '#d1d5db'}
        />
      </div>

      <div style={{ marginBottom: '16px' }}>
        <label htmlFor="userSelect" style={{
          display: 'block',
          fontSize: '14px',
          fontWeight: '500',
          color: '#374151',
          marginBottom: '8px'
        }}>
          Select Recipients
        </label>
        <select
          id="userSelect"
          onChange={handleUserSelect}
          value=""
          style={{
            width: '100%',
            padding: '8px 12px',
            border: '1px solid #d1d5db',
            borderRadius: '4px',
            outline: 'none',
            transition: 'border-color 0.2s'
          }}
          onFocus={(e) => e.target.style.borderColor = '#3b82f6'}
          onBlur={(e) => e.target.style.borderColor = '#d1d5db'}
        >
          <option value="">Choose users to add...</option>
          {allUsers.map(user => (
            <option key={user} value={user} disabled={selectedUsers.includes(user)}>
              {user} {chatIds[user] ? `(${chatIds[user]})` : '(No Chat ID)'}
            </option>
          ))}
        </select>
      </div>

      {selectedUsers.length > 0 && (
        <div style={{ marginBottom: '16px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="#4b5563">
              <path d="M15 19a3 3 0 0 1-6 0H3a3 3 0 0 1 3-3h12a3 3 0 0 1 3 3h-6zM12 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8z"/>
            </svg>
            <span style={{ fontSize: '14px', fontWeight: '500', color: '#374151' }}>
              Selected Recipients:
            </span>
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
            {selectedUsers.map(user => (
              <span
                key={user}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '4px',
                  padding: '4px 8px',
                  backgroundColor: '#dbeafe',
                  color: '#1e40af',
                  fontSize: '14px',
                  borderRadius: '9999px'
                }}
              >
                {user}
                {!chatIds[user] && <span style={{ color: '#dc2626', fontSize: '12px' }}>(No ID)</span>}
                <button
                  onClick={() => removeUser(user)}
                  style={{ marginLeft: '4px', color: '#1e40af', cursor: 'pointer' }}
                  onMouseOver={(e) => e.target.style.color = '#1e3a8a'}
                  onMouseOut={(e) => e.target.style.color = '#1e40af'}
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
        disabled={sending || !message.trim() || selectedUsers.length === 0 || !botToken.trim()}
        style={{
          width: '100%',
          backgroundColor: sending || !message.trim() || selectedUsers.length === 0 || !botToken.trim() ? '#9ca3af' : '#3b82f6',
          color: '#ffffff',
          fontWeight: '500',
          padding: '8px 16px',
          borderRadius: '4px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          gap: '8px',
          cursor: sending || !message.trim() || selectedUsers.length === 0 || !botToken.trim() ? 'not-allowed' : 'pointer',
          transition: 'background-color 0.2s'
        }}
        onMouseOver={(e) => {
          if (!sending && message.trim() && selectedUsers.length > 0 && botToken.trim()) {
            e.target.style.backgroundColor = '#2563eb';
          }
        }}
        onMouseOut={(e) => {
          if (!sending && message.trim() && selectedUsers.length > 0 && botToken.trim()) {
            e.target.style.backgroundColor = '#3b82f6';
          }
        }}
      >
        <svg width="16" height="16" viewBox="0 0 24 24" fill="#ffffff">
          <path d="M2.01 21L23 12 2.01 3v7l15 2-15 2z"/>
        </svg>
        {sending ? 'Sending...' : `Send to ${selectedUsers.length} recipient${selectedUsers.length !== 1 ? 's' : ''}`}
      </button>

      {sendResults.length > 0 && (
        <div style={{ marginTop: '24px' }}>
          <h3 style={{ fontSize: '18px', fontWeight: '500', color: '#1f2937', marginBottom: '12px' }}>
            Send Results:
          </h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            {sendResults.map((result, index) => (
              <div
                key={index}
                style={{
                  padding: '12px',
                  borderRadius: '4px',
                  border: `1px solid ${result.success ? '#dcfce7' : '#fee2e2'}`,
                  backgroundColor: result.success ? '#f0fdf4' : '#fef2f2'
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ fontWeight: '500' }}>{result.user}</span>
                  <span style={{ fontSize: '14px', color: result.success ? '#16a34a' : '#dc2626' }}>
                    {result.success ? '✓ Sent' : '✗ Failed'}
                  </span>
                </div>
                {!result.success && (
                  <p style={{ fontSize: '14px', color: '#dc2626', marginTop: '4px' }}>
                    Error: {result.error}
                  </p>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      <div style={{
        marginTop: '24px',
        padding: '16px',
        backgroundColor: '#fefce8',
        border: '1px solid #fef08a',
        borderRadius: '4px'
      }}>
        <h4 style={{ fontWeight: '500', color: '#713f12', marginBottom: '8px' }}>
          Configuration Notes:
        </h4>
        <ul style={{ fontSize: '14px', color: '#854d0e', listStyleType: 'disc', paddingLeft: '20px' }}>
          <li>Currently configured: Nishat (700113654), Jatin (1225343546)</li>
          <li>To add more chat IDs, update the chatIds object in the code</li>
          <li>Your bot token is required to send messages</li>
          <li>Users without chat IDs will show an error when sending</li>
        </ul>
      </div>
    </div>
  );
};

export default TelegramBroadcast;