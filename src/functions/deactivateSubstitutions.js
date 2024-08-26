const { app } = require('@azure/functions');
const config = require('../../config');
const { deactivateSubstitutions } = require('../lib/jobs/graphJobs');
const { logToDB } = require('../lib/jobs/logToDB');
const { logger } = require('@vtfk/logger');

app.timer('deactivateSubstitutions', {
    schedule: '*/15 22-23,0-2 * * *', // At every 15th minute past every hour from 22 through 23 and every hour from 0 through 2.
    handler: async (context) => {
        if(['true', true].includes(config.APP_DEACTIVATE_TIMERS)) return;
        try {
            await deactivateSubstitutions(false, undefined, undefined, context)
        } catch (error) {
            logger('error', ['deactivateSubstitutions', 'An error occured while trying to deactivate substitutions', error?.message || error])
            await logToDB('error', error, undefined, context)
        }
    }
});
