const { fylke, statistics } = require('../../../config')
const { default: axios } = require('axios')
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
  const data = await axios.post(`${statistics.url}/Stats`, statObj, { headers: { 'x-functions-key': `${statistics.key}` } })

  if (data.status === 200) {
    logger('info', [logPrefix, 'Statistics created'])
    return true
  } else {
    logger('warn', [logPrefix, 'Creating statistics failed'])
    return false
  }
}
