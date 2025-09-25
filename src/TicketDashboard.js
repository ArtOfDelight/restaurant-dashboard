import React, { useState, useEffect, useCallback } from 'react';
import './TicketDashboard.css';

const API_URL = process.env.REACT_APP_API_BASE_URL || 'http://localhost:5000';

// Updated predefined assignee names
const ASSIGNEE_OPTIONS = ['Jatin', 'Nishat', 'Kim', 'Ajay', 'Ayaaz', 'Sharon'];

// FIXED: Updated ticket types to match bot structure
const TICKET_TYPES = {
  REPAIR_MAINTENANCE: 'Repair and Maintenance',
  DIFFICULTY_IN_ORDER: 'Difficulty in Order', // NEW: From bot
  STOCK_ITEMS: 'Stock Items',
  HOUSEKEEPING: 'Housekeeping', 
  OTHERS: 'Others'
};

// FIXED: Auto-assignment rules to match bot
const AUTO_ASSIGNMENT_RULES = {
  [TICKET_TYPES.REPAIR_MAINTENANCE]: ['Nishat'],
  [TICKET_TYPES.DIFFICULTY_IN_ORDER]: [], // NEW: No specific assignment
  [TICKET_TYPES.STOCK_ITEMS]: ['Nishat', 'Ajay'],
  [TICKET_TYPES.HOUSEKEEPING]: ['Kim'],
  [TICKET_TYPES.OTHERS]: ['Kim']
};

// Status options
const STATUS_OPTIONS = ['Open', 'In Progress', 'Resolved'];

// FIXED: Updated tab configuration to match bot structure
const TABS = [
  { id: 'repair', label: 'Repair & Maintenance', icon: '🔧', type: TICKET_TYPES.REPAIR_MAINTENANCE },
  { id: 'difficulty', label: 'Order Difficulties', icon: '❓', type: TICKET_TYPES.DIFFICULTY_IN_ORDER }, // NEW
  { id: 'stock', label: 'Stock Items', icon: '📦', type: TICKET_TYPES.STOCK_ITEMS },
  { id: 'housekeeping', label: 'Housekeeping', icon: '🧹', type: TICKET_TYPES.HOUSEKEEPING },
  { id: 'others', label: 'Others', icon: '📝', type: TICKET_TYPES.OTHERS },
  { id: 'closed', label: 'Closed Tickets', icon: '✅' },
  { id: 'users', label: 'Telegram Users', icon: '👥' },
  { id: 'stats', label: 'Statistics', icon: '📊' }
];

// Helper functions remain the same...
const formatDateForDisplay = (dateStr) => {
  if (!dateStr) return '';
  try {
    if (dateStr.includes('-')) return dateStr;
    const date = new Date(dateStr);
    if (!isNaN(date.getTime())) {
      return date.getFullYear() + '-' + 
             String(date.getMonth() + 1).padStart(2, '0') + '-' + 
             String(date.getDate()).padStart(2, '0');
    }
    return dateStr;
  } catch (error) {
    return dateStr;
  }
};

const calculateDaysPending = (dateString) => {
  if (!dateString) return 0;
  try {
    const ticketDate = new Date(dateString);
    const today = new Date();
    const diffTime = Math.abs(today - ticketDate);
    const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));
    return diffDays;
  } catch (error) {
    return 0;
  }
};

const formatDate = (dateStr) => {
  if (!dateStr) return 'N/A';
  try {
    return new Date(dateStr).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: '2-digit',
    });
  } catch (e) {
    return dateStr;
  }
};

// FIXED: Type Reclassification Component with new structure
const TypeReclassification = ({ ticket, onReclassify }) => {
  const [newType, setNewType] = useState(ticket.type);
  const [isReclassifying, setIsReclassifying] = useState(false);

  const handleReclassify = async () => {
    if (newType === ticket.type) {
      alert('Please select a different type to reclassify');
      return;
    }

    setIsReclassifying(true);
    try {
      const response = await fetch(`${API_URL}/api/reclassify-ticket-type`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          ticketId: ticket.ticketId,
          newType: newType
        }),
      });

      const result = await response.json();

      if (result.success) {
        alert(`✅ ${result.message}${result.notificationSent ? ' 📱 Notification sent!' : ''}`);
        onReclassify();
      } else {
        throw new Error(result.error || 'Reclassification failed');
      }
    } catch (error) {
      console.error('Error reclassifying ticket:', error);
      alert('Failed to reclassify ticket. Please try again.');
    } finally {
      setIsReclassifying(false);
    }
  };

  // FIXED: Display bot's category structure
  const getDisplayType = (type) => {
    if (type === TICKET_TYPES.STOCK_ITEMS) return 'Place an Order → Stock Items';
    if (type === TICKET_TYPES.HOUSEKEEPING) return 'Place an Order → Housekeeping';  
    if (type === TICKET_TYPES.OTHERS) return 'Place an Order → Others';
    return type; // Repair and Maintenance, Difficulty in Order stay as is
  };

  return (
    <div className="type-reclassification">
      <div className="current-type">
        <small>Current: {getDisplayType(ticket.type)}</small>
      </div>
      <div className="reclassify-controls">
        <select
          value={newType}
          onChange={(e) => setNewType(e.target.value)}
          className="type-select"
        >
          {Object.values(TICKET_TYPES).map(type => (
            <option key={type} value={type}>{getDisplayType(type)}</option>
          ))}
        </select>
        <button
          onClick={handleReclassify}
          disabled={isReclassifying || newType === ticket.type}
          className="reclassify-btn"
        >
          {isReclassifying ? '...' : '🔄 Reclassify'}
        </button>
      </div>
      {ticket.autoAssigned && (
        <span className="auto-assigned-badge">🤖 Auto-Assigned</span>
      )}
      {/* FIXED: Show bot's original category/subcategory */}
      {ticket.category && (
        <div className="original-category">
          <small>Bot Category: {ticket.category}{ticket.subcategory ? ` → ${ticket.subcategory}` : ''}</small>
        </div>
      )}
    </div>
  );
};

