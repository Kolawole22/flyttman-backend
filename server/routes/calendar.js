const express = require('express');
const router = express.Router();
const { 
  getCalendarMoves, 
  sendMoveReminders 
} = require('../controllers/calendarController');

// Get all moves for calendar view
router.get('/moves', getCalendarMoves);

// Send reminders for tomorrow's moves
router.post('/send-reminders', sendMoveReminders);

module.exports = router; 