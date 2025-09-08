import React, { useState, useEffect, useCallback } from 'react';

const API_URL = process.env.REACT_APP_API_BASE_URL || 'http://localhost:5000';

// Predefined assignee names
const ASSIGNEE_OPTIONS = ['Jatin', 'Nishat', 'Kim', 'Ajay', 'Ayaaz', 'Sharon'];

// Status options
const STATUS_OPTIONS = ['Open', 'In Progress', 'Resolved', 'Closed'];

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
      actionTaken: safeRow[9] || '', // New field for action taken
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

  const assignTicket = async (ticketId, assigneeName) => {
    if (!assigneeName.trim()) {
      alert('Please select an assignee');
      return;
    }

    setAssignmentLoading(prev => ({ ...prev, [ticketId]: true }));

    try {
      const response = await fetch(`${API_URL}/api/assign-ticket`, {
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
        alert(`Ticket ${ticketId} has been assigned to ${assigneeName.trim()}`);
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

  const updateTicketStatus = async (ticketId, newStatus, actionTaken = '') => {
    setStatusLoading(prev => ({ ...prev, [ticketId]: true }));

    try {
      const response = await fetch(`${API_URL}/api/update-ticket-status`, {
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
        
        setStatusInputs(prev => ({ ...prev, [ticketId]: newStatus }));
        setActionInputs(prev => ({ ...prev, [ticketId]: actionTaken.trim() }));
        alert(`Ticket ${ticketId} status updated to ${newStatus}`);
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

  const getFilteredAndSortedTickets = () => {
    let filtered = tickets.filter(ticket => {
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
      case 'Closed': return '⚪';
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
  const stats = {
    total: tickets.length,
    open: tickets.filter(t => t.status === 'Open').length,
    inProgress: tickets.filter(t => t.status === 'In Progress').length,
    resolved: tickets.filter(t => t.status === 'Resolved').length,
    closed: tickets.filter(t => t.status === 'Closed').length,
    avgDaysPending: tickets.length > 0 ? 
      Math.round(tickets.reduce((sum, t) => sum + t.daysPending, 0) / tickets.length) : 0,
  };

  if (loading) {
    return (
      <div style={{ 
        display: 'flex', 
        flexDirection: 'column', 
        alignItems: 'center', 
        justifyContent: 'center', 
        height: '400px',
        gap: '1rem'
      }}>
        <div style={{
          width: '40px',
          height: '40px',
          border: '4px solid #f3f4f6',
          borderTop: '4px solid #3b82f6',
          borderRadius: '50%',
          animation: 'spin 1s linear infinite'
        }}></div>
        <p>Loading ticket data...</p>
      </div>
    );
  }

  return (
    <div style={{ 
      padding: '2rem', 
      maxWidth: '1400px', 
      margin: '0 auto',
      backgroundColor: '#ffffff',
      minHeight: '100vh'
    }}>
      <style>
        {`
          @keyframes spin {
            0% { transform: rotate(0deg); }
            100% { transform: rotate(360deg); }
          }
          
          .ticket-table {
            width: 100%;
            border-collapse: collapse;
            margin-top: 1rem;
            background: white;
            border-radius: 8px;
            overflow: hidden;
            box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
          }
          
          .ticket-table th,
          .ticket-table td {
            padding: 12px;
            text-align: left;
            border-bottom: 1px solid #e5e7eb;
            vertical-align: top;
          }
          
          .ticket-table th {
            background-color: #f9fafb;
            font-weight: 600;
            color: #374151;
            cursor: pointer;
            position: sticky;
            top: 0;
            z-index: 10;
          }
          
          .ticket-table th:hover {
            background-color: #f3f4f6;
          }
          
          .ticket-table tr:hover {
            background-color: #f9fafb;
          }
          
          .status-open { background-color: #fef2f2; }
          .status-in-progress { background-color: #fffbeb; }
          .status-resolved { background-color: #f0fdf4; }
          .status-closed { background-color: #f9fafb; }
          
          .stat-card {
            background: white;
            border-radius: 8px;
            padding: 1.5rem;
            box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
            text-align: center;
          }
          
          .stat-number {
            font-size: 2rem;
            font-weight: bold;
            color: #1f2937;
          }
          
          .stat-label {
            color: #6b7280;
            font-size: 0.875rem;
            margin-top: 0.5rem;
          }
        `}
      </style>

      <div style={{ 
        display: 'flex', 
        justifyContent: 'space-between', 
        alignItems: 'center', 
        marginBottom: '2rem' 
      }}>
        <h1 style={{ margin: 0, color: '#1f2937' }}>Ticket Management System</h1>
        <button 
          onClick={loadTicketData}
          style={{
            padding: '0.5rem 1rem',
            backgroundColor: '#3b82f6',
            color: 'white',
            border: 'none',
            borderRadius: '6px',
            cursor: 'pointer'
          }}
        >
          🔄 Refresh
        </button>
      </div>

      {error && (
        <div style={{
          backgroundColor: '#fee2e2',
          border: '1px solid #fecaca',
          color: '#dc2626',
          padding: '1rem',
          borderRadius: '6px',
          marginBottom: '1rem'
        }}>
          <h3>❌ Error: {error}</h3>
          <p>Please check your server connection or contact support if the issue persists.</p>
          <button 
            onClick={loadTicketData}
            style={{
              padding: '0.5rem 1rem',
              backgroundColor: '#dc2626',
              color: 'white',
              border: 'none',
              borderRadius: '4px',
              cursor: 'pointer'
            }}
          >
            🔄 Retry
          </button>
        </div>
      )}

      <div style={{ 
        display: 'grid', 
        gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', 
        gap: '1rem', 
        marginBottom: '2rem' 
      }}>
        <div className="stat-card">
          <div className="stat-number">{stats.total}</div>
          <div className="stat-label">Total Tickets</div>
        </div>
        <div className="stat-card">
          <div className="stat-number" style={{ color: '#ef4444' }}>{stats.open}</div>
          <div className="stat-label">Open</div>
        </div>
        <div className="stat-card">
          <div className="stat-number" style={{ color: '#f59e0b' }}>{stats.inProgress}</div>
          <div className="stat-label">In Progress</div>
        </div>
        <div className="stat-card">
          <div className="stat-number" style={{ color: '#10b981' }}>{stats.resolved}</div>
          <div className="stat-label">Resolved</div>
        </div>
        <div className="stat-card">
          <div className="stat-number" style={{ color: '#6b7280' }}>{stats.closed}</div>
          <div className="stat-label">Closed</div>
        </div>
        <div className="stat-card">
          <div className="stat-number">{stats.avgDaysPending}</div>
          <div className="stat-label">Avg Days Pending</div>
        </div>
      </div>

      {tickets.length > 0 && (
        <div style={{ 
          display: 'grid', 
          gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', 
          gap: '1rem', 
          marginBottom: '1rem',
          padding: '1rem',
          backgroundColor: '#f9fafb',
          borderRadius: '8px'
        }}>
          <div>
            <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: '500' }}>Search</label>
            <input
              type="text"
              placeholder="Search tickets..."
              value={filters.search}
              onChange={(e) => setFilters(prev => ({ ...prev, search: e.target.value }))}
              style={{
                width: '100%',
                padding: '0.5rem',
                border: '1px solid #d1d5db',
                borderRadius: '4px'
              }}
            />
          </div>
          <div>
            <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: '500' }}>Date</label>
            <input
              type="date"
              value={filters.date}
              onChange={(e) => setFilters(prev => ({ ...prev, date: e.target.value }))}
              style={{
                width: '100%',
                padding: '0.5rem',
                border: '1px solid #d1d5db',
                borderRadius: '4px'
              }}
            />
          </div>
          <div>
            <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: '500' }}>Outlet</label>
            <select
              value={filters.outlet}
              onChange={(e) => setFilters(prev => ({ ...prev, outlet: e.target.value }))}
              style={{
                width: '100%',
                padding: '0.5rem',
                border: '1px solid #d1d5db',
                borderRadius: '4px'
              }}
            >
              <option value="">All Outlets</option>
              {filterOptions.outlets.map(outlet => (
                <option key={outlet} value={outlet}>{outlet}</option>
              ))}
            </select>
          </div>
          <div>
            <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: '500' }}>Status</label>
            <select
              value={filters.status}
              onChange={(e) => setFilters(prev => ({ ...prev, status: e.target.value }))}
              style={{
                width: '100%',
                padding: '0.5rem',
                border: '1px solid #d1d5db',
                borderRadius: '4px'
              }}
            >
              <option value="">All Statuses</option>
              {filterOptions.statuses.map(status => (
                <option key={status} value={status}>{status}</option>
              ))}
            </select>
          </div>
          <div>
            <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: '500' }}>Assignee</label>
            <select
              value={filters.assignee}
              onChange={(e) => setFilters(prev => ({ ...prev, assignee: e.target.value }))}
              style={{
                width: '100%',
                padding: '0.5rem',
                border: '1px solid #d1d5db',
                borderRadius: '4px'
              }}
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
        <div style={{ textAlign: 'center', marginBottom: '1rem' }}>
          <button 
            onClick={clearAllFilters}
            style={{
              padding: '0.5rem 1rem',
              backgroundColor: '#6b7280',
              color: 'white',
              border: 'none',
              borderRadius: '4px',
              cursor: 'pointer'
            }}
          >
            🧹 Clear All Filters
          </button>
        </div>
      )}

      <div style={{ overflowX: 'auto' }}>
        {!error && tickets.length === 0 ? (
          <div style={{ 
            textAlign: 'center', 
            padding: '3rem',
            backgroundColor: '#f9fafb',
            borderRadius: '8px'
          }}>
            <div style={{ fontSize: '3rem', marginBottom: '1rem' }}>🎫</div>
            <h3>No tickets found</h3>
            <p>No ticket data is available in your Google Sheets yet.</p>
            <button 
              onClick={loadTicketData}
              style={{
                padding: '0.5rem 1rem',
                backgroundColor: '#3b82f6',
                color: 'white',
                border: 'none',
                borderRadius: '4px',
                cursor: 'pointer'
              }}
            >
              🔄 Refresh Data
            </button>
          </div>
        ) : filteredTickets.length === 0 && tickets.length > 0 ? (
          <div style={{ 
            textAlign: 'center', 
            padding: '3rem',
            backgroundColor: '#f9fafb',
            borderRadius: '8px'
          }}>
            <div style={{ fontSize: '3rem', marginBottom: '1rem' }}>🔍</div>
            <h3>No tickets match your filters</h3>
            <p>Try adjusting or clearing your filters above.</p>
            <button 
              onClick={clearAllFilters}
              style={{
                padding: '0.5rem 1rem',
                backgroundColor: '#6b7280',
                color: 'white',
                border: 'none',
                borderRadius: '4px',
                cursor: 'pointer'
              }}
            >
              🧹 Clear Filters
            </button>
          </div>
        ) : (
          <table className="ticket-table">
            <thead>
              <tr>
                <th onClick={() => handleSort('ticketId')} style={{ cursor: 'pointer' }}>
                  Ticket ID {sortField === 'ticketId' && (sortDirection === 'asc' ? '↑' : '↓')}
                </th>
                <th onClick={() => handleSort('date')} style={{ cursor: 'pointer' }}>
                  Date {sortField === 'date' && (sortDirection === 'asc' ? '↑' : '↓')}
                </th>
                <th onClick={() => handleSort('outlet')} style={{ cursor: 'pointer' }}>
                  Outlet {sortField === 'outlet' && (sortDirection === 'asc' ? '↑' : '↓')}
                </th>
                <th onClick={() => handleSort('submittedBy')} style={{ cursor: 'pointer' }}>
                  Submitted By {sortField === 'submittedBy' && (sortDirection === 'asc' ? '↑' : '↓')}
                </th>
                <th>Issue Description</th>
                <th onClick={() => handleSort('status')} style={{ cursor: 'pointer' }}>
                  Status {sortField === 'status' && (sortDirection === 'asc' ? '↑' : '↓')}
                </th>
                <th onClick={() => handleSort('daysPending')} style={{ cursor: 'pointer' }}>
                  Days Pending {sortField === 'daysPending' && (sortDirection === 'asc' ? '↑' : '↓')}
                </th>
                <th>Assigned To / Action</th>
                <th>Action Taken</th>
                <th>Status Management</th>
              </tr>
            </thead>
            <tbody>
              {filteredTickets.map(ticket => (
                <tr 
                  key={ticket.ticketId} 
                  className={`status-${ticket.status.toLowerCase().replace(' ', '-')}`}
                >
                  <td style={{ fontWeight: '600' }}>#{ticket.ticketId}</td>
                  <td>{formatDate(ticket.date)}</td>
                  <td>{ticket.outlet}</td>
                  <td>{ticket.submittedBy}</td>
                  <td style={{ maxWidth: '300px' }}>
                    <div style={{ marginBottom: '0.5rem' }}>{ticket.issueDescription}</div>
                    {ticket.imageLink && (
                      <button 
                        onClick={() => {
                          setSelectedImage(ticket.imageLink);
                          setImageError(false);
                        }}
                        style={{
                          padding: '0.25rem 0.5rem',
                          backgroundColor: '#3b82f6',
                          color: 'white',
                          border: 'none',
                          borderRadius: '4px',
                          fontSize: '0.75rem',
                          cursor: 'pointer'
                        }}
                      >
                        📎 View Image
                      </button>
                    )}
                  </td>
                  <td>
                    <span 
                      style={{ 
                        backgroundColor: getStatusColor(ticket.status),
                        color: 'white',
                        padding: '0.25rem 0.5rem',
                        borderRadius: '12px',
                        fontSize: '0.75rem',
                        fontWeight: '500'
                      }}
                    >
                      {getStatusIcon(ticket.status)} {ticket.status}
                    </span>
                  </td>
                  <td>
                    <span 
                      style={{ 
                        color: ticket.daysPending > 7 ? '#dc2626' : ticket.daysPending > 3 ? '#f59e0b' : '#10b981',
                        fontWeight: '500'
                      }}
                    >
                      {ticket.daysPending} day{ticket.daysPending !== 1 ? 's' : ''}
                    </span>
                  </td>
                  <td>
                    {ticket.status === 'Open' ? (
                      <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                        <select
                          value={assignmentInputs[ticket.ticketId] || ''}
                          onChange={(e) => setAssignmentInputs(prev => ({
                            ...prev,
                            [ticket.ticketId]: e.target.value
                          }))}
                          disabled={assignmentLoading[ticket.ticketId]}
                          style={{
                            padding: '0.25rem',
                            border: '1px solid #d1d5db',
                            borderRadius: '4px',
                            fontSize: '0.875rem'
                          }}
                        >
                          <option value="">Select assignee...</option>
                          {ASSIGNEE_OPTIONS.map(name => (
                            <option key={name} value={name}>{name}</option>
                          ))}
                        </select>
                        <button
                          onClick={() => assignTicket(ticket.ticketId, assignmentInputs[ticket.ticketId])}
                          disabled={!assignmentInputs[ticket.ticketId]?.trim() || assignmentLoading[ticket.ticketId]}
                          style={{
                            padding: '0.25rem 0.5rem',
                            backgroundColor: '#10b981',
                            color: 'white',
                            border: 'none',
                            borderRadius: '4px',
                            cursor: 'pointer',
                            fontSize: '0.875rem'
                          }}
                        >
                          {assignmentLoading[ticket.ticketId] ? '...' : 'Assign'}
                        </button>
                      </div>
                    ) : (
                      <div style={{ fontWeight: '500' }}>{ticket.assignedTo || 'Unassigned'}</div>
                    )}
                  </td>
                  <td>
                    <textarea
                      value={actionInputs[ticket.ticketId] || ''}
                      onChange={(e) => setActionInputs(prev => ({
                        ...prev,
                        [ticket.ticketId]: e.target.value
                      }))}
                      placeholder="Describe action taken..."
                      style={{
                        width: '100%',
                        minHeight: '60px',
                        padding: '0.5rem',
                        border: '1px solid #d1d5db',
                        borderRadius: '4px',
                        fontSize: '0.875rem',
                        resize: 'vertical'
                      }}
                    />
                  </td>
                  <td>
                    <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                      <select
                        value={statusInputs[ticket.ticketId] || ticket.status}
                        onChange={(e) => setStatusInputs(prev => ({
                          ...prev,
                          [ticket.ticketId]: e.target.value
                        }))}
                        style={{
                          padding: '0.25rem',
                          border: '1px solid #d1d5db',
                          borderRadius: '4px',
                          fontSize: '0.875rem'
                        }}
                      >
                        {STATUS_OPTIONS.map(status => (
                          <option key={status} value={status}>{status}</option>
                        ))}
                      </select>
                      <button
                        onClick={() => updateTicketStatus(
                          ticket.ticketId, 
                          statusInputs[ticket.ticketId], 
                          actionInputs[ticket.ticketId]
                        )}
                        disabled={statusLoading[ticket.ticketId]}
                        style={{
                          padding: '0.25rem 0.5rem',
                          backgroundColor: '#3b82f6',
                          color: 'white',
                          border: 'none',
                          borderRadius: '4px',
                          cursor: 'pointer',
                          fontSize: '0.875rem'
                        }}
                      >
                        {statusLoading[ticket.ticketId] ? '...' : 'Update'}
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {selectedImage && (
        <div 
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            backgroundColor: 'rgba(0, 0, 0, 0.8)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 1000
          }}
          onClick={() => setSelectedImage(null)}
        >
          <div 
            style={{
              position: 'relative',
              maxWidth: '90%',
              maxHeight: '90%',
              backgroundColor: 'white',
              borderRadius: '8px',
              padding: '1rem'
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <button 
              onClick={() => setSelectedImage(null)}
              style={{
                position: 'absolute',
                top: '-10px',
                right: '-10px',
                width: '30px',
                height: '30px',
                borderRadius: '50%',
                backgroundColor: '#dc2626',
                color: 'white',
                border: 'none',
                cursor: 'pointer',
                fontSize: '1.2rem',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center'
              }}
            >
              ×
            </button>
            {imageError ? (
              <div style={{ 
                textAlign: 'center', 
                padding: '2rem',
                color: '#6b7280'
              }}>
                <div style={{ fontSize: '3rem', marginBottom: '1rem' }}>🖼️</div>
                <h3>Image Not Available</h3>
                <p>The image could not be loaded. It may have been moved or deleted.</p>
                <p><strong>URL:</strong> {selectedImage}</p>
                <button 
                  onClick={() => setImageError(false)}
                  style={{
                    padding: '0.5rem 1rem',
                    backgroundColor: '#3b82f6',
                    color: 'white',
                    border: 'none',
                    borderRadius: '4px',
                    cursor: 'pointer'
                  }}
                >
                  Try Again
                </button>
              </div>
            ) : (
              <img 
                src={selectedImage}
                alt="Ticket Attachment"
                onError={handleImageError}
                style={{
                  maxWidth: '100%',
                  maxHeight: '100%',
                  objectFit: 'contain'
                }}
              />
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default TicketDashboard;