// FIXED: Statistics Component with updated structure
const TicketStatistics = () => {
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const loadStats = async () => {
      try {
        const response = await fetch(`${API_URL}/api/ticket-type-stats`);
        const data = await response.json();
        
        if (data.success) {
          setStats(data);
        }
      } catch (error) {
        console.error('Error loading stats:', error);
      } finally {
        setLoading(false);
      }
    };

    loadStats();
  }, []);

  if (loading) {
    return <div className="loading">Loading statistics...</div>;
  }

  if (!stats) {
    return <div className="error">Failed to load statistics</div>;
  }

  return (
    <div className="ticket-statistics">
      <h2>📊 Ticket Statistics & Auto-Assignment Overview</h2>
      
      <div className="bot-structure-info">
        <h3>🤖 Bot Ticket Structure</h3>
        <div className="bot-flow">
          <h4>Telegram Bot Flow:</h4>
          <div className="flow-steps">
            <div className="flow-step">
              <strong>Step 1:</strong> Contact Verification
            </div>
            <div className="flow-step">
              <strong>Step 2:</strong> Main Category Selection
              <ul>
                <li>🔧 Repair and Maintenance → Nishat</li>
                <li>❓ Difficulty in Order → No auto-assignment</li>
                <li>📦 Place an Order → Subcategory selection</li>
              </ul>
            </div>
            <div className="flow-step">
              <strong>Step 3:</strong> Subcategory (for "Place an Order")
              <ul>
                <li>📋 Stock Items → Nishat or Ajay (random)</li>
                <li>🧹 Housekeeping → Kim</li>
                <li>📌 Others → Kim</li>
              </ul>
            </div>
            <div className="flow-step">
              <strong>Step 4:</strong> Issue Description & Image Upload
            </div>
          </div>
        </div>
      </div>
      
      <div className="auto-assignment-rules">
        <h3>🎯 Auto-Assignment Rules</h3>
        <div className="rules-grid">
          {Object.entries(AUTO_ASSIGNMENT_RULES).map(([type, assignees]) => (
            <div key={type} className="rule-card">
              <div className="rule-type">{type}</div>
              <div className="rule-assignees">
                {assignees.length === 0 ? (
                  <span className="no-assignees">→ No auto-assignment</span>
                ) : assignees.length === 1 ? (
                  <span className="single-assignee">→ {assignees[0]}</span>
                ) : (
                  <span className="multiple-assignees">
                    → Random: {assignees.join(' or ')}
                  </span>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="stats-by-type">
        <h3>📈 Statistics by Ticket Type</h3>
        <div className="stats-grid">
          {Object.entries(stats.statsByType).map(([type, typeStats]) => (
            <div key={type} className="stat-type-card">
              <h4>{type}</h4>
              <div className="stat-numbers">
                <div className="stat-item">
                  <span className="stat-label">Total:</span>
                  <span className="stat-value">{typeStats.total}</span>
                </div>
                <div className="stat-item">
                  <span className="stat-label">Open:</span>
                  <span className="stat-value open">{typeStats.open || 0}</span>
                </div>
                <div className="stat-item">
                  <span className="stat-label">In Progress:</span>
                  <span className="stat-value progress">{typeStats.inProgress || 0}</span>
                </div>
                <div className="stat-item">
                  <span className="stat-label">Resolved:</span>
                  <span className="stat-value resolved">{typeStats.resolved || 0}</span>
                </div>
                <div className="stat-item">
                  <span className="stat-label">Closed:</span>
                  <span className="stat-value closed">{typeStats.closed || 0}</span>
                </div>
                <div className="stat-item auto-assigned">
                  <span className="stat-label">🤖 Auto-Assigned:</span>
                  <span className="stat-value">{typeStats.autoAssigned || 0}</span>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="overall-stats">
        <h3>📊 Overall Statistics</h3>
        <div className="overall-numbers">
          <div className="overall-stat">
            <div className="overall-number">{stats.totalTickets}</div>
            <div className="overall-label">Total Tickets</div>
          </div>
          <div className="overall-stat">
            <div className="overall-number">
              {Object.values(stats.statsByType).reduce((sum, type) => sum + (type.autoAssigned || 0), 0)}
            </div>
            <div className="overall-label">Auto-Assigned</div>
          </div>
        </div>
      </div>

      <div className="classification-info">
        <h3>🎯 Auto-Classification Process</h3>
        <p>
          Tickets are automatically classified and assigned based on:
        </p>
        <ul>
          <li><strong>Bot Category:</strong> Main category selected during ticket creation</li>
          <li><strong>Bot Subcategory:</strong> Subcategory for "Place an Order" tickets</li>
          <li><strong>Keyword Analysis:</strong> AI analyzes issue description for classification</li>
          <li><strong>Default Fallback:</strong> Unclassified tickets go to "Others" (Kim)</li>
        </ul>
        
        <h4>📋 Data Structure Mapping:</h4>
        <div className="mapping-info">
          <p><strong>Google Sheets Structure (from bot):</strong></p>
          <ul>
            <li>Column K: Category (Main category from bot)</li>
            <li>Column L: Subcategory (Subcategory from bot)</li>
            <li>Frontend Type: Normalized for display and filtering</li>
          </ul>
        </div>
      </div>
    </div>
  );
};

// User Management Component (unchanged)
const UserManagement = () => {
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [newUser, setNewUser] = useState({
    employeeName: '',
    chatId: '',
    username: ''
  });
  const [saving, setSaving] = useState(false);

  const loadUsers = useCallback(async () => {
    try {
      const response = await fetch(`${API_URL}/api/telegram-user-mappings`);
      const data = await response.json();
      
      if (data.success) {
        setUsers(data.mappings);
      }
    } catch (error) {
      console.error('Error loading users:', error);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadUsers();
  }, [loadUsers]);

  const handleAddUser = async () => {
    if (!newUser.employeeName || !newUser.chatId) {
      alert('Employee name and Chat ID are required');
      return;
    }

    setSaving(true);
    try {
      const response = await fetch(`${API_URL}/api/register-telegram-user`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(newUser),
      });

      const result = await response.json();

      if (result.success) {
        alert(`User ${newUser.employeeName} registered successfully!`);
        setNewUser({ employeeName: '', chatId: '', username: '' });
        loadUsers();
      } else {
        alert(`Error: ${result.error}`);
      }
    } catch (error) {
      console.error('Error adding user:', error);
      alert('Failed to add user. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return <div className="loading">Loading users...</div>;
  }

  return (
    <div className="user-management">
      <h2>👥 Telegram User Management</h2>
      <div className="user-management-description">
        <p>Register employees with their Telegram Chat IDs to enable automatic ticket notifications.</p>
        <div className="chat-id-help">
          <h4>How to get Chat ID:</h4>
          <ol>
            <li>Open Telegram and search for <strong>@userinfobot</strong></li>
            <li>Start a chat with the bot</li>
            <li>Send any message (like "/start")</li>
            <li>The bot will reply with your Chat ID</li>
            <li>Copy the number and paste it below</li>
          </ol>
        </div>
      </div>
      
      <div className="add-user-form">
        <h3>Add New User</h3>
        <div className="user-form">
          <div className="form-group">
            <label>Employee Name</label>
            <select
              value={newUser.employeeName}
              onChange={(e) => setNewUser(prev => ({ ...prev, employeeName: e.target.value }))}
            >
              <option value="">Select Employee</option>
              {ASSIGNEE_OPTIONS.map(name => (
                <option key={name} value={name}>{name}</option>
              ))}
            </select>
          </div>
          
          <div className="form-group">
            <label>Telegram Chat ID</label>
            <input
              type="text"
              value={newUser.chatId}
              onChange={(e) => setNewUser(prev => ({ ...prev, chatId: e.target.value }))}
              placeholder="e.g., 123456789"
            />
            <small>Get your Chat ID by messaging @userinfobot on Telegram</small>
          </div>
          
          <div className="form-group">
            <label>Telegram Username (Optional)</label>
            <input
              type="text"
              value={newUser.username}
              onChange={(e) => setNewUser(prev => ({ ...prev, username: e.target.value }))}
              placeholder="e.g., @username"
            />
          </div>
          
          <button onClick={handleAddUser} disabled={saving} className="save-btn">
            {saving ? 'Saving...' : 'Add User'}
          </button>
        </div>
      </div>

      <div className="users-list">
        <h3>Registered Users ({users.length})</h3>
        {users.length === 0 ? (
          <div className="no-users">
            <p>No users registered yet. Add users above to enable Telegram notifications.</p>
            <div className="setup-steps">
              <h4>🤖 Enhanced Bot Workflow:</h4>
              <ol>
                <li>User creates ticket via Telegram bot with guided flow</li>
                <li>Bot auto-categorizes and assigns based on selection</li>
                <li>Assigned employee gets instant notification</li>
                <li>Resolution workflow handled via Telegram + Dashboard</li>
              </ol>
            </div>
          </div>
        ) : (
          <table className="users-table">
            <thead>
              <tr>
                <th>Employee Name</th>
                <th>Chat ID</th>
                <th>Username</th>
                <th>Status</th>
                <th>Auto-Assignment Types</th>
              </tr>
            </thead>
            <tbody>
              {users.map((user, index) => {
                // Find which types this user is assigned to
                const assignedTypes = Object.entries(AUTO_ASSIGNMENT_RULES)
                  .filter(([type, assignees]) => assignees.includes(user.employeeName))
                  .map(([type, assignees]) => type);

                return (
                  <tr key={index}>
                    <td>{user.employeeName}</td>
                    <td><code>{user.chatId}</code></td>
                    <td>{user.username || 'Not provided'}</td>
                    <td>
                      <span className={`status-badge ${user.chatId ? 'active' : 'inactive'}`}>
                        {user.chatId ? 'Active' : 'Inactive'}
                      </span>
                    </td>
                    <td>
                      <div className="assigned-types">
                        {assignedTypes.length > 0 ? 
                          assignedTypes.map(type => (
                            <span key={type} className="type-badge">{type}</span>
                          )) :
                          <span className="no-types">No auto-assignments</span>
                        }
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      <div className="workflow-info">
        <h3>🔄 Enhanced Telegram Bot Workflow</h3>
        <div className="workflow-steps">
          <div className="workflow-step">
            <div className="step-number">1</div>
            <div className="step-content">
              <h4>📱 Guided Ticket Creation</h4>
              <p>Bot guides users through category selection with smart auto-assignment</p>
            </div>
          </div>
          <div className="workflow-step">
            <div className="step-number">2</div>
            <div className="step-content">
              <h4>🤖 Intelligent Assignment</h4>
              <p>Based on bot's category/subcategory structure for accurate routing</p>
            </div>
          </div>
          <div className="workflow-step">
            <div className="step-number">3</div>
            <div className="step-content">
              <h4>📬 Instant Notifications</h4>
              <p>Real-time Telegram notifications with approval workflow</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

// FIXED: Main Ticket Dashboard Component
const TicketDashboard = () => {
  const [tickets, setTickets] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [assignmentLoading, setAssignmentLoading] = useState({});
  const [statusLoading, setStatusLoading] = useState({});
  const [assignmentInputs, setAssignmentInputs] = useState({});
  const [statusInputs, setStatusInputs] = useState({});
  const [actionInputs, setActionInputs] = useState({});
  const [sortField, setSortField] = useState('date');
  const [sortDirection, setSortDirection] = useState('desc');
  const [activeTab, setActiveTab] = useState('repair');
  const [filters, setFilters] = useState({
    date: '',
    outlet: '',
    status: '',
    assignee: '',
    search: ''
  });
  const [selectedImage, setSelectedImage] = useState(null);
  const [imageError, setImageError] = useState(false);

  const [filterOptions, setFilterOptions] = useState({
    outlets: [],
    assignees: [],
    statuses: STATUS_OPTIONS,
  });

  const updateFilterOptions = useCallback((ticketsData) => {
    const outlets = [...new Set(ticketsData.map(t => t.outlet).filter(Boolean))];
    const assignees = [...new Set(ticketsData.map(t => t.assignedTo).filter(Boolean))];
    
    setFilterOptions(prev => ({
      ...prev,
      outlets: outlets.sort(),
      assignees: assignees.sort(),
      statuses: STATUS_OPTIONS,
    }));
  }, []);

  const loadTicketData = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const response = await fetch(`${API_URL}/api/ticket-data`, {
        headers: {
          'Accept': 'application/json',
          'Content-Type': 'application/json'
        }
      });
      
      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`HTTP ${response.status}: ${errorText}`);
      }
      
      const data = await response.json();

      if (data.success) {
        const ticketsArray = Array.isArray(data.tickets) ? data.tickets : [];
        setTickets(ticketsArray);
        updateFilterOptions(ticketsArray);
        
        // Initialize inputs for tickets
        const assignInputs = {};
        const statusInputsInit = {};
        const actionInputsInit = {};
        ticketsArray.forEach(ticket => {
          if (ticket.status === 'Open') {
            assignInputs[ticket.ticketId] = '';
          }
          statusInputsInit[ticket.ticketId] = ticket.status;
          actionInputsInit[ticket.ticketId] = ticket.actionTaken || '';
        });
        setAssignmentInputs(assignInputs);
        setStatusInputs(statusInputsInit);
        setActionInputs(actionInputsInit);
      } else {
        throw new Error(data.error || 'API returned error');
      }
    } catch (err) {
      setError(`Failed to load tickets: ${err.message}`);
      setTickets([]);
    } finally {
      setLoading(false);
    }
  }, [updateFilterOptions]);

  useEffect(() => {
    loadTicketData();
    const interval = setInterval(loadTicketData, 5 * 60 * 1000);
    return () => clearInterval(interval);
  }, [loadTicketData]);

  // Manual assignment (now less needed due to bot's auto-assignment)
  const assignTicket = async (ticketId, assigneeName) => {
    if (!assigneeName.trim()) {
      alert('Please select an assignee');
      return;
    }

    setAssignmentLoading(prev => ({ ...prev, [ticketId]: true }));

    try {
      const response = await fetch(`${API_URL}/api/assign-ticket-with-notification`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          ticketId,
          assignedTo: assigneeName.trim(),
        }),
      });

      const result = await response.json();

      if (result.success) {
        setTickets(prevTickets => 
          prevTickets.map(ticket => 
            ticket.ticketId === ticketId 
              ? { ...ticket, assignedTo: assigneeName.trim(), status: 'In Progress', autoAssigned: false }
              : ticket
          )
        );
        
        setAssignmentInputs(prev => ({ ...prev, [ticketId]: '' }));
        setStatusInputs(prev => ({ ...prev, [ticketId]: 'In Progress' }));
        
        const notificationStatus = result.notificationSent ? 
          ' 📱 Telegram notification sent!' : 
          ' ⚠️ No Telegram Chat ID found for this user';
        
        alert(`Ticket ${ticketId} manually assigned to ${assigneeName.trim()}.${notificationStatus}`);
      } else {
        throw new Error(result.error || 'Assignment failed');
      }
    } catch (error) {
      console.error('Error assigning ticket:', error);
      alert('Failed to assign ticket. Please try again.');
    } finally {
      setAssignmentLoading(prev => ({ ...prev, [ticketId]: false }));
    }
  };

  // Enhanced status update with Telegram notification
  const updateTicketStatus = async (ticketId, newStatus, actionTaken = '') => {
    setStatusLoading(prev => ({ ...prev, [ticketId]: true }));

    try {
      const response = await fetch(`${API_URL}/api/update-ticket-status-with-notification`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          ticketId,
          status: newStatus,
          actionTaken: actionTaken.trim(),
        }),
      });

      const result = await response.json();

      if (result.success) {
        setTickets(prevTickets => 
          prevTickets.map(ticket => 
            ticket.ticketId === ticketId 
              ? { ...ticket, status: newStatus, actionTaken: actionTaken.trim() }
              : ticket
          )
        );
        
        if (newStatus === 'Closed') {
          setActiveTab('closed');
          alert(`Ticket ${ticketId} has been closed and moved to the Closed Tickets tab`);
        } else {
          const notificationStatus = newStatus === 'Resolved' && result.notificationSent ? 
            ' 📱 Approval request sent to ticket creator!' : 
            newStatus === 'Resolved' ? ' ⚠️ No Telegram Chat ID found for ticket creator' : '';
          
          alert(`Ticket ${ticketId} status updated to ${newStatus}.${notificationStatus}`);
        }
        
        setStatusInputs(prev => ({ ...prev, [ticketId]: newStatus }));
        setActionInputs(prev => ({ ...prev, [ticketId]: actionTaken.trim() }));
      } else {
        throw new Error(result.error || 'Status update failed');
      }
    } catch (error) {
      console.error('Error updating ticket status:', error);
      alert('Failed to update ticket status. Please try again.');
    } finally {
      setStatusLoading(prev => ({ ...prev, [ticketId]: false }));
    }
  };

  const handleSort = (field) => {
    if (sortField === field) {
      setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortDirection('asc');
    }
  };

  const getTicketsByTab = () => {
    const currentTab = TABS.find(tab => tab.id === activeTab);
    
    if (activeTab === 'closed') {
      return tickets.filter(ticket => ticket.status === 'Closed');
    } else if (activeTab === 'users' || activeTab === 'stats') {
      return []; // No tickets for these tabs
    } else if (currentTab && currentTab.type) {
      return tickets.filter(ticket => 
        ticket.type === currentTab.type && ticket.status !== 'Closed'
      );
    }
    
    return tickets.filter(ticket => ticket.status !== 'Closed');
  };

  const getFilteredAndSortedTickets = () => {
    let filtered = getTicketsByTab().filter(ticket => {
      return (
        (!filters.date || ticket.date === filters.date) &&
        (!filters.outlet || ticket.outlet === filters.outlet) &&
        (!filters.status || ticket.status === filters.status) &&
        (!filters.assignee || ticket.assignedTo === filters.assignee) &&
        (!filters.search || 
          ticket.ticketId.toLowerCase().includes(filters.search.toLowerCase()) ||
          ticket.issueDescription.toLowerCase().includes(filters.search.toLowerCase()) ||
          ticket.submittedBy.toLowerCase().includes(filters.search.toLowerCase())
        )
      );
    });

    filtered.sort((a, b) => {
      let aVal = a[sortField];
      let bVal = b[sortField];
      
      if (sortField === 'daysPending') {
        aVal = parseInt(aVal) || 0;
        bVal = parseInt(bVal) || 0;
      } else if (sortField === 'date') {
        aVal = new Date(aVal);
        bVal = new Date(bVal);
      } else if (sortField === 'status') {
        const statusOrder = { 'Open': 0, 'In Progress': 1, 'Resolved': 2, 'Closed': 3 };
        aVal = statusOrder[aVal] || 4;
        bVal = statusOrder[bVal] || 4;
      }
      
      if (sortDirection === 'asc') {
        return aVal > bVal ? 1 : -1;
      } else {
        return aVal < bVal ? 1 : -1;
      }
    });

    return filtered;
  };

  const getStatusIcon = (status) => {
    switch (status) {
      case 'Open': return '🔴';
      case 'In Progress': return '🟡';
      case 'Resolved': return '🟢';
      case 'Closed': return '✅';
      default: return '❓';
    }
  };

  const getStatusColor = (status) => {
    switch (status) {
      case 'Open': return '#ef4444';
      case 'In Progress': return '#f59e0b';
      case 'Resolved': return '#10b981';
      case 'Closed': return '#6b7280';
      default: return '#6b7280';
    }
  };

  const clearAllFilters = () => {
    setFilters({ date: '', outlet: '', status: '', assignee: '', search: '' });
  };

  const handleImageError = () => {
    setImageError(true);
  };

  const filteredTickets = getFilteredAndSortedTickets();
  const tabTickets = getTicketsByTab();
  
  // FIXED: Calculate updated stats for different ticket types including new one
  const stats = {
    repair: tickets.filter(t => t.type === TICKET_TYPES.REPAIR_MAINTENANCE && t.status !== 'Closed').length,
    difficulty: tickets.filter(t => t.type === TICKET_TYPES.DIFFICULTY_IN_ORDER && t.status !== 'Closed').length, // NEW
    stock: tickets.filter(t => t.type === TICKET_TYPES.STOCK_ITEMS && t.status !== 'Closed').length,
    housekeeping: tickets.filter(t => t.type === TICKET_TYPES.HOUSEKEEPING && t.status !== 'Closed').length,
    others: tickets.filter(t => t.type === TICKET_TYPES.OTHERS && t.status !== 'Closed').length,
    closed: tickets.filter(t => t.status === 'Closed').length,
    autoAssigned: tickets.filter(t => t.autoAssigned).length,
    total: tickets.filter(t => t.status !== 'Closed').length,
    open: tickets.filter(t => t.status === 'Open').length,
    inProgress: tickets.filter(t => t.status === 'In Progress').length,
    resolved: tickets.filter(t => t.status === 'Resolved').length,
    avgDaysPending: tickets.length > 0 ? 
      Math.round(tickets.reduce((sum, t) => sum + t.daysPending, 0) / tickets.length) : 0,
  };

  if (loading) {
    return (
      <div className="ticket-loading">
        <div className="loading-spinner"></div>
        <p>Loading ticket data from bot structure...</p>
      </div>
    );
  }

  return (
    <div className="ticket-dashboard">
      <div className="ticket-header">
        <h1>🤖 Bot-Integrated Ticket Management System</h1>
        <div className="header-actions">
          <button onClick={loadTicketData} className="refresh-btn">
            🔄 Refresh
          </button>
          <div className="telegram-status">
            <span className="telegram-indicator">📱 Bot Auto-Assignment Active</span>
          </div>
        </div>
      </div>

      {error && (
        <div className="ticket-error">
          <h3>❌ Error: {error}</h3>
          <p>Please check your server connection or contact support if the issue persists.</p>
          <button onClick={loadTicketData} className="retry-btn">
            🔄 Retry
          </button>
        </div>
      )}

      <div className="ticket-stats">
        <div className="stat-card">
          <div className="stat-number">{stats.total}</div>
          <div className="stat-label">Total Active</div>
        </div>
        <div className="stat-card">
          <div className="stat-number">{stats.autoAssigned}</div>
          <div className="stat-label">🤖 Bot Auto-Assigned</div>
        </div>
        <div className="stat-card">
          <div className="stat-number">{stats.open}</div>
          <div className="stat-label">Open</div>
        </div>
        <div className="stat-card">
          <div className="stat-number">{stats.inProgress}</div>
          <div className="stat-label">In Progress</div>
        </div>
        <div className="stat-card">
          <div className="stat-number">{stats.resolved}</div>
          <div className="stat-label">Resolved</div>
        </div>
      </div>

      {/* FIXED: Updated Tab Navigation with new tab */}
      <div className="tab-navigation">
        {TABS.map(tab => (
          <button
            key={tab.id}
            className={`tab-button ${activeTab === tab.id ? 'active' : ''}`}
            onClick={() => setActiveTab(tab.id)}
          >
            <span className="tab-icon">{tab.icon}</span>
            <span className="tab-label">{tab.label}</span>
            {!['users', 'stats'].includes(tab.id) && (
              <span className="tab-count">
                ({tab.id === 'repair' ? stats.repair : 
                  tab.id === 'difficulty' ? stats.difficulty : // NEW
                  tab.id === 'stock' ? stats.stock :
                  tab.id === 'housekeeping' ? stats.housekeeping :
                  tab.id === 'others' ? stats.others :
                  stats.closed})
              </span>
            )}
          </button>
        ))}
      </div>

      {/* Special tabs */}
      {activeTab === 'users' && <UserManagement />}
      {activeTab === 'stats' && <TicketStatistics />}

      {/* Ticket Management Tabs */}
      {!['users', 'stats'].includes(activeTab) && (
        <>
          {tickets.length > 0 && (
            <div className="ticket-filters">
              <div className="filter-group">
                <label>Search</label>
                <input
                  type="text"
                  placeholder="Search tickets..."
                  value={filters.search}
                  onChange={(e) => setFilters(prev => ({ ...prev, search: e.target.value }))}
                />
              </div>
              <div className="filter-group">
                <label>Date</label>
                <input
                  type="date"
                  value={filters.date}
                  onChange={(e) => setFilters(prev => ({ ...prev, date: e.target.value }))}
                />
              </div>
              <div className="filter-group">
                <label>Outlet</label>
                <select
                  value={filters.outlet}
                  onChange={(e) => setFilters(prev => ({ ...prev, outlet: e.target.value }))}
                >
                  <option value="">All Outlets</option>
                  {filterOptions.outlets.map(outlet => (
                    <option key={outlet} value={outlet}>{outlet}</option>
                  ))}
                </select>
              </div>
              {activeTab !== 'closed' && (
                <div className="filter-group">
                  <label>Status</label>
                  <select
                    value={filters.status}
                    onChange={(e) => setFilters(prev => ({ ...prev, status: e.target.value }))}
                  >
                    <option value="">All Statuses</option>
                    {filterOptions.statuses.map(status => (
                      <option key={status} value={status}>{status}</option>
                    ))}
                  </select>
                </div>
              )}
              <div className="filter-group">
                <label>Assignee</label>
                <select
                  value={filters.assignee}
                  onChange={(e) => setFilters(prev => ({ ...prev, assignee: e.target.value }))}
                >
                  <option value="">All Assignees</option>
                  {filterOptions.assignees.map(assignee => (
                    <option key={assignee} value={assignee}>{assignee}</option>
                  ))}
                </select>
              </div>
            </div>
          )}

          {Object.values(filters).some(filter => filter !== '') && (
            <div style={{ textAlign: 'center', marginBottom: '2rem' }}>
              <button onClick={clearAllFilters} className="clear-filters-btn">
                🧹 Clear All Filters
              </button>
            </div>
          )}

          <div className="tickets-table-container">
            {!error && tabTickets.length === 0 ? (
              <div className="no-data">
                <div className="no-data-icon">🎫</div>
                <h3>No {TABS.find(tab => tab.id === activeTab)?.label.toLowerCase()} tickets found</h3>
                <p>No tickets available for this category.</p>
                <button onClick={loadTicketData} className="refresh-btn">
                  🔄 Refresh Data
                </button>
              </div>
            ) : filteredTickets.length === 0 && tabTickets.length > 0 ? (
              <div className="no-data">
                <div className="no-data-icon">🔍</div>
                <h3>No tickets match your filters</h3>
                <p>Try adjusting or clearing your filters above.</p>
                <button onClick={clearAllFilters} className="clear-filters-btn">
                  🧹 Clear Filters
                </button>
              </div>
            ) : (
              <table className="tickets-table">
                <thead>
                  <tr>
                    <th onClick={() => handleSort('ticketId')} className="sortable">
                      Ticket ID {sortField === 'ticketId' && (sortDirection === 'asc' ? '↑' : '↓')}
                    </th>
                    <th onClick={() => handleSort('date')} className="sortable">
                      Date {sortField === 'date' && (sortDirection === 'asc' ? '↑' : '↓')}
                    </th>
                    <th onClick={() => handleSort('outlet')} className="sortable">
                      Outlet {sortField === 'outlet' && (sortDirection === 'asc' ? '↑' : '↓')}
                    </th>
                    <th onClick={() => handleSort('submittedBy')} className="sortable">
                      Submitted By {sortField === 'submittedBy' && (sortDirection === 'asc' ? '↑' : '↓')}
                    </th>
                    <th>Issue Description</th>
                    <th onClick={() => handleSort('status')} className="sortable">
                      Status {sortField === 'status' && (sortDirection === 'asc' ? '↑' : '↓')}
                    </th>
                    <th onClick={() => handleSort('daysPending')} className="sortable">
                      Days Pending {sortField === 'daysPending' && (sortDirection === 'asc' ? '↑' : '↓')}
                    </th>
                    <th>Type & Assignment</th>
                    {activeTab !== 'closed' && <th>Manual Assignment</th>}
                    <th>Action Taken</th>
                    {activeTab !== 'closed' && <th>Status Management</th>}
                  </tr>
                </thead>
                <tbody>
                  {filteredTickets.map(ticket => (
                    <tr 
                      key={ticket.ticketId} 
                      className={`ticket-row status-${ticket.status.toLowerCase().replace(' ', '-')} ${ticket.autoAssigned ? 'auto-assigned' : ''}`}
                    >
                      <td className="ticket-id">#{ticket.ticketId}</td>
                      <td className="ticket-date">{formatDate(ticket.date)}</td>
                      <td className="ticket-outlet">{ticket.outlet}</td>
                      <td className="ticket-submitter">{ticket.submittedBy}</td>
                      <td className="ticket-description">
                        <div className="description-text">{ticket.issueDescription}</div>
                        {ticket.imageLink && (
                          <button 
                            className="image-btn" 
                            onClick={() => {
                              let imageUrl = ticket.imageLink;
                              const driveMatch = ticket.imageLink.match(/\/file\/d\/([a-zA-Z0-9-_]+)/);
                              if (driveMatch) {
                                imageUrl = `${API_URL}/api/image-proxy/${driveMatch[1]}`;
                              }
                              setSelectedImage(imageUrl);
                              setImageError(false);
                            }}
                            title="View attached image"
                          >
                            📎 View Image
                          </button>
                        )}
                      </td>
                      <td className="ticket-status">
                        <span 
                          className="status-badge"
                          style={{ backgroundColor: getStatusColor(ticket.status) }}
                        >
                          {getStatusIcon(ticket.status)} {ticket.status}
                        </span>
                      </td>
                      <td className="ticket-pending">
                        <span className={ticket.daysPending > 7 ? 'high-priority' : ticket.daysPending > 3 ? 'medium-priority' : 'low-priority'}>
                          {ticket.daysPending} day{ticket.daysPending !== 1 ? 's' : ''}
                        </span>
                      </td>
                      <td className="ticket-type-assignment">
                        <div className="type-info">
                          <div className="ticket-type">
                            <strong>{ticket.displayType || ticket.type}</strong>
                          </div>
                          <div className="assignee-info">
                            👤 {ticket.assignedTo || 'Unassigned'}
                          </div>
                          {ticket.autoAssigned && (
                            <span className="auto-badge">🤖 Bot Auto</span>
                          )}
                        </div>
                        <TypeReclassification 
                          ticket={ticket} 
                          onReclassify={loadTicketData}
                        />
                      </td>
                      {activeTab !== 'closed' && (
                        <td className="ticket-manual-assignment">
                          {ticket.status === 'Open' || !ticket.assignedTo ? (
                            <div className="assignment-inline">
                              <select
                                value={assignmentInputs[ticket.ticketId] || ''}
                                onChange={(e) => setAssignmentInputs(prev => ({
                                  ...prev,
                                  [ticket.ticketId]: e.target.value
                                }))}
                                disabled={assignmentLoading[ticket.ticketId]}
                                className="assign-select-inline"
                              >
                                <option value="">Manual assign...</option>
                                {ASSIGNEE_OPTIONS.map(name => (
                                  <option key={name} value={name}>{name}</option>
                                ))}
                              </select>
                              <button
                                onClick={() => assignTicket(ticket.ticketId, assignmentInputs[ticket.ticketId])}
                                disabled={!assignmentInputs[ticket.ticketId]?.trim() || assignmentLoading[ticket.ticketId]}
                                className="assign-btn-inline telegram-btn"
                                title="Override bot auto-assignment"
                              >
                                {assignmentLoading[ticket.ticketId] ? '...' : '🔄 Override'}
                              </button>
                            </div>
                          ) : (
                            <div className="already-assigned">
                              ✅ Assigned
                            </div>
                          )}
                        </td>
                      )}
                      <td className="ticket-action-taken">
                        <textarea
                          value={actionInputs[ticket.ticketId] || ''}
                          onChange={(e) => setActionInputs(prev => ({
                            ...prev,
                            [ticket.ticketId]: e.target.value
                          }))}
                          placeholder="Describe action taken..."
                          className="action-taken-textarea"
                          readOnly={activeTab === 'closed'}
                        />
                      </td>
                      {activeTab !== 'closed' && (
                        <td className="ticket-status-management">
                          <div className="status-management-inline">
                            <select
                              value={statusInputs[ticket.ticketId] || ticket.status}
                              onChange={(e) => setStatusInputs(prev => ({
                                ...prev,
                                [ticket.ticketId]: e.target.value
                              }))}
                              className="status-select"
                            >
                              {STATUS_OPTIONS.map(status => (
                                <option key={status} value={status}>{status}</option>
                              ))}
                              <option value="Closed">Close Ticket</option>
                            </select>
                            <button
                              onClick={() => updateTicketStatus(
                                ticket.ticketId, 
                                statusInputs[ticket.ticketId], 
                                actionInputs[ticket.ticketId]
                              )}
                              disabled={statusLoading[ticket.ticketId]}
                              className={`status-update-btn ${statusInputs[ticket.ticketId] === 'Resolved' ? 'telegram-btn' : ''}`}
                              title={statusInputs[ticket.ticketId] === 'Resolved' ? 
                                'Updates status and sends approval request to ticket creator' : 
                                'Updates ticket status'}
                            >
                              {statusLoading[ticket.ticketId] ? '...' : 
                               statusInputs[ticket.ticketId] === 'Resolved' ? '📱 Update' : 'Update'}
                            </button>
                          </div>
                        </td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </>
      )}

      {selectedImage && (
        <div className="image-modal" onClick={() => setSelectedImage(null)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <button 
              className="close-btn" 
              onClick={() => setSelectedImage(null)}
            >
              ×
            </button>
            {imageError ? (
              <div className="image-error-container">
                <div className="image-error-icon">🖼️</div>
                <h3>Image Not Available</h3>
                <p>The image could not be loaded. It may have been moved or deleted.</p>
                <p><strong>URL:</strong> {selectedImage}</p>
                <button 
                  className="retry-image-btn" 
                  onClick={() => setImageError(false)}
                >
                  Try Again
                </button>
              </div>
            ) : (
              <img 
                src={selectedImage} 
                alt="Ticket Attachment"
                onError={handleImageError}
              />
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default TicketDashboard;