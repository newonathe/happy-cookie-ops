# Flow: Bazaar: lose connection, sell offline, reconnect, sync

**ACTUAL application.** Started at `/bazaar`, fixture `bazaar:planned`, simulated server. See [the README](../../README.md).

## p390 (390×844): captured

Controls the flow looked for and did not find here: 2. Listed in manifest.json.

### 1. online

`/bazaar?bazaar=till` · heading: Sell at the bazaar

![online at p390](../../flows/bazaar-offline-sync/01-online/p390.webp)

[Full page](../../flows/bazaar-offline-sync/01-online/p390.full.webp)

### 2. offline

`/bazaar?bazaar=till` · heading: Sell at the bazaar · says: Offline · sales are being saved on this device

![offline at p390](../../flows/bazaar-offline-sync/02-offline/p390.webp)

### 3. sale-queued: Queued in the real IndexedDB queue through the real OfflineBridge

`/bazaar?bazaar=till` · heading: Sell at the bazaar · says: Offline · sales are being saved on this device
Sync now

![sale-queued at p390](../../flows/bazaar-offline-sync/03-sale-queued/p390.webp)

### 4. two-queued

`/bazaar?bazaar=till` · heading: Sell at the bazaar · says: Offline · sales are being saved on this device
Sync now

![two-queued at p390](../../flows/bazaar-offline-sync/04-two-queued/p390.webp)

### 5. close-blocked-while-unsent: What Close day says with sales unsent

`/bazaar?bazaar=till` · heading: Sell at the bazaar · says: Offline · sales are being saved on this device
Sync now

![close-blocked-while-unsent at p390](../../flows/bazaar-offline-sync/05-close-blocked-while-unsent/p390.webp)

### 6. reconnected: After connection returns

`/bazaar?bazaar=till` · heading: Sell at the bazaar

![reconnected at p390](../../flows/bazaar-offline-sync/06-reconnected/p390.webp)

[Full page](../../flows/bazaar-offline-sync/06-reconnected/p390.full.webp)

### 7. synced

`/bazaar?bazaar=till` · heading: Sell at the bazaar

![synced at p390](../../flows/bazaar-offline-sync/07-synced/p390.webp)

[Full page](../../flows/bazaar-offline-sync/07-synced/p390.full.webp)

## d1440 (1440×900): captured

Controls the flow looked for and did not find here: 2. Listed in manifest.json.

### 1. online

`/bazaar?bazaar=till` · heading: Sell at the bazaar

![online at d1440](../../flows/bazaar-offline-sync/01-online/d1440.webp)

[Full page](../../flows/bazaar-offline-sync/01-online/d1440.full.webp)

### 2. offline

`/bazaar?bazaar=till` · heading: Sell at the bazaar · says: Offline · sales are being saved on this device

![offline at d1440](../../flows/bazaar-offline-sync/02-offline/d1440.webp)

### 3. sale-queued: Queued in the real IndexedDB queue through the real OfflineBridge

`/bazaar?bazaar=till` · heading: Sell at the bazaar · says: Offline · sales are being saved on this device
Sync now

![sale-queued at d1440](../../flows/bazaar-offline-sync/03-sale-queued/d1440.webp)

### 4. two-queued

`/bazaar?bazaar=till` · heading: Sell at the bazaar · says: Offline · sales are being saved on this device
Sync now

![two-queued at d1440](../../flows/bazaar-offline-sync/04-two-queued/d1440.webp)

### 5. close-blocked-while-unsent: What Close day says with sales unsent

`/bazaar?bazaar=till` · heading: Sell at the bazaar · says: Offline · sales are being saved on this device
Sync now

![close-blocked-while-unsent at d1440](../../flows/bazaar-offline-sync/05-close-blocked-while-unsent/d1440.webp)

### 6. reconnected: After connection returns

`/bazaar?bazaar=till` · heading: Sell at the bazaar

![reconnected at d1440](../../flows/bazaar-offline-sync/06-reconnected/d1440.webp)

[Full page](../../flows/bazaar-offline-sync/06-reconnected/d1440.full.webp)

### 7. synced

`/bazaar?bazaar=till` · heading: Sell at the bazaar

![synced at d1440](../../flows/bazaar-offline-sync/07-synced/d1440.webp)

[Full page](../../flows/bazaar-offline-sync/07-synced/d1440.full.webp)
