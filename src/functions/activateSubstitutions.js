const { app } = require('@azure/functions')
const config = require('../../config')
const { activateSubstitutions } = require('../lib/jobs/graphJobs')
const { logToDB } = require('../lib/jobs/logToDB')
const { logger } = require('@vtfk/logger')

app.timer('activateSubstitutions', {
  schedule: '0 */15 * * * *',
  handler: async (context) => {
    if (['true', true].includes(config.APP_DEACTIVATE_TIMERS)) return
    try {
      await activateSubstitutions(false, undefined, context)
    } catch (error) {
      logger('error', ['activateSubstitutions', 'An error occured while trying to activate substitutions', error?.message || error])
      await logToDB('error', error, undefined, context)
    }
  }
})
