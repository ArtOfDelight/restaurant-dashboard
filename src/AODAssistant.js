import React, { useState, useRef, useEffect } from 'react';
import ReactMarkdown from 'react-markdown';

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
  const [showQuickQueries, setShowQuickQueries] = useState(true);
  const [isListening, setIsListening] = useState(false);
  const [copiedIdx, setCopiedIdx] = useState(null);
  const [feedbackGiven, setFeedbackGiven] = useState({});
  const chatEndRef = useRef(null);
  const recognitionRef = useRef(null);

  // Quick query templates
  const queryTemplates = [
    {
      category: 'Top Products',
      icon: '🏆',
      color: '#f59e0b',
      queries: [
        'Top 10 100gms flavours at Residency Road dine-in last 14 days',
        'Top 10 best selling products this week',
        'Top 5 products at Koramangala on Swiggy',
        'Top 10 2kg products last 7 days'
      ]
    },
    {
      category: 'Revenue & Sales',
      icon: '💰',
      color: '#10b981',
      queries: [
        'Total revenue this week vs last week',
        'Which products generate the most revenue?',
        'Revenue breakdown by channel last 7 days',
        'Compare sales Swiggy vs Zomato this month'
      ]
    },
    {
      category: 'Stock & Inventory',
      icon: '📦',
      color: '#ef4444',
      queries: [
        'Which products went out of stock last week?',
        'Stock issues at Indiranagar last 14 days',
        'Products with most stock-out events',
        'Stock correlation with sales drops'
      ]
    },
    {
      category: 'Growth & Trends',
      icon: '📈',
      color: '#8b5cf6',
      queries: [
        'Top 5 growing products last 7 days',
        'Top 5 declining products this week',
        'Channel-wise growth breakdown last 14 days',
        'Which outlets are growing fastest?'
      ]
    },
    {
      category: 'Outlet Analysis',
      icon: '🏪',
      color: '#3b82f6',
      queries: [
        'Compare outlet performance last 7 days',
        'Which outlet has best sales?',
        'Residency Road vs Koramangala comparison',
        'Worst performing outlet this week'
      ]
    },
    {
      category: 'Menu Engineering',
      icon: '⭐',
      color: '#ec4899',
      queries: [
        'Show me star products (high revenue + high volume)',
        'Which products are most profitable?',
        'Pareto analysis - top 20% revenue generators',
        'Products in Swiggy top 20 missing from Zomato'
      ]
    }
  ];

  // Initialize speech recognition
  useEffect(() => {
    if ('webkitSpeechRecognition' in window || 'SpeechRecognition' in window) {
      const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
      recognitionRef.current = new SpeechRecognition();
      recognitionRef.current.continuous = false;
      recognitionRef.current.interimResults = false;
      recognitionRef.current.lang = 'en-US';

      recognitionRef.current.onresult = (event) => {
        const transcript = event.results[0][0].transcript;
        setChatInput(prev => prev + (prev ? ' ' : '') + transcript);
        setIsListening(false);
      };

      recognitionRef.current.onerror = (event) => {
        console.error('Speech recognition error:', event.error);
        setIsListening(false);
      };

      recognitionRef.current.onend = () => {
        setIsListening(false);
      };
    }
  }, []);

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
      setFeedbackGiven({});
      localStorage.removeItem('aod-chat-history');
    }
  };

  // Toggle voice input
  const toggleVoiceInput = () => {
    if (!recognitionRef.current) {
      alert('Voice input is not supported in your browser. Try Chrome or Edge.');
      return;
    }

    if (isListening) {
      recognitionRef.current.stop();
      setIsListening(false);
    } else {
      recognitionRef.current.start();
      setIsListening(true);
    }
  };

  // Copy message to clipboard
  const copyToClipboard = async (text, idx) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedIdx(idx);
      setTimeout(() => setCopiedIdx(null), 2000);
    } catch (err) {
      console.error('Failed to copy:', err);
    }
  };

  // Handle feedback
  const handleFeedback = (idx, type) => {
    setFeedbackGiven(prev => ({ ...prev, [idx]: type }));
    // You could send this to your backend for analytics
    console.log(`Feedback for message ${idx}: ${type}`);
  };

  // Send message to chatbot
  const sendChatMessage = async (message) => {
    if (!message.trim()) return;

    console.log('Neo - Sending message:', message);
    console.log('API URL:', API_URL);

    setLoadingChat(true);

    // Add user message to chat
    const userMessage = { role: 'user', content: message, timestamp: new Date().toISOString() };
    setChatMessages(prev => [...prev, userMessage]);
    setChatInput('');

    try {
      // Get conversation history (last 10 messages for context)
      const conversationHistory = chatMessages.slice(-10);

      console.log('Calling API:', `${API_URL}/api/product-chat`);

      const response = await fetch(`${API_URL}/api/product-chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message,
          conversationHistory
        })
      });

      console.log('Response status:', response.status);

      const data = await response.json();

      console.log('Response data:', data);

      // Add AI response to chat
      const aiMessage = {
        role: 'assistant',
        content: data.response || 'I encountered an error processing your request.',
        data: data.data || null,
        followUpSuggestions: data.followUpSuggestions || [],
        timestamp: new Date().toISOString()
      };

      setChatMessages(prev => [...prev, aiMessage]);
    } catch (error) {
      console.error('Error calling chatbot:', error);
      setChatMessages(prev => [...prev, {
        role: 'assistant',
        content: 'Sorry, I encountered an error. Please try again.',
        error: true,
        originalMessage: message,
        timestamp: new Date().toISOString()
      }]);
    } finally {
      setLoadingChat(false);
    }
  };

  // Retry failed message
  const retryMessage = (originalMessage) => {
    // Remove the error message first
    setChatMessages(prev => prev.slice(0, -1));
    // Resend the original message
    sendChatMessage(originalMessage);
  };

  // Handle Enter key press
  const handleKeyPress = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendChatMessage(chatInput);
    }
  };

  // Format timestamp
  const formatTime = (timestamp) => {
    if (!timestamp) return new Date().toLocaleTimeString();
    return new Date(timestamp).toLocaleTimeString();
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
            NEO
          </h1>
          <p style={{
            margin: '10px 0 0 0',
            fontSize: '0.95rem',
            color: 'rgba(255, 255, 255, 0.9)',
            fontFamily: "'SF Mono', Monaco, 'Cascadia Code', 'Roboto Mono', monospace",
            letterSpacing: '1px'
          }}>
            AI-Powered Sales & Inventory Analysis
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
            Clear Chat
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
            <div style={{ fontSize: '4rem', marginBottom: '20px' }}>🤖</div>
            <h2 style={{
              fontFamily: "'SF Mono', Monaco, 'Cascadia Code', 'Roboto Mono', monospace",
              fontSize: '1.5rem',
              marginBottom: '15px',
              color: 'var(--text-primary)',
              letterSpacing: '2px'
            }}>
              Welcome to Neo
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
              <br /><br />
              Use the <strong>Quick Queries</strong> below or click the mic to speak!
            </p>
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
              wordBreak: 'break-word',
              boxShadow: msg.role === 'user'
                ? '0 4px 12px rgba(59, 130, 246, 0.3)'
                : '0 2px 8px rgba(0, 0, 0, 0.1)',
              position: 'relative'
            }}>
              {/* Message content with markdown for assistant */}
              {msg.role === 'assistant' ? (
                <div className="markdown-content" style={{
                  whiteSpace: 'pre-wrap',
                }}>
                  <ReactMarkdown
                    components={{
                      // Custom styling for markdown elements
                      p: ({children}) => <p style={{ margin: '0 0 10px 0' }}>{children}</p>,
                      ul: ({children}) => <ul style={{ margin: '10px 0', paddingLeft: '20px' }}>{children}</ul>,
                      ol: ({children}) => <ol style={{ margin: '10px 0', paddingLeft: '20px' }}>{children}</ol>,
                      li: ({children}) => <li style={{ margin: '4px 0' }}>{children}</li>,
                      strong: ({children}) => <strong style={{ color: 'var(--text-primary)' }}>{children}</strong>,
                      table: ({children}) => (
                        <table style={{
                          borderCollapse: 'collapse',
                          margin: '10px 0',
                          fontSize: '0.85rem',
                          width: '100%'
                        }}>{children}</table>
                      ),
                      th: ({children}) => (
                        <th style={{
                          border: '1px solid var(--border-light)',
                          padding: '8px',
                          background: 'var(--surface-dark)',
                          textAlign: 'left'
                        }}>{children}</th>
                      ),
                      td: ({children}) => (
                        <td style={{
                          border: '1px solid var(--border-light)',
                          padding: '8px'
                        }}>{children}</td>
                      ),
                      code: ({children}) => (
                        <code style={{
                          background: 'var(--surface-dark)',
                          padding: '2px 6px',
                          borderRadius: '4px',
                          fontSize: '0.85rem'
                        }}>{children}</code>
                      ),
                    }}
                  >
                    {msg.content}
                  </ReactMarkdown>
                </div>
              ) : (
                <span style={{ whiteSpace: 'pre-wrap' }}>{msg.content}</span>
              )}
            </div>

            {/* Action buttons row for assistant messages */}
            {msg.role === 'assistant' && (
              <div style={{
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                marginTop: '8px',
                flexWrap: 'wrap'
              }}>
                {/* Timestamp */}
                <span style={{
                  fontSize: '0.7rem',
                  color: 'var(--text-muted)',
                  fontFamily: "'SF Mono', Monaco, 'Cascadia Code', 'Roboto Mono', monospace"
                }}>
                  Neo • {formatTime(msg.timestamp)}
                </span>

                {/* Copy button */}
                <button
                  onClick={() => copyToClipboard(msg.content, idx)}
                  style={{
                    background: 'transparent',
                    border: 'none',
                    cursor: 'pointer',
                    padding: '4px 8px',
                    borderRadius: '4px',
                    fontSize: '0.75rem',
                    color: copiedIdx === idx ? '#10b981' : 'var(--text-muted)',
                    transition: 'all 0.2s',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '4px'
                  }}
                  title="Copy to clipboard"
                >
                  {copiedIdx === idx ? '✓ Copied' : '📋 Copy'}
                </button>

                {/* Feedback buttons */}
                {!msg.error && (
                  <>
                    <button
                      onClick={() => handleFeedback(idx, 'good')}
                      disabled={feedbackGiven[idx]}
                      style={{
                        background: feedbackGiven[idx] === 'good' ? 'rgba(16, 185, 129, 0.2)' : 'transparent',
                        border: feedbackGiven[idx] === 'good' ? '1px solid #10b981' : '1px solid transparent',
                        cursor: feedbackGiven[idx] ? 'default' : 'pointer',
                        padding: '4px 8px',
                        borderRadius: '4px',
                        fontSize: '0.75rem',
                        color: feedbackGiven[idx] === 'good' ? '#10b981' : 'var(--text-muted)',
                        transition: 'all 0.2s',
                        opacity: feedbackGiven[idx] && feedbackGiven[idx] !== 'good' ? 0.3 : 1
                      }}
                      title="Good response"
                    >
                      👍
                    </button>
                    <button
                      onClick={() => handleFeedback(idx, 'bad')}
                      disabled={feedbackGiven[idx]}
                      style={{
                        background: feedbackGiven[idx] === 'bad' ? 'rgba(239, 68, 68, 0.2)' : 'transparent',
                        border: feedbackGiven[idx] === 'bad' ? '1px solid #ef4444' : '1px solid transparent',
                        cursor: feedbackGiven[idx] ? 'default' : 'pointer',
                        padding: '4px 8px',
                        borderRadius: '4px',
                        fontSize: '0.75rem',
                        color: feedbackGiven[idx] === 'bad' ? '#ef4444' : 'var(--text-muted)',
                        transition: 'all 0.2s',
                        opacity: feedbackGiven[idx] && feedbackGiven[idx] !== 'bad' ? 0.3 : 1
                      }}
                      title="Bad response"
                    >
                      👎
                    </button>
                  </>
                )}

                {/* Retry button for error messages */}
                {msg.error && msg.originalMessage && (
                  <button
                    onClick={() => retryMessage(msg.originalMessage)}
                    disabled={loadingChat}
                    style={{
                      background: 'rgba(239, 68, 68, 0.1)',
                      border: '1px solid #ef4444',
                      cursor: loadingChat ? 'not-allowed' : 'pointer',
                      padding: '4px 12px',
                      borderRadius: '4px',
                      fontSize: '0.75rem',
                      color: '#ef4444',
                      transition: 'all 0.2s',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '4px'
                    }}
                  >
                    🔄 Retry
                  </button>
                )}
              </div>
            )}

            {/* User message timestamp */}
            {msg.role === 'user' && (
              <div style={{
                fontSize: '0.7rem',
                color: 'var(--text-muted)',
                marginTop: '5px',
                fontFamily: "'SF Mono', Monaco, 'Cascadia Code', 'Roboto Mono', monospace"
              }}>
                You • {formatTime(msg.timestamp)}
              </div>
            )}

            {/* Follow-up suggestions for assistant messages */}
            {msg.role === 'assistant' && msg.followUpSuggestions && msg.followUpSuggestions.length > 0 && idx === chatMessages.length - 1 && !loadingChat && (
              <div style={{
                display: 'flex',
                flexWrap: 'wrap',
                gap: '8px',
                marginTop: '12px',
                maxWidth: '80%'
              }}>
                {msg.followUpSuggestions.map((suggestion, sIdx) => (
                  <button
                    key={sIdx}
                    onClick={() => sendChatMessage(suggestion)}
                    style={{
                      background: 'var(--surface-dark)',
                      border: '1px solid var(--border-light)',
                      padding: '8px 12px',
                      borderRadius: '20px',
                      cursor: 'pointer',
                      fontFamily: "'SF Mono', Monaco, 'Cascadia Code', 'Roboto Mono', monospace",
                      fontSize: '0.75rem',
                      color: 'var(--text-secondary)',
                      transition: 'all 0.2s',
                      whiteSpace: 'nowrap'
                    }}
                    onMouseEnter={(e) => {
                      e.target.style.background = 'linear-gradient(135deg, #3b82f6 0%, #8b5cf6 100%)';
                      e.target.style.color = 'white';
                      e.target.style.borderColor = 'transparent';
                    }}
                    onMouseLeave={(e) => {
                      e.target.style.background = 'var(--surface-dark)';
                      e.target.style.color = 'var(--text-secondary)';
                      e.target.style.borderColor = 'var(--border-light)';
                    }}
                  >
                    {suggestion}
                  </button>
                ))}
              </div>
            )}
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
            Neo is thinking...
            <style>
              {`
                @keyframes spin {
                  0% { transform: rotate(0deg); }
                  100% { transform: rotate(360deg); }
                }
                @keyframes pulse {
                  0%, 100% { opacity: 1; }
                  50% { opacity: 0.5; }
                }
              `}
            </style>
          </div>
        )}

        <div ref={chatEndRef} />
      </div>

      {/* Quick Queries Panel - Always visible, collapsible */}
      <div style={{
        background: 'var(--surface-light)',
        borderTop: '1px solid var(--border-light)',
        borderBottom: '1px solid var(--border-light)'
      }}>
        {/* Toggle Header */}
        <button
          onClick={() => setShowQuickQueries(!showQuickQueries)}
          style={{
            width: '100%',
            background: 'transparent',
            border: 'none',
            padding: '12px 20px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            cursor: 'pointer',
            color: 'var(--text-primary)',
            fontFamily: "'SF Mono', Monaco, 'Cascadia Code', 'Roboto Mono', monospace"
          }}
        >
          <span style={{ fontSize: '0.85rem', fontWeight: '600', letterSpacing: '1px' }}>
            QUICK QUERIES
          </span>
          <span style={{ fontSize: '1.2rem', transition: 'transform 0.2s', transform: showQuickQueries ? 'rotate(180deg)' : 'rotate(0deg)' }}>
            ▼
          </span>
        </button>

        {/* Collapsible Content */}
        {showQuickQueries && (
          <div style={{
            padding: '0 20px 15px 20px',
            display: 'flex',
            flexWrap: 'wrap',
            gap: '8px',
            maxHeight: '200px',
            overflowY: 'auto'
          }}>
            {queryTemplates.map((section, sectionIdx) => (
              <div key={sectionIdx} style={{ display: 'contents' }}>
                {section.queries.map((query, idx) => (
                  <button
                    key={`${sectionIdx}-${idx}`}
                    onClick={() => {
                      setChatInput(query);
                      setTimeout(() => sendChatMessage(query), 100);
                    }}
                    disabled={loadingChat}
                    style={{
                      background: 'var(--surface-dark)',
                      border: `1px solid ${section.color}50`,
                      padding: '8px 12px',
                      borderRadius: '6px',
                      cursor: loadingChat ? 'not-allowed' : 'pointer',
                      fontFamily: "'SF Mono', Monaco, 'Cascadia Code', 'Roboto Mono', monospace",
                      fontSize: '0.75rem',
                      color: 'var(--text-primary)',
                      transition: 'all 0.2s',
                      whiteSpace: 'nowrap',
                      opacity: loadingChat ? 0.5 : 1
                    }}
                    onMouseEnter={(e) => {
                      if (!loadingChat) {
                        e.target.style.background = section.color;
                        e.target.style.color = 'white';
                        e.target.style.transform = 'scale(1.02)';
                      }
                    }}
                    onMouseLeave={(e) => {
                      e.target.style.background = 'var(--surface-dark)';
                      e.target.style.color = 'var(--text-primary)';
                      e.target.style.transform = 'scale(1)';
                    }}
                  >
                    {section.icon} {query}
                  </button>
                ))}
              </div>
            ))}
          </div>
        )}
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
        {/* Voice Input Button */}
        <button
          onClick={toggleVoiceInput}
          disabled={loadingChat}
          style={{
            background: isListening
              ? 'linear-gradient(135deg, #ef4444 0%, #dc2626 100%)'
              : 'var(--surface-dark)',
            border: isListening ? 'none' : '1px solid var(--border-light)',
            color: isListening ? 'white' : 'var(--text-primary)',
            padding: '15px',
            borderRadius: '10px',
            cursor: loadingChat ? 'not-allowed' : 'pointer',
            fontSize: '1.2rem',
            transition: 'all 0.2s',
            animation: isListening ? 'pulse 1.5s ease-in-out infinite' : 'none',
            opacity: loadingChat ? 0.5 : 1
          }}
          title={isListening ? 'Stop listening' : 'Start voice input'}
        >
          {isListening ? '🔴' : '🎤'}
        </button>

        <textarea
          value={chatInput}
          onChange={(e) => setChatInput(e.target.value)}
          onKeyPress={handleKeyPress}
          placeholder={isListening ? 'Listening...' : 'Ask me anything about your sales, products, or inventory...'}
          disabled={loadingChat}
          style={{
            flex: 1,
            background: 'var(--surface-dark)',
            color: 'var(--text-primary)',
            border: isListening ? '2px solid #ef4444' : '1px solid var(--border-light)',
            padding: '15px',
            borderRadius: '10px',
            fontFamily: "'SF Mono', Monaco, 'Cascadia Code', 'Roboto Mono', monospace",
            fontSize: '0.9rem',
            resize: 'none',
            minHeight: '60px',
            maxHeight: '150px',
            outline: 'none',
            transition: 'border-color 0.2s'
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
        Press Enter to send | Shift+Enter for new line | Click 🎤 to speak | 👍👎 to give feedback
      </div>
    </div>
  );
}

export default AODAssistant;
