// SharePoint Integration - Microsoft Graph Client
// Uses Replit connector for OAuth authentication

import { Client } from '@microsoft/microsoft-graph-client';

let connectionSettings: any;

async function getAccessToken() {
  if (connectionSettings && connectionSettings.settings.expires_at && new Date(connectionSettings.settings.expires_at).getTime() > Date.now()) {
    return connectionSettings.settings.access_token;
  }
  
  const hostname = process.env.REPLIT_CONNECTORS_HOSTNAME;
  const xReplitToken = process.env.REPL_IDENTITY 
    ? 'repl ' + process.env.REPL_IDENTITY 
    : process.env.WEB_REPL_RENEWAL 
    ? 'depl ' + process.env.WEB_REPL_RENEWAL 
    : null;

  if (!xReplitToken) {
    throw new Error('X_REPLIT_TOKEN not found for repl/depl');
  }

  connectionSettings = await fetch(
    'https://' + hostname + '/api/v2/connection?include_secrets=true&connector_names=sharepoint',
    {
      headers: {
        'Accept': 'application/json',
        'X_REPLIT_TOKEN': xReplitToken
      }
    }
  ).then(res => res.json()).then(data => data.items?.[0]);

  const accessToken = connectionSettings?.settings?.access_token || connectionSettings.settings?.oauth?.credentials?.access_token;

  if (!connectionSettings || !accessToken) {
    throw new Error('SharePoint not connected');
  }
  return accessToken;
}

// WARNING: Never cache this client.
// Access tokens expire, so a new client must be created each time.
// Always call this function again to get a fresh client.
export async function getUncachableSharePointClient() {
  const accessToken = await getAccessToken();

  return Client.initWithMiddleware({
    authProvider: {
      getAccessToken: async () => accessToken
    }
  });
}

// Check if SharePoint is connected
export async function isSharePointConnected(): Promise<boolean> {
  try {
    const hostname = process.env.REPLIT_CONNECTORS_HOSTNAME;
    const xReplitToken = process.env.REPL_IDENTITY 
      ? 'repl ' + process.env.REPL_IDENTITY 
      : process.env.WEB_REPL_RENEWAL 
      ? 'depl ' + process.env.WEB_REPL_RENEWAL 
      : null;

    if (!xReplitToken || !hostname) {
      return false;
    }

    const response = await fetch(
      'https://' + hostname + '/api/v2/connection?include_secrets=true&connector_names=sharepoint',
      {
        headers: {
          'Accept': 'application/json',
          'X_REPLIT_TOKEN': xReplitToken
        }
      }
    );
    
    const data = await response.json();
    const settings = data.items?.[0];
    const accessToken = settings?.settings?.access_token || settings?.settings?.oauth?.credentials?.access_token;
    
    return !!accessToken;
  } catch {
    return false;
  }
}

// Get SharePoint sites the user has access to
export async function getSharePointSites() {
  const client = await getUncachableSharePointClient();
  const response = await client.api('/sites?search=*').get();
  return response.value || [];
}

// Get drive (document library) items from a site
export async function getDriveItems(siteId: string, driveId?: string, itemPath?: string) {
  const client = await getUncachableSharePointClient();
  
  let endpoint = `/sites/${siteId}/drive/root/children`;
  
  if (driveId && itemPath) {
    endpoint = `/sites/${siteId}/drives/${driveId}/root:/${itemPath}:/children`;
  } else if (driveId) {
    endpoint = `/sites/${siteId}/drives/${driveId}/root/children`;
  } else if (itemPath) {
    endpoint = `/sites/${siteId}/drive/root:/${itemPath}:/children`;
  }
  
  const response = await client.api(endpoint).get();
  return response.value || [];
}

// Get drives (document libraries) for a site
export async function getDrives(siteId: string) {
  const client = await getUncachableSharePointClient();
  const response = await client.api(`/sites/${siteId}/drives`).get();
  return response.value || [];
}

// Get a download URL for a file
export async function getFileDownloadUrl(siteId: string, itemId: string) {
  const client = await getUncachableSharePointClient();
  const response = await client.api(`/sites/${siteId}/drive/items/${itemId}`).get();
  return response['@microsoft.graph.downloadUrl'];
}
