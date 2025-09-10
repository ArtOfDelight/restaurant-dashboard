import React, { useState } from 'react';
import { Send, Users, MessageCircle } from 'lucide-react';

const TelegramBroadcast = () => {
  const [message, setMessage] = useState('');
  const [selectedUsers, setSelectedUsers] = useState([]);
  const [botToken, setBotToken] = useState('8045705611:AAEB8j3V_uyJbb_2uTmNE438xO1Y7G01yZM');
  const [sending, setSending] = useState(false);
  const [sendResults, setSendResults] = useState([]);

  // Current chat IDs mapping (you can add more later)
  const chatIds = {
    'Nishat': '700113654',
    'Jatin': '1225343546',
    // Add more chat IDs here later:
    // 'Ajay': 'CHAT_ID',
    // 'Jin': 'CHAT_ID',
    // etc.
  };

  // All user names for dropdown
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
    <div className="max-w-2xl mx-auto p-6 bg-white rounded-lg shadow-lg">
      <div className="flex items-center gap-2 mb-6">
        <MessageCircle className="h-6 w-6 text-blue-500" />
        <h2 className="text-2xl font-bold text-gray-800">Telegram Broadcast</h2>
      </div>

      {/* Bot Token Input */}
      <div className="mb-4">
        <label htmlFor="botToken" className="block text-sm font-medium text-gray-700 mb-2">
          Telegram Bot Token
        </label>
        <input
          type="password"
          id="botToken"
          value={botToken}
          onChange={(e) => setBotToken(e.target.value)}
          placeholder="Enter your Telegram bot token"
          className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
        />
      </div>

      {/* Message Input */}
      <div className="mb-4">
        <label htmlFor="message" className="block text-sm font-medium text-gray-700 mb-2">
          Broadcast Message
        </label>
        <textarea
          id="message"
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          placeholder="Type your broadcast message here..."
          rows={4}
          className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent resize-none"
        />
      </div>

      {/* User Selection */}
      <div className="mb-4">
        <label htmlFor="userSelect" className="block text-sm font-medium text-gray-700 mb-2">
          Select Recipients
        </label>
        <select
          id="userSelect"
          onChange={handleUserSelect}
          value=""
          className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
        >
          <option value="">Choose users to add...</option>
          {allUsers.map(user => (
            <option key={user} value={user} disabled={selectedUsers.includes(user)}>
              {user} {chatIds[user] ? `(${chatIds[user]})` : '(No Chat ID)'}
            </option>
          ))}
        </select>
      </div>

      {/* Selected Users */}
      {selectedUsers.length > 0 && (
        <div className="mb-4">
          <div className="flex items-center gap-2 mb-2">
            <Users className="h-4 w-4 text-gray-600" />
            <span className="text-sm font-medium text-gray-700">Selected Recipients:</span>
          </div>
          <div className="flex flex-wrap gap-2">
            {selectedUsers.map(user => (
              <span
                key={user}
                className="inline-flex items-center gap-1 px-2 py-1 bg-blue-100 text-blue-800 text-sm rounded-full"
              >
                {user}
                {!chatIds[user] && <span className="text-red-500 text-xs">(No ID)</span>}
                <button
                  onClick={() => removeUser(user)}
                  className="ml-1 text-blue-600 hover:text-blue-800"
                >
                  ×
                </button>
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Send Button */}
      <button
        onClick={handleSend}
        disabled={sending || !message.trim() || selectedUsers.length === 0 || !botToken.trim()}
        className="w-full bg-blue-500 hover:bg-blue-600 disabled:bg-gray-400 disabled:cursor-not-allowed text-white font-medium py-2 px-4 rounded-md flex items-center justify-center gap-2 transition-colors"
      >
        <Send className="h-4 w-4" />
        {sending ? 'Sending...' : `Send to ${selectedUsers.length} recipient${selectedUsers.length !== 1 ? 's' : ''}`}
      </button>

      {/* Results */}
      {sendResults.length > 0 && (
        <div className="mt-6">
          <h3 className="text-lg font-medium text-gray-800 mb-3">Send Results:</h3>
          <div className="space-y-2">
            {sendResults.map((result, index) => (
              <div
                key={index}
                className={`p-3 rounded-md ${result.success ? 'bg-green-100 border-green-200' : 'bg-red-100 border-red-200'} border`}
              >
                <div className="flex justify-between items-center">
                  <span className="font-medium">{result.user}</span>
                  <span className={`text-sm ${result.success ? 'text-green-600' : 'text-red-600'}`}>
                    {result.success ? '✓ Sent' : '✗ Failed'}
                  </span>
                </div>
                {!result.success && (
                  <p className="text-sm text-red-600 mt-1">
                    Error: {result.error}
                  </p>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Configuration Note */}
      <div className="mt-6 p-4 bg-yellow-50 border border-yellow-200 rounded-md">
        <h4 className="font-medium text-yellow-800 mb-2">Configuration Notes:</h4>
        <ul className="text-sm text-yellow-700 space-y-1">
          <li>• Currently configured: Nishat (700113654), Jatin (1225343546)</li>
          <li>• To add more chat IDs, update the chatIds object in the code</li>
          <li>• Your bot token is required to send messages</li>
          <li>• Users without chat IDs will show an error when sending</li>
        </ul>
      </div>
    </div>
  );
};

export default TelegramBroadcast;