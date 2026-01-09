const { fylke, statistics } = require('../../../config')
const { logger } = require('@vtfk/logger')

module.exports = async (stat) => {
  const logPrefix = 'createStats'
  logger('info', [logPrefix, `Creating statistics for each ${stat.status} substitution`])
  const statObj = {
    system: 'VikarApp',
    engine: 'azf-vikarapp-api',
    county: fylke.fylke,
    company: 'OF',
    department: stat.teamId,
    description: stat.description,
    status: stat.status,
    type: 'VikarApp'
  }

  const response = await fetch(`${statistics.url}/Stats`, {
    method: 'POST',
    headers: {
      'X-Functions-Key': statistics.key
    },
    body: JSON.stringify(statObj)
  })

  if (!response.ok) {
    const errorData = await response.json()
    logger('error', [logPrefix, `Failed to create statistics for ${stat.status} substitution. Status: ${response.status} - ${response.statusText}:`, statObj, '-> ErrorData:', errorData])
    return false
  }

  logger('info', [logPrefix, `Successfully created statistics for ${stat.status} substitution. Status: ${response.status} :`, statObj])
  return response.status === 200
}
