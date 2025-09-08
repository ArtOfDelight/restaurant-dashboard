import React, { useState, useEffect, useCallback } from 'react';
import './TicketDashboard.css';

const API_URL = process.env.REACT_APP_API_BASE_URL || 'http://localhost:5000';

// Predefined assignee names
const ASSIGNEE_OPTIONS = ['Jatin', 'Nishat', 'Kim', 'Ajay', 'Ayaaz', 'Sharon'];

// Helper functions (same as before)
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
  const [assignmentInputs, setAssignmentInputs] = useState({});
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

  const [filterOptions, setFilterOptions] = useState({
    outlets: [],
    assignees: [],
    statuses: ['Open', 'In Progress', 'Resolved'],
  });

  const updateFilterOptions = useCallback((ticketsData) => {
    const outlets = [...new Set(ticketsData.map(t => t.outlet).filter(Boolean))];
    const assignees = [...new Set(ticketsData.map(t => t.assignedTo).filter(Boolean))];
    
    setFilterOptions(prev => ({
      ...prev,
      outlets: outlets.sort(),
      assignees: assignees.sort(),
      statuses: ['Open', 'In Progress', 'Resolved'],
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
        
        // Initialize assignment inputs for open tickets
        const inputs = {};
        ticketsArray.forEach(ticket => {
          if (ticket.status === 'Open') {
            inputs[ticket.ticketId] = '';
          }
        });
        setAssignmentInputs(inputs);
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

    // Sort the filtered results
    filtered.sort((a, b) => {
      let aVal = a[sortField];
      let bVal = b[sortField];
      
      // Handle special sorting cases
      if (sortField === 'daysPending') {
        aVal = parseInt(aVal) || 0;
        bVal = parseInt(bVal) || 0;
      } else if (sortField === 'date') {
        aVal = new Date(aVal);
        bVal = new Date(bVal);
      } else if (sortField === 'status') {
        // Sort by status priority: Open > In Progress > Resolved
        const statusOrder = { 'Open': 0, 'In Progress': 1, 'Resolved': 2 };
        aVal = statusOrder[aVal] || 3;
        bVal = statusOrder[bVal] || 3;
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
      default: return '❓';
    }
  };

  const getStatusColor = (status) => {
    switch (status) {
      case 'Open': return '#ef4444';
      case 'In Progress': return '#f59e0b';
      case 'Resolved': return '#10b981';
      default: return '#6b7280';
    }
  };

  const clearAllFilters = () => {
    setFilters({ date: '', outlet: '', status: '', assignee: '', search: '' });
  };

  const filteredTickets = getFilteredAndSortedTickets();
  const stats = {
    total: tickets.length,
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
        <p>Loading ticket data...</p>
      </div>
    );
  }

  return (
    <div className="ticket-dashboard">
      <div className="ticket-header">
        <h1>Ticket Management System</h1>
        <button onClick={loadTicketData} className="refresh-btn">
          🔄 Refresh
        </button>
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
          <div className="stat-label">Total Tickets</div>
        </div>
        <div className="stat-card open">
          <div className="stat-number">{stats.open}</div>
          <div className="stat-label">Open</div>
        </div>
        <div className="stat-card in-progress">
          <div className="stat-number">{stats.inProgress}</div>
          <div className="stat-label">In Progress</div>
        </div>
        <div className="stat-card resolved">
          <div className="stat-number">{stats.resolved}</div>
          <div className="stat-label">Resolved</div>
        </div>
        <div className="stat-card">
          <div className="stat-number">{stats.avgDaysPending}</div>
          <div className="stat-label">Avg Days Pending</div>
        </div>
      </div>

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
        <div style={{ textAlign: 'center', marginBottom: '20px' }}>
          <button onClick={clearAllFilters} className="clear-filters-btn">
            🧹 Clear All Filters
          </button>
        </div>
      )}

      <div className="tickets-table-container">
        {!error && tickets.length === 0 ? (
          <div className="no-data">
            <div className="no-data-icon">🎫</div>
            <h3>No tickets found</h3>
            <p>No ticket data is available in your Google Sheets yet.</p>
            <button onClick={loadTicketData} className="refresh-btn">
              🔄 Refresh Data
            </button>
          </div>
        ) : filteredTickets.length === 0 && tickets.length > 0 ? (
          <div className="no-data">
            <div className="no-data-icon">🔍</div>
            <h3>No tickets match your filters</h3>
            <p>Try adjusting or clearing your filters above.</p>
            <button onClick={clearAllFilters} className="refresh-btn">
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
                <th>Assigned To / Action</th>
              </tr>
            </thead>
            <tbody>
              {filteredTickets.map(ticket => (
                <tr key={ticket.ticketId} className={`ticket-row status-${ticket.status.toLowerCase().replace(' ', '-')}`}>
                  <td className="ticket-id">#{ticket.ticketId}</td>
                  <td className="ticket-date">{formatDate(ticket.date)}</td>
                  <td className="ticket-outlet">{ticket.outlet}</td>
                  <td className="ticket-submitter">{ticket.submittedBy}</td>
                  <td className="ticket-description">
                    <div className="description-text">{ticket.issueDescription}</div>
                    {ticket.imageLink && (
                      <button 
                        className="image-btn" 
                        onClick={() => setSelectedImage(ticket.imageLink)}
                        title="View attached image"
                      >
                        Ticket Attachment
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
                          className="assign-btn-inline"
                        >
                          {assignmentLoading[ticket.ticketId] ? '...' : '→'}
                        </button>
                      </div>
                    ) : (
                      <div className="assigned-user">{ticket.assignedTo || 'Unassigned'}</div>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

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