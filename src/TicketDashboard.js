import React, { useState, useEffect, useCallback } from 'react';
import './TicketDashboard.css';

const API_URL = process.env.REACT_APP_API_BASE_URL || 'http://localhost:5000';

// Predefined assignee names
const ASSIGNEE_OPTIONS = ['Jatin', 'Nishat', 'Kim', 'Ajay', 'Ayaaz', 'Sharon'];

// Status options
const STATUS_OPTIONS = ['Open', 'In Progress', 'Resolved'];

// Tab configuration
const TABS = [
  { id: 'orders', label: 'Orders', icon: '📦' },
  { id: 'complaints', label: 'Complaints', icon: '🔴' },
  { id: 'closed', label: 'Closed Tickets', icon: '✅' },
  { id: 'users', label: 'Telegram Users', icon: '👥' }
];

// Helper functions
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

// Transform function for ticket data
const transformTicketData = (rawTickets) => {
  if (!rawTickets || rawTickets.length <= 1) return [];
  
  const headers = rawTickets[0];
  const dataRows = rawTickets.slice(1);
  
  return dataRows.map((row, index) => {
    const safeRow = Array.isArray(row) ? row : [];
    
    return {
      ticketId: safeRow[0] || `TKT-${index + 1}`,
      date: formatDateForDisplay(safeRow[1] || ''),
      outlet: safeRow[2] || 'Unknown Outlet',
      submittedBy: safeRow[3] || 'Unknown User',
      issueDescription: safeRow[4] || '',
      imageLink: safeRow[5] || '',
      imageHash: safeRow[6] || '',
      status: safeRow[7] || 'Open',
      assignedTo: safeRow[8] || '',
      actionTaken: safeRow[9] || '',
      type: safeRow[10] || 'Unknown',
      daysPending: calculateDaysPending(safeRow[1] || '')
    };
  }).filter(ticket => {
    const hasAnyData = ticket.outlet !== 'Unknown Outlet' || 
                       ticket.submittedBy !== 'Unknown User' || 
                       ticket.date || 
                       ticket.ticketId.startsWith('TKT-') === false;
    return hasAnyData;
  });
};

