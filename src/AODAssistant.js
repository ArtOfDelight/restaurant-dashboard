import React, { useState, useRef, useEffect } from 'react';

const API_URL = process.env.REACT_APP_API_BASE_URL || process.env.REACT_APP_API_URL || 'http://localhost:5000';

function AODAssistant() {
  const [chatMessages, setChatMessages] = useState(() => {
    // Load chat history from localStorage on mount
    try {
      const saved = localStorage.getItem('aod-chat-history');
      return saved ? JSON.parse(saved) : [];
    } catch (e) {
      console.error('Failed to load chat history:', e);
      return [];
    }
  });
  const [chatInput, setChatInput] = useState('');
  const [loadingChat, setLoadingChat] = useState(false);
  const chatEndRef = useRef(null);

  // Save chat history to localStorage whenever messages change
  useEffect(() => {
    try {
      localStorage.setItem('aod-chat-history', JSON.stringify(chatMessages));
    } catch (e) {
      console.error('Failed to save chat history:', e);
    }
  }, [chatMessages]);

  // Auto-scroll to bottom when messages change
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [chatMessages]);

  // Clear chat history
  const clearChatHistory = () => {
    if (window.confirm('Clear all chat history? This cannot be undone.')) {
      setChatMessages([]);
      localStorage.removeItem('aod-chat-history');
    }
  };

  // Send message to chatbot
  const sendChatMessage = async (message) => {
    if (!message.trim()) return;

    console.log('🤖 AOD Assistant - Sending message:', message);
    console.log('🤖 API URL:', API_URL);

    setLoadingChat(true);

    // Add user message to chat
    const userMessage = { role: 'user', content: message };
    setChatMessages(prev => [...prev, userMessage]);
    setChatInput('');

    try {
      // Get conversation history (last 10 messages for context)
      const conversationHistory = chatMessages.slice(-10);

      console.log('🤖 Calling API:', `${API_URL}/api/product-chat`);
      console.log('🤖 Request body:', { message, conversationHistory });

      const response = await fetch(`${API_URL}/api/product-chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message,
          conversationHistory
        })
      });

      console.log('🤖 Response status:', response.status);
      console.log('🤖 Response ok:', response.ok);

      const data = await response.json();

      console.log('🤖 Response data:', data);

      // Add AI response to chat
      const aiMessage = {
        role: 'assistant',
        content: data.response || 'I encountered an error processing your request.',
        data: data.data || null
      };

      console.log('🤖 AI message:', aiMessage);

      setChatMessages(prev => [...prev, aiMessage]);
    } catch (error) {
      console.error('🤖 Error calling chatbot:', error);
      console.error('🤖 Error stack:', error.stack);
      setChatMessages(prev => [...prev, {
        role: 'assistant',
        content: 'Sorry, I encountered an error. Please try again. Error: ' + error.message,
        error: true
      }]);
    } finally {
      setLoadingChat(false);
      console.log('🤖 Chat request complete');
    }
  };

  // Handle Enter key press
  const handleKeyPress = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendChatMessage(chatInput);
    }
  };

  return (
    <div style={{
      minHeight: 'calc(100vh - 200px)',
      display: 'flex',
      flexDirection: 'column',
      background: 'var(--surface-dark)',
      borderRadius: '20px',
      margin: '0 auto',
      maxWidth: '1400px',
      boxShadow: 'var(--shadow-dark)',
      border: '1px solid var(--border-light)',
      overflow: 'hidden'
    }}>
      {/* Header */}
      <div style={{
        background: 'linear-gradient(135deg, #3b82f6 0%, #8b5cf6 100%)',
        padding: '30px',
        borderBottom: '2px solid rgba(255, 255, 255, 0.1)',
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center'
      }}>
        <div>
          <h1 style={{
            margin: 0,
            fontSize: '2rem',
            fontFamily: "'SF Mono', Monaco, 'Cascadia Code', 'Roboto Mono', monospace",
            textTransform: 'uppercase',
            letterSpacing: '3px',
            color: 'white',
            textShadow: '2px 2px 4px rgba(0, 0, 0, 0.3)'
          }}>
            🤖 AOD ASSISTANT
          </h1>
          <p style={{
            margin: '10px 0 0 0',
            fontSize: '0.95rem',
            color: 'rgba(255, 255, 255, 0.9)',
            fontFamily: "'SF Mono', Monaco, 'Cascadia Code', 'Roboto Mono', monospace",
            letterSpacing: '1px'
          }}>
            AI-Powered Sales & Inventory Analysis • Ask me anything about your products, sales, or stock
          </p>
        </div>
        {chatMessages.length > 0 && (
          <button
            onClick={clearChatHistory}
            style={{
              background: 'rgba(255, 255, 255, 0.2)',
              border: '1px solid rgba(255, 255, 255, 0.3)',
              color: 'white',
              padding: '10px 20px',
              borderRadius: '8px',
              cursor: 'pointer',
              fontFamily: "'SF Mono', Monaco, 'Cascadia Code', 'Roboto Mono', monospace",
              fontSize: '0.85rem',
              fontWeight: '600',
              textTransform: 'uppercase',
              letterSpacing: '1px',
              transition: 'all 0.2s',
              whiteSpace: 'nowrap'
            }}
            onMouseEnter={(e) => {
              e.target.style.background = 'rgba(239, 68, 68, 0.3)';
              e.target.style.borderColor = '#ef4444';
            }}
            onMouseLeave={(e) => {
              e.target.style.background = 'rgba(255, 255, 255, 0.2)';
              e.target.style.borderColor = 'rgba(255, 255, 255, 0.3)';
            }}
          >
            🗑️ Clear Chat
          </button>
        )}
      </div>

      {/* Chat Messages Area */}
      <div style={{
        flex: 1,
        overflowY: 'auto',
        padding: '30px',
        background: 'var(--surface-dark)',
        minHeight: '500px',
        maxHeight: '600px'
      }}>
        {chatMessages.length === 0 && (
          <div style={{
            textAlign: 'center',
            padding: '60px 20px',
            color: 'var(--text-secondary)'
          }}>
            <div style={{
              fontSize: '4rem',
              marginBottom: '20px'
            }}>🤖</div>
            <h2 style={{
              fontFamily: "'SF Mono', Monaco, 'Cascadia Code', 'Roboto Mono', monospace",
              fontSize: '1.5rem',
              marginBottom: '15px',
              color: 'var(--text-primary)',
              letterSpacing: '2px'
            }}>
              Welcome to AOD Assistant
            </h2>
            <p style={{
              fontFamily: "'SF Mono', Monaco, 'Cascadia Code', 'Roboto Mono', monospace",
              fontSize: '0.95rem',
              lineHeight: '1.8',
              maxWidth: '600px',
              margin: '0 auto',
              color: 'var(--text-secondary)'
            }}>
              I can help you analyze sales, track inventory, and understand the relationship between stock-outs and sales performance.
            </p>

            <div style={{
              marginTop: '40px',
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))',
              gap: '15px',
              maxWidth: '800px',
              margin: '40px auto 0'
            }}>
              {[
                'Which items went out of stock last week?',
                'What are the best selling products?',
                'Show me low-rated products',
                'Compare this week vs last week'
              ].map((suggestion, idx) => (
                <button
                  key={idx}
                  onClick={() => {
                    setChatInput(suggestion);
                    setTimeout(() => sendChatMessage(suggestion), 100);
                  }}
                  style={{
                    background: 'var(--surface-light)',
                    border: '1px solid var(--border-light)',
                    padding: '15px',
                    borderRadius: '10px',
                    cursor: 'pointer',
                    fontFamily: "'SF Mono', Monaco, 'Cascadia Code', 'Roboto Mono', monospace",
                    fontSize: '0.85rem',
                    color: 'var(--text-primary)',
                    transition: 'all 0.2s',
                    textAlign: 'left'
                  }}
                  onMouseEnter={(e) => {
                    e.target.style.background = 'var(--border-light)';
                    e.target.style.transform = 'translateY(-2px)';
                  }}
                  onMouseLeave={(e) => {
                    e.target.style.background = 'var(--surface-light)';
                    e.target.style.transform = 'translateY(0)';
                  }}
                >
                  💡 {suggestion}
                </button>
              ))}
            </div>
          </div>
        )}

        {chatMessages.map((msg, idx) => (
          <div
            key={idx}
            style={{
              marginBottom: '20px',
              display: 'flex',
              flexDirection: 'column',
              alignItems: msg.role === 'user' ? 'flex-end' : 'flex-start'
            }}
          >
            <div style={{
              maxWidth: '80%',
              background: msg.role === 'user'
                ? 'linear-gradient(135deg, #3b82f6 0%, #8b5cf6 100%)'
                : msg.error
                  ? 'rgba(239, 68, 68, 0.2)'
                  : 'var(--surface-light)',
              color: msg.role === 'user' ? 'white' : 'var(--text-primary)',
              padding: '15px 20px',
              borderRadius: '15px',
              border: msg.role === 'user'
                ? 'none'
                : msg.error
                  ? '1px solid #ef4444'
                  : '1px solid var(--border-light)',
              fontFamily: "'SF Mono', Monaco, 'Cascadia Code', 'Roboto Mono', monospace",
              fontSize: '0.9rem',
              lineHeight: '1.6',
              whiteSpace: 'pre-wrap',
              wordBreak: 'break-word',
              boxShadow: msg.role === 'user'
                ? '0 4px 12px rgba(59, 130, 246, 0.3)'
                : '0 2px 8px rgba(0, 0, 0, 0.1)'
            }}>
              {msg.content}
            </div>
            <div style={{
              fontSize: '0.7rem',
              color: 'var(--text-muted)',
              marginTop: '5px',
              fontFamily: "'SF Mono', Monaco, 'Cascadia Code', 'Roboto Mono', monospace"
            }}>
              {msg.role === 'user' ? 'You' : 'AOD Assistant'} • {new Date().toLocaleTimeString()}
            </div>
          </div>
        ))}

        {loadingChat && (
          <div style={{
            display: 'flex',
            alignItems: 'center',
            gap: '10px',
            padding: '15px',
            color: 'var(--text-secondary)',
            fontFamily: "'SF Mono', Monaco, 'Cascadia Code', 'Roboto Mono', monospace",
            fontSize: '0.9rem'
          }}>
            <div style={{
              width: '20px',
              height: '20px',
              border: '2px solid var(--border-light)',
              borderTop: '2px solid var(--text-primary)',
              borderRadius: '50%',
              animation: 'spin 1s linear infinite'
            }} />
            AOD Assistant is thinking...
            <style>
              {`
                @keyframes spin {
                  0% { transform: rotate(0deg); }
                  100% { transform: rotate(360deg); }
                }
              `}
            </style>
          </div>
        )}

        <div ref={chatEndRef} />
      </div>

      {/* Input Area */}
      <div style={{
        padding: '20px 30px',
        background: 'var(--surface-light)',
        borderTop: '1px solid var(--border-light)',
        display: 'flex',
        gap: '15px',
        alignItems: 'center'
      }}>
        <textarea
          value={chatInput}
          onChange={(e) => setChatInput(e.target.value)}
          onKeyPress={handleKeyPress}
          placeholder="Ask me anything about your sales, products, or inventory..."
          disabled={loadingChat}
          style={{
            flex: 1,
            background: 'var(--surface-dark)',
            color: 'var(--text-primary)',
            border: '1px solid var(--border-light)',
            padding: '15px',
            borderRadius: '10px',
            fontFamily: "'SF Mono', Monaco, 'Cascadia Code', 'Roboto Mono', monospace",
            fontSize: '0.9rem',
            resize: 'none',
            minHeight: '60px',
            maxHeight: '150px',
            outline: 'none'
          }}
        />
        <button
          onClick={() => sendChatMessage(chatInput)}
          disabled={loadingChat || !chatInput.trim()}
          style={{
            background: loadingChat || !chatInput.trim()
              ? 'var(--surface-light)'
              : 'linear-gradient(135deg, #3b82f6 0%, #8b5cf6 100%)',
            color: loadingChat || !chatInput.trim() ? 'var(--text-muted)' : 'white',
            border: 'none',
            padding: '15px 30px',
            borderRadius: '10px',
            cursor: loadingChat || !chatInput.trim() ? 'not-allowed' : 'pointer',
            fontFamily: "'SF Mono', Monaco, 'Cascadia Code', 'Roboto Mono', monospace",
            fontSize: '0.9rem',
            fontWeight: '600',
            textTransform: 'uppercase',
            letterSpacing: '1px',
            transition: 'all 0.2s',
            boxShadow: loadingChat || !chatInput.trim()
              ? 'none'
              : '0 4px 12px rgba(59, 130, 246, 0.3)',
            minWidth: '100px'
          }}
          onMouseEnter={(e) => {
            if (!loadingChat && chatInput.trim()) {
              e.target.style.transform = 'translateY(-2px)';
              e.target.style.boxShadow = '0 6px 16px rgba(59, 130, 246, 0.4)';
            }
          }}
          onMouseLeave={(e) => {
            e.target.style.transform = 'translateY(0)';
            e.target.style.boxShadow = loadingChat || !chatInput.trim()
              ? 'none'
              : '0 4px 12px rgba(59, 130, 246, 0.3)';
          }}
        >
          {loadingChat ? '...' : 'SEND'}
        </button>
      </div>

      {/* Footer Info */}
      <div style={{
        padding: '15px 30px',
        background: 'var(--surface-dark)',
        borderTop: '1px solid var(--border-light)',
        fontSize: '0.75rem',
        color: 'var(--text-muted)',
        fontFamily: "'SF Mono', Monaco, 'Cascadia Code', 'Roboto Mono', monospace",
        textAlign: 'center'
      }}>
        💡 TIP: Press Enter to send • Shift+Enter for new line • AI analyzes sales + inventory together
      </div>
    </div>
  );
}

export default AODAssistant;
