import { getAllChats, type Chat } from './chats';
import { getSnapshot, getVersionsByChatId } from './db';
import type { Snapshot } from './types';
import type { ProjectVersion } from '~/lib/stores/versions';
import { createScopedLogger } from '~/utils/logger';

const logger = createScopedLogger('AutoBackup');

const BACKUP_KEY_PREFIX = 'devonz_backup_';
const BACKUP_META_KEY = 'devonz_backup_meta';
const MAX_BACKUPS = 5;
const DEFAULT_INTERVAL_MS = 5 * 60 * 1000; // 5 minutes

interface BackupMeta {
  lastBackupTime: string;
  backupKeys: string[];
  chatCount: number;
}

export interface BackupData {
  _meta: {
    version: '1.0';
    createdAt: string;
    chatCount: number;
  };
  chats: Chat[];
  snapshots: Record<string, Snapshot>;
  versions: Record<string, ProjectVersion[]>;
}

function getBackupMeta(): BackupMeta | null {
  try {
    const raw = localStorage.getItem(BACKUP_META_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function setBackupMeta(meta: BackupMeta) {
  localStorage.setItem(BACKUP_META_KEY, JSON.stringify(meta));
}

/**
 * Create a full backup of all chats, snapshots, and versions.
 * Stores in localStorage with rotation (keeps last MAX_BACKUPS).
 */
export async function createBackup(db: IDBDatabase): Promise<string | null> {
  try {
    const chats = await getAllChats(db);

    if (chats.length === 0) {
      return null;
    }

    const snapshots: Record<string, Snapshot> = {};
    const versions: Record<string, ProjectVersion[]> = {};

    for (const chat of chats) {
      try {
        const snapshot = await getSnapshot(db, chat.id);

        if (snapshot) {
          snapshots[chat.id] = snapshot;
        }

        const chatVersions = await getVersionsByChatId(db, chat.id);

        if (chatVersions) {
          versions[chat.id] = chatVersions;
        }
      } catch {
        // Skip individual chat errors -- partial backup is better than none
      }
    }

    const backup: BackupData = {
      _meta: {
        version: '1.0',
        createdAt: new Date().toISOString(),
        chatCount: chats.length,
      },
      chats,
      snapshots,
      versions,
    };

    const backupKey = `${BACKUP_KEY_PREFIX}${Date.now()}`;
    const serialized = JSON.stringify(backup);

    try {
      localStorage.setItem(backupKey, serialized);
    } catch (e) {
      // localStorage full -- evict oldest backups and retry
      const meta = getBackupMeta();

      if (meta?.backupKeys.length) {
        const toRemove = meta.backupKeys.slice(0, Math.max(1, Math.floor(meta.backupKeys.length / 2)));

        for (const key of toRemove) {
          localStorage.removeItem(key);
        }

        meta.backupKeys = meta.backupKeys.filter((k) => !toRemove.includes(k));
        setBackupMeta(meta);

        try {
          localStorage.setItem(backupKey, serialized);
        } catch {
          logger.error('Backup failed: localStorage full even after eviction');
          return null;
        }
      } else {
        logger.error('Backup failed: localStorage full', e);
        return null;
      }
    }

    // Update metadata and rotate old backups
    const meta = getBackupMeta() || { lastBackupTime: '', backupKeys: [], chatCount: 0 };
    meta.backupKeys.push(backupKey);
    meta.lastBackupTime = new Date().toISOString();
    meta.chatCount = chats.length;

    while (meta.backupKeys.length > MAX_BACKUPS) {
      const oldest = meta.backupKeys.shift()!;
      localStorage.removeItem(oldest);
    }

    setBackupMeta(meta);
    logger.info(`Backup created: ${chats.length} chats, ${Object.keys(snapshots).length} snapshots`);

    return backupKey;
  } catch (error) {
    logger.error('Backup failed:', error);
    return null;
  }
}

/**
 * Download the latest backup (or a fresh one) as a JSON file.
 */
export async function downloadBackup(db: IDBDatabase): Promise<void> {
  const chats = await getAllChats(db);

  if (chats.length === 0) {
    return;
  }

  const snapshots: Record<string, Snapshot> = {};
  const versions: Record<string, ProjectVersion[]> = {};

  for (const chat of chats) {
    try {
      const snapshot = await getSnapshot(db, chat.id);

      if (snapshot) {
        snapshots[chat.id] = snapshot;
      }

      const chatVersions = await getVersionsByChatId(db, chat.id);

      if (chatVersions) {
        versions[chat.id] = chatVersions;
      }
    } catch {
      // Skip individual errors
    }
  }

  const backup: BackupData = {
    _meta: {
      version: '1.0',
      createdAt: new Date().toISOString(),
      chatCount: chats.length,
    },
    chats,
    snapshots,
    versions,
  };

  const blob = new Blob([JSON.stringify(backup, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `devonz-backup-${new Date().toISOString().replace(/[:.]/g, '-')}.json`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

/**
 * List available backups from localStorage.
 */
export function listBackups(): { key: string; createdAt: string; chatCount: number }[] {
  const meta = getBackupMeta();

  if (!meta) {
    return [];
  }

  return meta.backupKeys
    .map((key) => {
      try {
        const raw = localStorage.getItem(key);

        if (!raw) {
          return null;
        }

        const data = JSON.parse(raw) as BackupData;

        return {
          key,
          createdAt: data._meta.createdAt,
          chatCount: data._meta.chatCount,
        };
      } catch {
        return null;
      }
    })
    .filter(Boolean) as { key: string; createdAt: string; chatCount: number }[];
}

/**
 * Restore chats from a backup key in localStorage.
 * Returns the parsed BackupData for the caller to import.
 */
export function loadBackup(backupKey: string): BackupData | null {
  try {
    const raw = localStorage.getItem(backupKey);

    if (!raw) {
      return null;
    }

    return JSON.parse(raw) as BackupData;
  } catch {
    logger.error(`Failed to load backup: ${backupKey}`);
    return null;
  }
}

let backupInterval: ReturnType<typeof setInterval> | null = null;

/**
 * Start periodic auto-backup. Safe to call multiple times (idempotent).
 */
export function startAutoBackup(db: IDBDatabase, intervalMs = DEFAULT_INTERVAL_MS) {
  stopAutoBackup();

  // Initial backup after a short delay to avoid blocking startup
  setTimeout(() => createBackup(db), 10_000);

  backupInterval = setInterval(() => createBackup(db), intervalMs);
  logger.info(`Auto-backup started (every ${Math.round(intervalMs / 60_000)}min)`);
}

/**
 * Stop periodic auto-backup.
 */
export function stopAutoBackup() {
  if (backupInterval) {
    clearInterval(backupInterval);
    backupInterval = null;
  }
}
