const db = require("../db/connect");
const { getIO } = require("../socket");

class NotificationService {
  constructor() {
    this.handlers = new Set();
  }

  // Emit notifications via Socket.IO
  async emitNotification(notification) {
    const io = getIO();
    try {
      const room = `${notification.recipientType}_${notification.recipientId}`;
      io.to(room).emit("notification", notification);
      console.log(`Notification sent to room: ${room}`);
    } catch (error) {
      console.error("Error emitting notification:", error);
    }
  }

  // Create a notification in the database and emit via socket
  async createNotification({
    recipientId,
    recipientType,
    title,
    message,
    type,
    referenceId = null,
    referenceType = null,
  }) {
    return new Promise((resolve, reject) => {
      const query = `
        INSERT INTO notifications 
        (recipient_id, recipient_type, title, message, type, reference_id, reference_type)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `;

      db.query(
        query,
        [
          recipientId,
          recipientType,
          title,
          message,
          type,
          referenceId,
          referenceType,
        ],
        (error, results) => {
          if (error) {
            reject(error);
            return;
          }

          const notification = {
            id: results.insertId,
            recipientId,
            recipientType,
            title,
            message,
            type,
            referenceId,
            referenceType,
            isRead: false,
            createdAt: new Date(),
          };

          // Emit the notification via Socket.IO
          this.emitNotification(notification);

          resolve(notification);
        }
      );
    });
  }

  // Notify all admins
  async notifyAdmin({ title, message, type, referenceId = null, referenceType = null }) {
    return new Promise((resolve, reject) => {
      // Retrieve all admin users
      const query = `
        SELECT id AS recipient_id 
        FROM admin
      `;
  
      db.query(query, [], async (error, results) => {
        if (error) {
          reject(error);
          return;
        }
  
        try {
          // Use an arrow function to ensure the correct `this` context
          const notifications = await Promise.all(
            results.map(({ recipient_id }) =>
              this.createNotification({
                recipientId: "admin",
                recipientType: "admin",
                title,
                message,
                type,
                referenceId,
                referenceType,
              })
            )
          );
  
          resolve(notifications);
        } catch (err) {
          reject(err);
        }
      });
    });
  }
  

  async markAsRead(notificationId, recipientId) {
    return new Promise((resolve, reject) => {
      const query = `
        UPDATE notifications 
        SET is_read = TRUE 
        WHERE id = ? AND recipient_id = ?
      `;

      db.query(query, [notificationId, recipientId], (error) => {
        if (error) {
          reject(error);
          return;
        }
        resolve(true);
      });
    });
  }

  async getUserNotifications(userId, userType, page = 1, limit = 20) {
    return new Promise((resolve, reject) => {
      const offset = (page - 1) * limit;
      const query = `
        SELECT * FROM notifications 
        WHERE recipient_id = ? AND recipient_type = ?
        ORDER BY created_at DESC
        LIMIT ? OFFSET ?
      `;

      db.query(query, [userId, userType, limit, offset], (error, results) => {
        if (error) {
          reject(error);
          return;
        }
        resolve(results);
      });
    });
  }
}

module.exports = new NotificationService();
