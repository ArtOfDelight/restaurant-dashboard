import React, { useState, useEffect, useCallback } from 'react';
import './TicketDashboard.css';

const API_URL = process.env.REACT_APP_API_BASE_URL || 'http://localhost:5000';

// Helper functions
const formatDateForDisplay = (dateStr) => {
  if (!dateStr) return '';
  
  try {
    if (dateStr.includes('-')) {
      return dateStr;
    }
    
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
      weekday: 'short',
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });
  } catch (e) {
    return dateStr;
  }
};

const formatTime = (timestampStr) => {
  if (!timestampStr) return 'N/A';
  try {
    return new Date(timestampStr).toLocaleTimeString('en-US', {
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch (e) {
    return timestampStr;
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
  const [filters, setFilters] = useState({
    date: '',
    outlet: '',
    status: '',
    assignee: '',
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

    const fetchWithValidation = async (url) => {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 15000);
      
      try {
        const response = await fetch(url, { 
          signal: controller.signal,
          headers: {
            'Accept': 'application/json',
            'Content-Type': 'application/json'
          }
        });
        
        clearTimeout(timeoutId);
        
        if (!response.ok) {
          const errorText = await response.text();
          throw new Error(`HTTP ${response.status}: ${errorText}`);
        }
        
        const contentType = response.headers.get('content-type');
        if (!contentType || !contentType.includes('application/json')) {
          const text = await response.text();
          throw new Error(`Server returned non-JSON response: ${text.slice(0, 500)}`);
        }
        
        return response.json();
      } catch (err) {
        clearTimeout(timeoutId);
        if (err.name === 'AbortError') {
          throw new Error('Request timed out');
        }
        throw err;
      }
    };

    const fetchWithRetry = async (url, retries = 3, delay = 1000) => {
      for (let i = 0; i < retries; i++) {
        try {
          return await fetchWithValidation(url);
        } catch (err) {
          if (i < retries - 1) {
            await new Promise(resolve => setTimeout(resolve, delay));
            continue;
          }
          throw err;
        }
      }
    };

    try {
      const baseUrl = API_URL;
      const ticketEndpoint = `${baseUrl}/api/ticket-data`;

      let data;
      try {
        data = await fetchWithRetry(ticketEndpoint);
      } catch (mainError) {
        // Fallback to debug endpoint if main endpoint fails
        const debugEndpoint = `${baseUrl}/api/debug-tickets`;
        const debugData = await fetchWithRetry(debugEndpoint);
        if (debugData.success) {
          data = {
            success: true,
            tickets: transformTicketData(debugData.ticketsData),
          };
        } else {
          throw new Error(`Debug endpoint error: ${debugData.error || 'Unknown error'}`);
        }
      }

      if (data.success) {
        const ticketsArray = Array.isArray(data.tickets) ? data.tickets : [];
        
        try {
          localStorage.setItem('cachedTickets', JSON.stringify(ticketsArray));
          localStorage.setItem('ticketCacheTimestamp', new Date().toISOString());
        } catch (cacheErr) {
          console.warn('Failed to cache ticket data:', cacheErr.message);
        }

        setTickets(ticketsArray);
        updateFilterOptions(ticketsArray);
      } else {
        throw new Error(data.error || 'API returned error');
      }
    } catch (err) {
      setError(`Failed to load tickets: ${err.message}. Please check the server or try again.`);
      
      try {
        const cachedTickets = localStorage.getItem('cachedTickets');
        const cacheTimestamp = localStorage.getItem('ticketCacheTimestamp');
        
        if (cachedTickets) {
          const parsedTickets = JSON.parse(cachedTickets);
          
          if (Array.isArray(parsedTickets)) {
            setTickets(parsedTickets);
            updateFilterOptions(parsedTickets);
            setError(`Using cached data from ${cacheTimestamp ? new Date(cacheTimestamp).toLocaleString() : 'unknown time'}. ${err.message}`);
          }
        }
      } catch (cacheErr) {
        console.warn('Failed to load cached ticket data:', cacheErr.message);
        setTickets([]);
      }
      
      setFilterOptions({
        outlets: [],
        assignees: [],
        statuses: ['Open', 'In Progress', 'Resolved'],
      });
    } finally {
      setLoading(false);
    }
  }, [updateFilterOptions]);

  useEffect(() => {
    try {
      const cachedTickets = localStorage.getItem('cachedTickets');
      if (cachedTickets) {
        const parsedTickets = JSON.parse(cachedTickets);
        if (Array.isArray(parsedTickets)) {
          setTickets(parsedTickets);
          updateFilterOptions(parsedTickets);
        }
      }
    } catch (cacheErr) {
      console.warn('Failed to load cached ticket data:', cacheErr.message);
    }
    loadTicketData();
    const interval = setInterval(loadTicketData, 5 * 60 * 1000);
    return () => clearInterval(interval);
  }, [loadTicketData]);

  const getFilteredTickets = () => {
    return tickets.filter(ticket => {
      return (
        (!filters.date || ticket.date === filters.date) &&
        (!filters.outlet || ticket.outlet === filters.outlet) &&
        (!filters.status || ticket.status === filters.status) &&
        (!filters.assignee || ticket.assignedTo === filters.assignee)
      );
    });
  };

  const assignTicket = async (ticketId, assigneeName) => {
    if (!assigneeName.trim()) {
      alert('Please enter an assignee name');
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
        // Update local state
        setTickets(prevTickets => 
          prevTickets.map(ticket => 
            ticket.ticketId === ticketId 
              ? { ...ticket, assignedTo: assigneeName.trim(), status: 'In Progress' }
              : ticket
          )
        );
        
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

  const clearAllFilters = () => {
    setFilters({ date: '', outlet: '', status: '', assignee: '' });
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

  const getImageUrl = (imageLink) => {
    if (!imageLink || !imageLink.trim()) return null;
    
    const baseUrl = API_URL;
    
    if (imageLink.startsWith('/api/image-proxy/')) {
      return `${baseUrl}${imageLink}`;
    }
    
    if (imageLink.startsWith('http') && imageLink.includes('/api/image-proxy/')) {
      return imageLink;
    }
    
    if (imageLink.startsWith('http')) {
      const fileIdMatch = imageLink.match(/\/file\/d\/([a-zA-Z0-9-_]+)/);
      if (fileIdMatch) {
        return `${baseUrl}/api/image-proxy/${fileIdMatch[1]}`;
      }
    }
    
    if (imageLink.match(/^[a-zA-Z0-9-_]+$/)) {
      return `${baseUrl}/api/image-proxy/${imageLink}`;
    }
    
    return null;
  };

  const filteredTickets = getFilteredTickets();
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

      {tickets.length > 0 && (filters.date || filters.outlet || filters.status || filters.assignee) && (
        <div style={{ textAlign: 'center', marginBottom: '20px' }}>
          <button 
            onClick={clearAllFilters}
            style={{
              background: '#6b7280',
              color: 'white',
              border: 'none',
              padding: '10px 20px',
              borderRadius: '20px',
              cursor: 'pointer',
              fontSize: '0.9rem',
            }}
          >
            🧹 Clear All Filters
          </button>
        </div>
      )}

      <div className="tickets-list">
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
          filteredTickets
            .sort((a, b) => {
              // Sort by status priority (Open > In Progress > Resolved), then by date
              const statusOrder = { 'Open': 0, 'In Progress': 1, 'Resolved': 2 };
              const statusA = statusOrder[a.status] || 3;
              const statusB = statusOrder[b.status] || 3;
              
              if (statusA !== statusB) {
                return statusA - statusB;
              }
              
              return new Date(b.date) - new Date(a.date);
            })
            .map(ticket => (
              <TicketCard
                key={ticket.ticketId}
                ticket={ticket}
                onAssign={assignTicket}
                assignmentLoading={assignmentLoading[ticket.ticketId] || false}
                onImageClick={setSelectedImage}
                formatDate={formatDate}
                formatTime={formatTime}
                getStatusIcon={getStatusIcon}
                getStatusColor={getStatusColor}
                getImageUrl={getImageUrl}
              />
            ))
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
            <img src={selectedImage} alt="Ticket Attachment" />
          </div>
        </div>
      )}
    </div>
  );
};

// Ticket Card Component
const TicketCard = ({ 
  ticket, 
  onAssign,
  assignmentLoading,
  onImageClick,
  formatDate,
  formatTime,
  getStatusIcon,
  getStatusColor,
  getImageUrl,
}) => {
  const [assigneeName, setAssigneeName] = useState('');
  const [imageError, setImageError] = useState(false);
  
  const handleAssign = () => {
    if (assigneeName.trim()) {
      onAssign(ticket.ticketId, assigneeName.trim());
      setAssigneeName('');
    }
  };

  const imageUrl = getImageUrl(ticket.imageLink);

  const handleImageError = () => {
    setImageError(true);
  };

  return (
    <div className="ticket-card">
      <div className="ticket-card-header">
        <div className="ticket-info">
          <h3>Ticket #{ticket.ticketId}</h3>
          <div className="ticket-meta">
            <span className="ticket-date">{formatDate(ticket.date)}</span>
            <span className="ticket-outlet">{ticket.outlet}</span>
            <span className="ticket-submitter">{ticket.submittedBy}</span>
          </div>
        </div>
        <div className="ticket-status-section">
          <div 
            className="status-badge"
            style={{ backgroundColor: getStatusColor(ticket.status) }}
          >
            {getStatusIcon(ticket.status)} {ticket.status}
          </div>
          <div className="days-pending">
            {ticket.daysPending} day{ticket.daysPending !== 1 ? 's' : ''} pending
          </div>
        </div>
      </div>

      <div className="ticket-details">
        <div className="detail-row">
          <span className="detail-label">Issue Description:</span>
          <span className="detail-value">{ticket.issueDescription || 'No description provided'}</span>
        </div>
        
        {ticket.assignedTo && (
          <div className="detail-row">
            <span className="detail-label">Assigned To:</span>
            <span className="detail-value assigned-user">{ticket.assignedTo}</span>
          </div>
        )}

        {imageUrl && (
          <div className="detail-row">
            <span className="detail-label">Attachment:</span>
            <div className="image-attachment">
              {!imageError ? (
                <img
                  src={imageUrl}
                  alt="Ticket Attachment"
                  className="ticket-image"
                  onClick={() => onImageClick(imageUrl)}
                  onError={handleImageError}
                />
              ) : (
                <div className="image-error">
                  🖼️ Image unavailable
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {ticket.status === 'Open' && (
        <div className="assignment-section">
          <div className="assignment-form">
            <input
              type="text"
              value={assigneeName}
              onChange={(e) => setAssigneeName(e.target.value)}
              placeholder="Enter assignee name..."
              className="assign-input"
              disabled={assignmentLoading}
            />
            <button
              onClick={handleAssign}
              disabled={!assigneeName.trim() || assignmentLoading}
              className="assign-btn"
            >
              {assignmentLoading ? 'Assigning...' : 'Assign Ticket'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export default TicketDashboard;