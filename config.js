/*
  Export config
*/
module.exports = {
  USE_MOCK: process.env.USE_MOCK || false,
  APP_DEACTIVATE_TIMERS: process.env.APP_DEACTIVATE_TIMERS || false,
  NODE_ENV: process.env.NODE_ENV || 'development',
  searchGroupId: process.env.NODE_ENV !== 'test' ? process.env.AZURE_SEARCH_GROUP_ID : '123',
  APIKEYS_MINIMUM_LENGTH: process.env.APIKEYS_MINIMUM_LENGTH || 5,
  APIKEYS: process.env.APIKEYS || '12345',
  azureApplication: {
    tenantId: process.env.AZURE_APP_TENANT_ID,
    clientId: process.env.AZURE_APP_ID,
    clientSecret: process.env.AZURE_APP_SECRET,
    scope: process.env.AZURE_APP_SCOPE || 'https://graph.microsoft.com/.default',
    grantType: process.env.AZURE_APP_GRANT_TYPE || 'client_credentials',
    issuer: `https://sts.windows.net/${process.env.AZURE_APP_TENANT_ID}/`,
    jwkUri: `https://login.microsoftonline.com/${process.env.AZURE_APP_TENANT_ID}/discovery/v2.0/keys`,
    audience: process.env.AZURE_APP_AUDIENCE || 'Audience'
  },
  mongoDB: {
    MONGODB_CONNECTION_STRING: process.env.MONGODB_CONNECTION_STRING,
    SDS_MONGODB_CONNECTIONSTRING: process.env.SDS_MONGODB_CONNECTIONSTRING,
    DB_NAME: process.env.MONGODB_DB_NAME,
    SUBSTITUTIONS_COLLECTION: process.env.MONGODB_SUBSTITUTIONS_COLLECTION,
    LOG_COLLECTION: process.env.MONGODB_LOG_COLLECTION,
    SCHOOLS_COLLECTION: process.env.MONGODB_SCHOOLS_COLLECTION
  },
  statistics: {
    url: process.env.STATISTICS_URL,
    key: process.env.STATISTICS_KEY
  },
  fylke: {
    fylke: process.env.FYLKE
  }
}
