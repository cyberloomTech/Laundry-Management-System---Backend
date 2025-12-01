const express = require('express');
const { exec } = require('child_process');
const path = require('path');
const fs = require('fs');
const { authenticateToken, requireRole } = require('../middleware/auth');
const BackupConfig = require('../models/BackupConfig');

const router = express.Router();

// All routes require admin authentication
router.use(authenticateToken);

// Database configuration
const DB_URI = 'mongodb://localhost:27017/laundry_db';
const DB_NAME = 'laundry_db';

// Store interval reference
let backupInterval = null;

// Function to perform backup
const performBackup = async (backupDir) => {
  return new Promise((resolve, reject) => {
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const day = String(now.getDate()).padStart(2, '0');
    const hours = String(now.getHours()).padStart(2, '0');
    const minutes = String(now.getMinutes()).padStart(2, '0');
    const seconds = String(now.getSeconds()).padStart(2, '0');
    const dateFormat = `${year}${month}${day}${hours}${minutes}${seconds}`;
    
    const backupPath = path.join(__dirname, '..', backupDir, `backup-${dateFormat}`);
    const backupBaseDir = path.join(__dirname, '..', backupDir);
    
    if (!fs.existsSync(backupBaseDir)) {
      fs.mkdirSync(backupBaseDir, { recursive: true });
    }

    const possiblePaths = [
      'mongodump',
      'C:\\Program Files\\MongoDB\\Tools\\100\\bin\\mongodump.exe',
      'C:\\Program Files\\MongoDB\\Server\\7.0\\bin\\mongodump.exe',
      'C:\\Program Files\\MongoDB\\Server\\6.0\\bin\\mongodump.exe'
    ];

    let mongodumpCmd = 'mongodump';
    for (const cmdPath of possiblePaths) {
      if (cmdPath !== 'mongodump' && fs.existsSync(cmdPath)) {
        mongodumpCmd = `"${cmdPath}"`;
        break;
      }
    }

    const command = `${mongodumpCmd} --uri="${DB_URI}" --out="${backupPath}"`;
    
    exec(command, { 
      maxBuffer: 1024 * 1024 * 10,
      timeout: 60000,
      shell: true,
      windowsHide: true
    }, (error, stdout, stderr) => {
      setTimeout(() => {
        if (!fs.existsSync(backupPath)) {
          return reject(new Error('Backup directory was not created'));
        }

        const dbPath = path.join(backupPath, DB_NAME);
        if (fs.existsSync(dbPath)) {
          const files = fs.readdirSync(dbPath);
          if (files.length > 0) {
            return resolve({
              message: 'Database backup created successfully',
              backupPath: backupPath,
              backupName: `backup-${dateFormat}`,
              database: DB_NAME,
              filesCount: files.length
            });
          }
        }
        reject(new Error('Backup files were not created properly'));
      }, 1500);
    });
  });
};

// Function to schedule automatic backups
const scheduleBackup = async () => {
  try {
    const config = await BackupConfig.findOne();
    if (!config || !config.autoBackupEnabled) {
      if (backupInterval) {
        clearInterval(backupInterval);
        backupInterval = null;
      }
      return;
    }

    // Clear existing interval
    if (backupInterval) {
      clearInterval(backupInterval);
    }

    // Set new interval
    const intervalMs = config.backupInterval * 60 * 60 * 1000; // Convert hours to milliseconds
    backupInterval = setInterval(async () => {
      try {
        console.log('Running automatic backup...');
        await performBackup(config.backupPath);
        
        // Update last backup time
        config.lastBackupTime = new Date();
        config.nextBackupTime = new Date(Date.now() + intervalMs);
        await config.save();
        
        console.log('Automatic backup completed successfully');
      } catch (err) {
        console.error('Automatic backup failed:', err);
      }
    }, intervalMs);

    console.log(`Automatic backup scheduled every ${config.backupInterval} hours`);
  } catch (err) {
    console.error('Error scheduling backup:', err);
  }
};

// Initialize backup schedule on server start
scheduleBackup();

// GET - Get backup configuration
router.get('/config', async (req, res) => {
  try {
    let config = await BackupConfig.findOne();
    if (!config) {
      config = await BackupConfig.create({});
    }
    res.json({ config });
  } catch (error) {
    console.error('Get config error:', error);
    res.status(500).json({ error: 'Failed to get backup configuration' });
  }
});

// PUT - Update backup configuration
router.put('/config', requireRole('admin'), async (req, res) => {
  try {
    const { autoBackupEnabled, backupInterval, backupPath } = req.body;
    
    let config = await BackupConfig.findOne();
    if (!config) {
      config = await BackupConfig.create({});
    }

    if (autoBackupEnabled !== undefined) config.autoBackupEnabled = autoBackupEnabled;
    if (backupInterval !== undefined) config.backupInterval = backupInterval;
    if (backupPath !== undefined) config.backupPath = backupPath;

    // Calculate next backup time if auto backup is enabled
    if (config.autoBackupEnabled) {
      const intervalMs = config.backupInterval * 60 * 60 * 1000;
      config.nextBackupTime = new Date(Date.now() + intervalMs);
    } else {
      config.nextBackupTime = null;
    }

    await config.save();
    
    // Reschedule backups
    await scheduleBackup();

    res.json({ 
      message: 'Backup configuration updated successfully',
      config 
    });
  } catch (error) {
    console.error('Update config error:', error);
    res.status(500).json({ error: 'Failed to update backup configuration' });
  }
});

// POST - Create database backup
router.post('/', async (req, res) => {
  try {
    const { backupDir = '../backups' } = req.body;
    
    const result = await performBackup(backupDir);
    
    // Update last backup time in config
    let config = await BackupConfig.findOne();
    if (config) {
      config.lastBackupTime = new Date();
      await config.save();
    }
    
    res.json(result);
  } catch (error) {
    console.error('Backup route error:', error);
    res.status(500).json({ 
      error: 'Backup failed', 
      details: error.message 
    });
  }
});

// GET - Select backup folder (returns full path)
router.get('/select-folder', requireRole('admin'), async (req, res) => {
  try {
    const { dialog } = require('node-file-dialog');
    
    const result = await dialog({ type: 'directory' });
    
    if (result && result.length > 0) {
      const selectedPath = result[0];
      res.json({ 
        success: true, 
        path: selectedPath 
      });
    } else {
      res.status(400).json({ 
        success: false, 
        error: 'No folder selected' 
      });
    }
  } catch (error) {
    console.error('Folder selection error:', error);
    res.status(500).json({ 
      success: false, 
      error: 'Failed to open folder dialog',
      details: error.message 
    });
  }
});

module.exports = router;
