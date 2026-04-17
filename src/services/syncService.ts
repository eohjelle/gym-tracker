export interface SyncProvider {
  push(dbPath: string): Promise<void>;
  getLastSyncTimestamp(): Promise<Date | null>;
}

/**
 * Placeholder iCloud sync implementation.
 * Actual iCloud Drive sync requires:
 * - Apple Developer account
 * - iCloud entitlement in app.json
 * - Development build (not Expo Go)
 *
 * This can be swapped for a home server implementation in the future.
 */
export class ICloudSyncProvider implements SyncProvider {
  async push(_dbPath: string): Promise<void> {
    // TODO: Implement iCloud Drive file copy
    // Uses expo-file-system to copy the .db file to the iCloud container
    console.log('iCloud sync not yet implemented');
  }

  async getLastSyncTimestamp(): Promise<Date | null> {
    // TODO: Read modification date of the synced file
    return null;
  }
}

let currentProvider: SyncProvider = new ICloudSyncProvider();

export function setSyncProvider(provider: SyncProvider): void {
  currentProvider = provider;
}

export function getSyncProvider(): SyncProvider {
  return currentProvider;
}