// User Management Component
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
      <h2>Telegram User Management</h2>
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
              <h4>Setup Process:</h4>
              <ol>
                <li>Employee gets their Chat ID from @userinfobot</li>
                <li>Admin adds employee and Chat ID using the form above</li>
                <li>Employee will now receive notifications when tickets are assigned</li>
                <li>Employee can approve/reject resolutions directly from Telegram</li>
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
                <th>Notifications</th>
              </tr>
            </thead>
            <tbody>
              {users.map((user, index) => (
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
                    <span className="notification-status">
                      {user.chatId ? '🔔 Enabled' : '🔕 Disabled'}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <div className="workflow-info">
        <h3>Telegram Workflow</h3>
        <div className="workflow-steps">
          <div className="workflow-step">
            <div className="step-number">1</div>
            <div className="step-content">
              <h4>Assignment</h4>
              <p>When you assign a ticket → Employee gets instant Telegram notification with ticket details</p>
            </div>
          </div>
          <div className="workflow-step">
            <div className="step-number">2</div>
            <div className="step-content">
              <h4>Resolution</h4>
              <p>When employee marks as "Resolved" → Ticket creator gets notification asking for approval</p>
            </div>
          </div>
          <div className="workflow-step">
            <div className="step-number">3</div>
            <div className="step-content">
              <h4>Approval</h4>
              <p>Creator can approve/reject directly from Telegram → Ticket automatically closes or reopens</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

// Main Ticket Dashboard Component
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
  const [activeTab, setActiveTab] = useState('orders');
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

  // Enhanced assignment with Telegram notification
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
              ? { ...ticket, assignedTo: assigneeName.trim(), status: 'In Progress' }
              : ticket
          )
        );
        
        setAssignmentInputs(prev => ({ ...prev, [ticketId]: '' }));
        setStatusInputs(prev => ({ ...prev, [ticketId]: 'In Progress' }));
        
        const notificationStatus = result.notificationSent ? 
          ' 📱 Telegram notification sent!' : 
          ' ⚠️ No Telegram Chat ID found for this user';
        
        alert(`Ticket ${ticketId} assigned to ${assigneeName.trim()}.${notificationStatus}`);
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
    switch (activeTab) {
      case 'orders':
        return tickets.filter(ticket => ticket.type === 'Order' && ticket.status !== 'Closed');
      case 'complaints':
        return tickets.filter(ticket => ticket.type === 'Complaint' && ticket.status !== 'Closed');
      case 'closed':
        return tickets.filter(ticket => ticket.status === 'Closed');
      case 'users':
        return []; // No tickets for user management tab
      default:
        return tickets;
    }
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
  
  // Calculate stats for all tickets
  const stats = {
    total: tickets.filter(t => t.status !== 'Closed').length,
    open: tickets.filter(t => t.status === 'Open').length,
    inProgress: tickets.filter(t => t.status === 'In Progress').length,
    resolved: tickets.filter(t => t.status === 'Resolved').length,
    closed: tickets.filter(t => t.status === 'Closed').length,
    orders: tickets.filter(t => t.type === 'Order' && t.status !== 'Closed').length,
    complaints: tickets.filter(t => t.type === 'Complaint' && t.status !== 'Closed').length,
    avgDaysPending: tickets.length > 0 ? 
      Math.round(tickets.reduce((sum, t) => sum + t.daysPending, 0) / tickets.length) : 0,
  };

  if (loading) {
    return (
      <div className="ticket-loading">
        <div className="loading-spinner"></div>
        <p>Loading ticket data...</p>
      </div>
    );
  }

  return (
    <div className="ticket-dashboard">
      <div className="ticket-header">
        <h1>Ticket Management System with Telegram Integration</h1>
        <div className="header-actions">
          <button onClick={loadTicketData} className="refresh-btn">
            🔄 Refresh
          </button>
          <div className="telegram-status">
            <span className="telegram-indicator">📱 Telegram Bot Active</span>
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
        <div className="stat-card">
          <div className="stat-number">{stats.closed}</div>
          <div className="stat-label">Closed</div>
        </div>
      </div>

      {/* Tab Navigation */}
      <div className="tab-navigation">
        {TABS.map(tab => (
          <button
            key={tab.id}
            className={`tab-button ${activeTab === tab.id ? 'active' : ''}`}
            onClick={() => setActiveTab(tab.id)}
          >
            <span className="tab-icon">{tab.icon}</span>
            <span className="tab-label">{tab.label}</span>
            {tab.id !== 'users' && (
              <span className="tab-count">
                ({tab.id === 'orders' ? stats.orders : 
                  tab.id === 'complaints' ? stats.complaints : 
                  stats.closed})
              </span>
            )}
          </button>
        ))}
      </div>

      {/* User Management Tab */}
      {activeTab === 'users' && <UserManagement />}

      {/* Ticket Management Tabs */}
      {activeTab !== 'users' && (
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
                <h3>No {activeTab === 'orders' ? 'order' : activeTab === 'complaints' ? 'complaint' : 'closed'} tickets found</h3>
                <p>No {activeTab === 'orders' ? 'order' : activeTab === 'complaints' ? 'complaint' : 'closed'} ticket data is available.</p>
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
                    {activeTab !== 'closed' && <th>Assigned To / Action</th>}
                    <th>Action Taken</th>
                    {activeTab !== 'closed' && <th>Status Management</th>}
                  </tr>
                </thead>
                <tbody>
                  {filteredTickets.map(ticket => (
                    <tr 
                      key={ticket.ticketId} 
                      className={`ticket-row status-${ticket.status.toLowerCase().replace(' ', '-')}`}
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
                      {activeTab !== 'closed' && (
                        <td className="ticket-assignment">
                          {ticket.status === 'Open' ? (
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
                                <option value="">Select assignee...</option>
                                {ASSIGNEE_OPTIONS.map(name => (
                                  <option key={name} value={name}>{name}</option>
                                ))}
                              </select>
                              <button
                                onClick={() => assignTicket(ticket.ticketId, assignmentInputs[ticket.ticketId])}
                                disabled={!assignmentInputs[ticket.ticketId]?.trim() || assignmentLoading[ticket.ticketId]}
                                className="assign-btn-inline telegram-btn"
                                title="Assigns ticket and sends Telegram notification"
                              >
                                {assignmentLoading[ticket.ticketId] ? '...' : '📱 Assign'}
                              </button>
                            </div>
                          ) : (
                            <div className="assigned-user">{ticket.assignedTo || 'Unassigned'}</div>
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