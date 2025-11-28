const express = require('express');
const { exec } = require('child_process');
const path = require('path');
const fs = require('fs');
const { authenticateToken, requireRole } = require('../middleware/auth');

const router = express.Router();

// All routes require admin authentication
router.use(authenticateToken);
router.use(requireRole('admin'));

// Database configuration
const DB_URI = 'mongodb://localhost:27017/laundry_db';
const DB_NAME = 'laundry_db';

// POST - Create database backup
router.post('/', async (req, res) => {
  try {
    const { backupDir = '../backups' } = req.body;

    // Create backup directory path
    const timestamp = Date.now();
    const backupPath = path.join(__dirname, backupDir, `backup-${timestamp}`);

    // Ensure backup directory exists
    const backupBaseDir = path.join(__dirname, backupDir);
    if (!fs.existsSync(backupBaseDir)) {
      fs.mkdirSync(backupBaseDir, { recursive: true });
    }

    // Build mongodump command
    const command = `mongodump --uri="${DB_URI}" --out="${backupPath}"`;

    // Execute mongodump
    exec(command, (error, stdout, stderr) => {
      if (error) {
        console.error('Backup error:', error);
        return res.status(500).json({ 
          error: 'Backup failed', 
          details: error.message 
        });
      }

      if (stderr) {
        console.error('Backup stderr:', stderr);
      }

      console.log('Backup stdout:', stdout);

      res.json({
        message: 'Database backup created successfully',
        backupPath: backupPath,
        timestamp: timestamp,
        database: DB_NAME
      });
    });
  } catch (error) {
    console.error('Backup route error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET - List all backups
router.get('/', async (req, res) => {
  try {
    const { backupDir = '../backups' } = req.query;
    const backupBaseDir = path.join(__dirname, backupDir);

    // Check if backup directory exists
    if (!fs.existsSync(backupBaseDir)) {
      return res.json({
        message: 'No backups found',
        backups: []
      });
    }

    // Read backup directory
    const files = fs.readdirSync(backupBaseDir);
    
    // Filter and map backup folders
    const backups = files
      .filter(file => {
        const filePath = path.join(backupBaseDir, file);
        return fs.statSync(filePath).isDirectory() && file.startsWith('backup-');
      })
      .map(file => {
        const filePath = path.join(backupBaseDir, file);
        const stats = fs.statSync(filePath);
        const timestamp = parseInt(file.replace('backup-', ''));
        
        return {
          name: file,
          path: filePath,
          timestamp: timestamp,
          date: new Date(timestamp).toISOString(),
          size: getDirectorySize(filePath)
        };
      })
      .sort((a, b) => b.timestamp - a.timestamp); // Sort by newest first

    res.json({
      message: 'Backups retrieved successfully',
      count: backups.length,
      backups: backups
    });
  } catch (error) {
    console.error('List backups error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// DELETE - Delete a specific backup
router.delete('/:backupName', async (req, res) => {
  try {
    const { backupName } = req.params;
    const { backupDir = '../backups' } = req.body;

    // Validate backup name format
    if (!backupName.startsWith('backup-')) {
      return res.status(400).json({ error: 'Invalid backup name format' });
    }

    const backupPath = path.join(__dirname, backupDir, backupName);

    // Check if backup exists
    if (!fs.existsSync(backupPath)) {
      return res.status(404).json({ error: 'Backup not found' });
    }

    // Delete backup directory recursively
    fs.rmSync(backupPath, { recursive: true, force: true });

    res.json({
      message: 'Backup deleted successfully',
      backupName: backupName
    });
  } catch (error) {
    console.error('Delete backup error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Helper function to calculate directory size
function getDirectorySize(dirPath) {
  let size = 0;
  
  try {
    const files = fs.readdirSync(dirPath);
    
    for (const file of files) {
      const filePath = path.join(dirPath, file);
      const stats = fs.statSync(filePath);
      
      if (stats.isDirectory()) {
        size += getDirectorySize(filePath);
      } else {
        size += stats.size;
      }
    }
  } catch (error) {
    console.error('Error calculating directory size:', error);
  }
  
  return size;
}

module.exports = router;
