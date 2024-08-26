const { app } = require('@azure/functions');
const { deactivateSubstitutions } = require('../lib/jobs/graphJobs');
const { logToDB } = require('../lib/jobs/logToDB');
const { logger } = require('@vtfk/logger');

app.http('deactivateSubstitutions-dev', {
    methods: ['GET'],
    authLevel: 'anonymous',
    handler: async (request, context) => {
        try {
            await deactivateSubstitutions(false, undefined, undefined, context)
        } catch (error) {
            logger('error', ['deactivateSubstitutions-dev', 'An error occured while trying to deactivate substitutions', error?.message || error])
            await logToDB('error', error?.message || error, undefined, context)
        }
    }
});
